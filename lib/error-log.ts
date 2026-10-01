import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicSupportMessage, SUPPORT_CONTACT_URL } from "@/lib/support";

export type SystemLogLevel = "error" | "ok";

export type SystemErrorContext = {
  source: string;
  path?: string | null;
  userId?: number | null;
  manufacturerId?: number | null;
};

export type SystemErrorLogRecord = {
  id: number;
  public_id: string;
  source: string;
  level: SystemLogLevel;
  message: string;
  stack: string | null;
  path: string | null;
  user_id: number | null;
  manufacturer_id: number | null;
  created_at: Date;
};

type PersistLogRow = {
  public_id: string;
  source: string;
  level: SystemLogLevel;
  message: string;
  stack: string | null;
  path: string | null;
  user_id: number | null;
  manufacturer_id: number | null;
};

function newLogId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Unexpected error";
}

function errorStack(error: unknown): string | null {
  if (error instanceof Error && error.stack) return error.stack.slice(0, 16_000);
  return null;
}

function normalizeLevel(value: unknown): SystemLogLevel {
  return value === "ok" ? "ok" : "error";
}

function enqueuePersist(row: PersistLogRow, context: SystemErrorContext) {
  void persistSystemLog(row).catch((persistError) => {
    console.error("Failed to persist system log:", persistError);
    console.error(context.source, row.message);
  });
}

/** Persist the technical error. Returns a short reference id immediately. */
export function recordSystemError(error: unknown, context: SystemErrorContext): string {
  const publicId = newLogId();
  enqueuePersist(
    {
      public_id: publicId,
      source: context.source.slice(0, 120),
      level: "error",
      message: errorText(error).slice(0, 8000),
      stack: errorStack(error),
      path: context.path?.slice(0, 500) ?? null,
      user_id: context.userId ?? null,
      manufacturer_id: context.manufacturerId ?? null,
    },
    context
  );
  return publicId;
}

/** Persist a successful operation so admins can confirm the flow completed. */
export function recordSystemOk(message: string, context: SystemErrorContext): string {
  const publicId = newLogId();
  enqueuePersist(
    {
      public_id: publicId,
      source: context.source.slice(0, 120),
      level: "ok",
      message: message.trim().slice(0, 8000) || "OK",
      stack: null,
      path: context.path?.slice(0, 500) ?? null,
      user_id: context.userId ?? null,
      manufacturer_id: context.manufacturerId ?? null,
    },
    context
  );
  return publicId;
}

async function persistSystemLog(row: PersistLogRow) {
  await prisma.$executeRaw`
    INSERT INTO system_error_logs (public_id, source, level, message, stack, path, user_id, manufacturer_id)
    VALUES (${row.public_id}, ${row.source}, ${row.level}, ${row.message}, ${row.stack}, ${row.path}, ${row.user_id}, ${row.manufacturer_id})
  `;
}

export async function listSystemErrorLogs(options: {
  page: number;
  limit: number;
  q: string;
}): Promise<{ total: number; rows: SystemErrorLogRecord[] }> {
  const { page, limit, q } = options;
  const offset = (page - 1) * limit;
  const filter = q
    ? Prisma.sql`WHERE public_id ILIKE ${`%${q}%`} OR source ILIKE ${`%${q}%`} OR message ILIKE ${`%${q}%`} OR level ILIKE ${`%${q}%`}`
    : Prisma.empty;
  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM system_error_logs ${filter}
    `,
    prisma.$queryRaw<Array<SystemErrorLogRecord & { level?: string | null }>>`
      SELECT id, public_id, source, level, message, stack, path, user_id, manufacturer_id, created_at
      FROM system_error_logs
      ${filter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
  ]);
  return {
    total: Number(countRows[0]?.count ?? 0),
    rows: rows.map((row) => ({ ...row, level: normalizeLevel(row.level) })),
  };
}

export function supportErrorPayload(referenceId: string) {
  return {
    detail: publicSupportMessage(referenceId),
    support_url: SUPPORT_CONTACT_URL,
    log_id: referenceId,
  };
}

/** Log the technical error and return the generic support response for the user. */
export function unexpectedError(
  error: unknown,
  context: SystemErrorContext,
  status = 500
): NextResponse {
  console.error(context.source, error);
  const referenceId = recordSystemError(error, context);
  return NextResponse.json(supportErrorPayload(referenceId), { status });
}
