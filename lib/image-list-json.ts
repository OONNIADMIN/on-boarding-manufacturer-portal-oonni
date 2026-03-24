import { resolveImageKitDeliveryUrl } from "@/lib/imagekit";

export function mimeToListFileType(mime: string | undefined): string {
  if (!mime) return "";
  const m = mime.toLowerCase();
  if (m.includes("jpeg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("bmp")) return ".bmp";
  return "";
}

/** JSON-safe row for image list UIs (no BigInt). */
export function serializeImageForListJson(img: {
  id: number;
  manufacturer_id: number;
  user_id: number;
  product_id: number | null;
  original_filename: string;
  s3_key: string;
  s3_url: string;
  imagekit_file_id: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  optimized: number;
  created_at: Date;
  updated_at: Date;
  file_size: bigint;
  manufacturer?: unknown;
  product?: unknown;
}) {
  const s3_url = resolveImageKitDeliveryUrl(img.s3_url, img.s3_key);
  return {
    id: img.id,
    manufacturer_id: img.manufacturer_id,
    user_id: img.user_id,
    product_id: img.product_id,
    original_filename: img.original_filename,
    s3_key: img.s3_key,
    s3_url,
    imagekit_file_id: img.imagekit_file_id,
    mime_type: img.mime_type,
    width: img.width,
    height: img.height,
    optimized: img.optimized === 1,
    created_at: img.created_at,
    updated_at: img.updated_at,
    manufacturer: img.manufacturer,
    product: img.product,
    size_bytes: Number(img.file_size),
    last_modified: img.updated_at.toISOString(),
    file_type: mimeToListFileType(img.mime_type),
  };
}
