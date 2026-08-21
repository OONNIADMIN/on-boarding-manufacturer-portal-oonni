import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { serializeImportJob } from "@/lib/catalog-import-job";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const jobs = await prisma.catalogImportJob.findMany({
    where: isAdminUser(user) ? {} : { user_id: user.id },
    orderBy: { created_at: "desc" },
    take: 8,
  });

  return ok(jobs.map(serializeImportJob));
}
