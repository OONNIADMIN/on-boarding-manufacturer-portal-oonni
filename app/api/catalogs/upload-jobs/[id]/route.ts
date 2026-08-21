import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { ok, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { serializeImportJob } from "@/lib/catalog-import-job";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const job = await prisma.catalogImportJob.findUnique({ where: { public_id: id } });
  if (!job) return notFound("Import job not found");

  if (!isAdminUser(user) && job.user_id !== user.id) return forbidden("Access denied");

  return ok(serializeImportJob(job));
}
