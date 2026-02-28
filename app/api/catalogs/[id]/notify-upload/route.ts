import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendCatalogUploadNotification } from "@/lib/email";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const catalog = await prisma.catalog.findUnique({
    where: { id: parseInt(id, 10) },
    include: { manufacturer: true },
  });
  if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

  const isAdmin = user.role.name === "admin";
  const isOwn = user.manufacturer_id === catalog.manufacturer_id;
  if (!isAdmin && !isOwn) return forbidden("Access denied");

  const adminUsers = await prisma.user.findMany({
    where: { role: { name: "admin" }, is_active: 1 },
    select: { email: true },
  });

  const adminEmails = adminUsers.map((a) => a.email);
  if (adminEmails.length) {
    sendCatalogUploadNotification({
      adminEmails,
      manufacturerName: catalog.manufacturer?.name ?? "Unknown",
      userName: user.name,
      userEmail: user.email,
      catalogName: catalog.name,
      fileType: catalog.catalog_file?.split(".").pop()?.toUpperCase() ?? "Unknown",
      fileSize: "N/A",
      catalogId: catalog.id,
      imagesUploaded: body.images_uploaded ?? undefined,
      imagesFailed: body.images_failed ?? undefined,
    }).catch(console.error);
  }

  return ok({ message: "Notification sent", catalog_id: catalog.id });
}
