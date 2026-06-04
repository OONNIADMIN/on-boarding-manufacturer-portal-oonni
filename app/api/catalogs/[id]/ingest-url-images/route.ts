import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { effectiveManufacturerId, requireAuth } from "@/lib/auth";
import { imageKitUploadFailureMessage } from "@/lib/imagekit";
import { err, ok, unauthorized, forbidden, notFound } from "@/lib/api-response";
import { fetchCatalogSpreadsheetBuffer } from "@/lib/catalog-file-fetch";
import {
  ingestCatalogImagesFromSpreadsheet,
  type CatalogImageIngestProgress,
  type CatalogImageIngestResult,
} from "@/lib/catalog-image-ingest";

type IngestRequestBody = {
  sku_column?: string;
  image_column?: string;
  manufacturer_id?: number;
  stream?: boolean;
};

async function parseIngestRequest(req: NextRequest): Promise<{
  sku_column: string;
  image_column: string;
  manufacturer_id: number;
  stream: boolean;
  spreadsheetBuffer: Buffer | null;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const sku_column = String(formData.get("sku_column") ?? "").trim();
    const image_column = String(formData.get("image_column") ?? "").trim();
    const manufacturer_id = parseInt(String(formData.get("manufacturer_id") ?? ""), 10);
    const stream = String(formData.get("stream") ?? "").toLowerCase() === "true";
    const file = formData.get("file");

    let spreadsheetBuffer: Buffer | null = null;
    if (file instanceof File && file.size > 0) {
      spreadsheetBuffer = Buffer.from(await file.arrayBuffer());
    }

    return { sku_column, image_column, manufacturer_id, stream, spreadsheetBuffer };
  }

  const body = (await req.json()) as IngestRequestBody;
  return {
    sku_column: String(body.sku_column ?? "").trim(),
    image_column: String(body.image_column ?? "").trim(),
    manufacturer_id: parseInt(String(body.manufacturer_id ?? ""), 10),
    stream: Boolean(body.stream),
    spreadsheetBuffer: null,
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const { id } = await params;
    const catalogId = parseInt(id, 10);
    const { sku_column, image_column, manufacturer_id, stream, spreadsheetBuffer } =
      await parseIngestRequest(req);

    if (!catalogId || !sku_column || !image_column || !manufacturer_id) {
      return err("catalog id, sku_column, image_column and manufacturer_id are required");
    }

    const catalog = await prisma.catalog.findUnique({
      where: { id: catalogId },
      include: { manufacturer: true },
    });
    if (!catalog || catalog.deleted_at) return notFound("Catalog not found");

    const isAdmin = user.role.name.trim().toLowerCase() === "admin";
    const isOwn = effectiveManufacturerId(user) === manufacturer_id;
    if (!isAdmin && !isOwn) return forbidden("Access denied");
    if (catalog.manufacturer_id !== manufacturer_id) {
      return forbidden("Catalog does not belong to this manufacturer");
    }
    if (!catalog.catalog_file) return notFound("Catalog file not found");

    const buffer =
      spreadsheetBuffer && spreadsheetBuffer.length > 0
        ? spreadsheetBuffer
        : await fetchCatalogSpreadsheetBuffer(catalog.catalog_file);

    const headerRowIndex = catalog.header_row_index ?? 0;

    const runIngest = (onProgress?: (progress: CatalogImageIngestProgress) => void) =>
      ingestCatalogImagesFromSpreadsheet({
        catalogId,
        manufacturerId: manufacturer_id,
        userId: user.id,
        skuColumn: sku_column,
        imageColumn: image_column,
        catalogFileUrl: catalog.catalog_file!,
        headerRowIndex,
        spreadsheetBuffer: buffer,
        manufacturer: catalog.manufacturer,
        onProgress,
      });

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          try {
            const result = await runIngest((progress) => {
              send({ type: "progress", ...progress });
            });
            send({ type: "done", ...result });
          } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to import images from catalog URLs";
            send({ type: "error", message });
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        },
      });
    }

    const result: CatalogImageIngestResult = await runIngest();
    return ok(result);
  } catch (e) {
    console.error("ingest-url-images error:", e);
    const hint = imageKitUploadFailureMessage(e);
    if (hint) return err(hint, 503);
    const message =
      e instanceof Error && e.message.includes("Could not download the catalog file")
        ? e.message
        : "Failed to import images from catalog URLs";
    return err(message, 500);
  }
}
