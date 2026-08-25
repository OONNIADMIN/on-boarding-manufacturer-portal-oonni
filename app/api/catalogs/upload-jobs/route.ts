import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { serializeImportJob } from "@/lib/catalog-import-job";

const ACTIVE_IMPORT_STATUSES = [
  "queued",
  "analyzing",
  "creating_products",
  "saving_file",
  "importing_images",
];
const RECENT_FINISHED_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const recentSince = new Date(Date.now() - RECENT_FINISHED_MS);
  const jobs = await prisma.catalogImportJob.findMany({
    where: {
      user_id: user.id,
      OR: [
        { status: { in: ACTIVE_IMPORT_STATUSES } },
        { status: { in: ["completed", "failed"] }, finished_at: { gte: recentSince } },
      ],
    },
    orderBy: { created_at: "desc" },
    take: 8,
  });

  return ok(jobs.map(serializeImportJob));
}
