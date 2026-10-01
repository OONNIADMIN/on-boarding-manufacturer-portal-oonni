import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { listSystemErrorLogs, unexpectedError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) {
    if (error === "Admin access required") return forbidden(error);
    return unauthorized(error ?? undefined);
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
  const q = (searchParams.get("q") || "").trim();

  try {
    const { total, rows } = await listSystemErrorLogs({ page, limit, q });

    const userIds = [...new Set(rows.map((row) => row.user_id).filter((id): id is number => id != null))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return ok({
      logs: rows.map((row) => ({
        id: row.public_id,
        source: row.source,
        message: row.message,
        stack: row.stack,
        path: row.path,
        user_id: row.user_id,
        user_email: row.user_id ? userById.get(row.user_id)?.email ?? null : null,
        user_name: row.user_id ? userById.get(row.user_id)?.name ?? null : null,
        manufacturer_id: row.manufacturer_id,
        created_at: row.created_at.toISOString(),
      })),
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e) {
    return unexpectedError(e, { source: "admin-logs", userId: user.id });
  }
}
