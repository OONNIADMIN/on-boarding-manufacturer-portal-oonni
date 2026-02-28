import ImageKit, { toFile } from "@imagekit/nodejs";

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? "",
});

export interface ImageKitUploadResult {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  size: number;
  width?: number;
  height?: number;
  mimeType?: string;
}

export async function uploadToImageKit(
  fileBuffer: Buffer,
  fileName: string,
  folder: string,
  mimeType?: string
): Promise<ImageKitUploadResult> {
  const file = await toFile(fileBuffer, fileName, { type: mimeType ?? "application/octet-stream" });
  const result = await imagekit.files.upload({
    file,
    fileName,
    folder,
    useUniqueFileName: true,
  });

  return {
    fileId: result.fileId ?? "",
    name: result.name ?? fileName,
    url: result.url ?? "",
    filePath: result.filePath ?? "",
    size: result.size ?? 0,
    width: result.width ?? undefined,
    height: result.height ?? undefined,
    mimeType: (result as { mime?: string }).mime ?? undefined,
  };
}

export async function deleteFromImageKit(fileId: string): Promise<void> {
  await imagekit.files.delete(fileId);
}

export { imagekit };
