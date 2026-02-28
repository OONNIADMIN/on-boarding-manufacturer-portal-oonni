import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uploadToImageKit } from "@/lib/imagekit";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { slugify } from "@/lib/api-response";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");

    if (!file) return err("No file provided");
    if (!manufacturerIdRaw) return err("manufacturer_id is required");

    const manufacturerId = parseInt(String(manufacturerIdRaw), 10);

    if (!ALLOWED_TYPES.includes(file.type)) return err(`Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.length > MAX_SIZE) return err("File exceeds 10MB limit");

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) return notFound("Manufacturer not found");

    const isAdmin = user.role.name === "admin";
    const isOwn = user.manufacturer_id === manufacturerId;
    if (!isAdmin && !isOwn) return forbidden("No permission to upload images for this manufacturer");

    const mfrSlug = slugify(manufacturer.name);
    const folder = `/${mfrSlug}/images`;
    const fileName = file.name;

    const uploaded = await uploadToImageKit(buffer, fileName, folder, file.type);

    const image = await prisma.image.create({
      data: {
        manufacturer_id: manufacturerId,
        user_id: user.id,
        original_filename: file.name,
        s3_key: uploaded.filePath,
        s3_url: uploaded.url,
        imagekit_file_id: uploaded.fileId,
        file_size: buffer.length,
        mime_type: file.type,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        optimized: 1,
      },
      include: { manufacturer: true, user: { include: { role: true } } },
    });

    return ok({
      ...image,
      imagekit_file_id: uploaded.fileId,
      imagekit_url: uploaded.url,
    });
  } catch (e) {
    console.error("Image upload error:", e);
    return err("Failed to upload image", 500);
  }
}
