import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { INVENTORY_BULK_ACTIVE_STATUSES, serializeInventoryBulkJob } from "@/lib/inventory-bulk-job";

const RECENT_FINISHED_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const recentSince = new Date(Date.now() - RECENT_FINISHED_MS);
  const jobs = await prisma.inventoryBulkJob.findMany({
    where: {
      user_id: user.id,
      OR: [
        { status: { in: [...INVENTORY_BULK_ACTIVE_STATUSES] } },
        { status: { in: ["completed", "failed"] }, finished_at: { gte: recentSince } },
      ],
    },
    orderBy: { created_at: "desc" },
    take: 8,
  });

  return ok(jobs.map(serializeInventoryBulkJob));
}
