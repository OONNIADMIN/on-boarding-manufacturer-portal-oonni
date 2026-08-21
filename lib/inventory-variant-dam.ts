import { prisma } from "@/lib/db";
import {
  canonicalImageKitUrl,
  isImageKitPublicUrl,
  isImageKitUploadConfigured,
  uploadToImageKit,
} from "@/lib/imagekit";
import { manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";
import {
  assertHttpUrlForFetch,
  fetchRemoteHttpUrl,
  filenameFromUrl,
  MAX_REMOTE_IMAGE_BYTES,
  normalizeMimeType,
} from "@/lib/remote-image-import";
import { isTraideImageId, parseVariantImages, toInventoryImages } from "@/lib/traide/mappers/variant-images";

const IMPORT_IMAGE_PRE_TRANSFORM = "w-1600,h-1600,c-at_max,q-80";

export type DamInventoryImage = { id: string | null; url: string };

/**
 * Upload new variant images into the manufacturer ImageKit DAM folder (same path as catalog
 * image ingest / Images page). Already-public ImageKit URLs are kept. Traide must receive
 * the ImageKit public URL returned by upload.
 */
export async function ensureVariantImagesInImageKit(params: {
  manufacturerId: number;
  userId: number;
  images: unknown;
}): Promise<{ images: DamInventoryImage[]; errors: string[] }> {
  const manufacturer = await prisma.manufacturer.findFirst({
    where: { id: params.manufacturerId, deleted_at: null },
    select: { id: true, slug: true, imagekit_media_root: true },
  });
  if (!manufacturer) {
    return { images: [], errors: ["Manufacturer not found"] };
  }

  const parsed = parseVariantImages(params.images, params.images);
  if (!parsed.length) return { images: [], errors: [] };

  const keepAsIs = parsed.filter(
    (image) => (image.id && isTraideImageId(image.id)) || isImageKitPublicUrl(image.url)
  );
  const needsUpload = parsed.filter(
    (image) => !(image.id && isTraideImageId(image.id)) && !isImageKitPublicUrl(image.url)
  );
  if (needsUpload.length && !isImageKitUploadConfigured()) {
    return {
      images: toInventoryImages(keepAsIs).map((image) => ({
        id: image.id,
        url: isImageKitPublicUrl(image.url) ? canonicalImageKitUrl(image.url) : image.url,
      })),
      errors: ["ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY to upload variant images to the DAM."],
    };
  }

  const folder = manufacturerImageKitImagesFolder(manufacturer);
  const errors: string[] = [];
  const uploaded: DamInventoryImage[] = keepAsIs.map((image) => ({
    id: image.id ?? null,
    url: isImageKitPublicUrl(image.url) ? canonicalImageKitUrl(image.url) : image.url,
  }));

  for (const image of needsUpload) {
    try {
      const parsedUrl = assertHttpUrlForFetch(image.url);
      const imgRes = await fetchRemoteHttpUrl(image.url, {
        timeoutMs: 45_000,
        userAgent: "OonniInventoryImporter/1.0",
      });
      if (!imgRes.ok) {
        errors.push(`Could not download image ${image.url} (${imgRes.status})`);
        continue;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_REMOTE_IMAGE_BYTES) {
        errors.push(`Image ${image.url} is empty or larger than 15MB`);
        continue;
      }
      const mime = normalizeMimeType(imgRes.headers.get("content-type"), parsedUrl);
      if (!mime.startsWith("image/")) {
        errors.push(`URL is not an image: ${image.url}`);
        continue;
      }
      const baseName = filenameFromUrl(parsedUrl, "variant.jpg");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${stamp}_${baseName}`;
      const result = await uploadToImageKit(buf, fileName, folder, mime, {
        preTransform: IMPORT_IMAGE_PRE_TRANSFORM,
      });
      const publicUrl = result.url;
      await prisma.image.create({
        data: {
          manufacturer_id: manufacturer.id,
          user_id: params.userId,
          original_filename: baseName,
          s3_key: result.filePath,
          s3_url: publicUrl,
          imagekit_file_id: result.fileId,
          file_size: buf.length,
          mime_type: mime,
          width: result.width ?? null,
          height: result.height ?? null,
          optimized: 1,
        },
      });
      uploaded.push({ id: null, url: publicUrl });
    } catch (e) {
      errors.push(
        `Failed to upload ${image.url} to ImageKit: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }
  }

  return { images: uploaded, errors };
}
