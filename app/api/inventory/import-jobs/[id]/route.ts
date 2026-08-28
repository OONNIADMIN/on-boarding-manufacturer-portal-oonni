import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { serializeInventoryBulkJob } from "@/lib/inventory-bulk-job";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const job = await prisma.inventoryBulkJob.findUnique({ where: { public_id: id } });
  if (!job) return notFound("Import job not found");
  if (job.user_id !== user.id) return forbidden("Access denied");

  return ok(serializeInventoryBulkJob(job));
}
