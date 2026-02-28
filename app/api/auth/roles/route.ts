import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return unauthorized(error);
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  return ok(roles);
}
