import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminUser, effectiveManufacturerId, requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage, uploadToImageKit } from "@/lib/imagekit";
import { ok, err, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";
import { serializeImageForListJson } from "@/lib/image-list-json";
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, UPLOAD_LIMIT } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  contentLengthTooLarge,
  fileTooLarge,
  rejectIfLimited,
} from "@/lib/request-limits";
import { imageUploadMeta, safeUploadFileName } from "@/lib/upload-file-guard";
import { parsePositiveInt } from "@/lib/inventory-access";

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);
  const limited = rejectIfLimited(`upload-image:${user.id}:${clientIp(req)}`, UPLOAD_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;
  if (contentLengthTooLarge(req)) return err("File exceeds 10MB limit", 413);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const manufacturerIdRaw = formData.get("manufacturer_id");

    if (!file) return err("No file provided");
    if (fileTooLarge(file.size)) return err("File exceeds 10MB limit", 413);
    if (!manufacturerIdRaw) return err("manufacturer_id is required");

    const manufacturerId = parsePositiveInt(String(manufacturerIdRaw), "manufacturer_id");
    if (!manufacturerId) return err("Invalid manufacturer_id");

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.length > MAX_UPLOAD_BYTES) return err("File exceeds 10MB limit", 413);

    const meta = imageUploadMeta(buffer);
    if (!meta) return err("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");

    const manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId } });
    if (!manufacturer || manufacturer.deleted_at) return notFound("Manufacturer not found");

    const isAdmin = isAdminUser(user);
    const isOwn = effectiveManufacturerId(user) === manufacturerId;
    if (!isAdmin && !isOwn) return forbidden("No permission to upload images for this manufacturer");

    const folder = manufacturerImageKitImagesFolder(manufacturer);
    const fileName = safeUploadFileName(file.name, meta.ext);

    const uploaded = await uploadToImageKit(buffer, fileName, folder, meta.mime);

    const image = await prisma.image.create({
      data: {
        manufacturer_id: manufacturerId,
        user_id: user.id,
        original_filename: fileName,
        s3_key: uploaded.filePath,
        s3_url: uploaded.url,
        imagekit_file_id: uploaded.fileId,
        file_size: buffer.length,
        mime_type: meta.mime,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        optimized: 1,
      },
      include: { manufacturer: true, user: { include: { role: true } } },
    });

    return ok({
      ...serializeImageForListJson(image),
      imagekit_file_id: uploaded.fileId,
      imagekit_url: uploaded.url,
    });
  } catch (e) {
    console.error("Image upload error:", e);
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    return err("Failed to upload image", 500);
  }
}
