import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicSupportMessage, SUPPORT_CONTACT_URL } from "@/lib/support";

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
  message: string;
  stack: string | null;
  path: string | null;
  user_id: number | null;
  manufacturer_id: number | null;
  created_at: Date;
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

function errorLogDelegate() {
  const delegate = prisma.systemErrorLog;
  if (!delegate?.create || !delegate?.count || !delegate?.findMany) return null;
  return delegate;
}

/** Persist the technical error. Returns a short reference id immediately. */
export function recordSystemError(error: unknown, context: SystemErrorContext): string {
  const publicId = newLogId();
  const row = {
    public_id: publicId,
    source: context.source.slice(0, 120),
    message: errorText(error).slice(0, 8000),
    stack: errorStack(error),
    path: context.path?.slice(0, 500) ?? null,
    user_id: context.userId ?? null,
    manufacturer_id: context.manufacturerId ?? null,
  };
  void persistSystemError(row).catch((persistError) => {
    console.error("Failed to persist system error log:", persistError);
    console.error(context.source, error);
  });
  return publicId;
}

async function persistSystemError(row: {
  public_id: string;
  source: string;
  message: string;
  stack: string | null;
  path: string | null;
  user_id: number | null;
  manufacturer_id: number | null;
}) {
  const delegate = errorLogDelegate();
  if (delegate) {
    await delegate.create({ data: row });
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO system_error_logs (public_id, source, message, stack, path, user_id, manufacturer_id)
    VALUES (${row.public_id}, ${row.source}, ${row.message}, ${row.stack}, ${row.path}, ${row.user_id}, ${row.manufacturer_id})
  `;
}

export async function listSystemErrorLogs(options: {
  page: number;
  limit: number;
  q: string;
}): Promise<{ total: number; rows: SystemErrorLogRecord[] }> {
  const { page, limit, q } = options;
  const delegate = errorLogDelegate();
  const where = q
    ? {
        OR: [
          { public_id: { contains: q, mode: "insensitive" as const } },
          { source: { contains: q, mode: "insensitive" as const } },
          { message: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  if (delegate) {
    const [total, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { total, rows };
  }

  const offset = (page - 1) * limit;
  const filter = q
    ? Prisma.sql`WHERE public_id ILIKE ${`%${q}%`} OR source ILIKE ${`%${q}%`} OR message ILIKE ${`%${q}%`}`
    : Prisma.empty;
  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM system_error_logs ${filter}
    `,
    prisma.$queryRaw<SystemErrorLogRecord[]>`
      SELECT id, public_id, source, message, stack, path, user_id, manufacturer_id, created_at
      FROM system_error_logs
      ${filter}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
  ]);
  return { total: Number(countRows[0]?.count ?? 0), rows };
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
