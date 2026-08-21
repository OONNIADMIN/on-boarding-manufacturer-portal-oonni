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
import { clientIp } from "@/lib/session-cookie";
import { AUTH_WINDOW_MS, INGEST_LIMIT } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  contentLengthTooLarge,
  fileTooLarge,
  rejectIfLimited,
} from "@/lib/request-limits";
import { sniffSpreadsheetKind } from "@/lib/upload-file-guard";
import { uploadTooLargeMessage } from "@/lib/upload-limits";

type IngestRequestBody = {
  sku_column?: string;
  image_column?: string;
  image_columns?: string[] | string;
  manufacturer_id?: number;
  stream?: boolean;
};

function parseImageColumnNames(raw: unknown, fallbackSingle = ""): string[] {
  const names: string[] = [];
  const push = (value: unknown) => {
    const name = String(value ?? "").trim();
    if (name) names.push(name);
  };

  if (Array.isArray(raw)) {
    raw.forEach(push);
  } else if (typeof raw === "string" && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) parsed.forEach(push);
        else push(text);
      } catch {
        text.split(",").forEach(push);
      }
    } else {
      text.split(",").forEach(push);
    }
  }

  if (!names.length && fallbackSingle.trim()) names.push(fallbackSingle.trim());
  return [...new Set(names)];
}

async function parseIngestRequest(req: NextRequest): Promise<{
  sku_column: string;
  image_columns: string[];
  manufacturer_id: number;
  stream: boolean;
  spreadsheetBuffer: Buffer | null;
  spreadsheetName: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const sku_column = String(formData.get("sku_column") ?? "").trim();
    const image_columns = parseImageColumnNames(
      formData.get("image_columns") ?? formData.getAll("image_columns"),
      String(formData.get("image_column") ?? "")
    );
    const manufacturer_id = parseInt(String(formData.get("manufacturer_id") ?? ""), 10);
    const stream = String(formData.get("stream") ?? "").toLowerCase() === "true";
    const file = formData.get("file");

    let spreadsheetBuffer: Buffer | null = null;
    let spreadsheetName = "";
    if (file instanceof File && file.size > 0) {
      if (fileTooLarge(file.size)) {
        throw new Error(uploadTooLargeMessage());
      }
      spreadsheetBuffer = Buffer.from(await file.arrayBuffer());
      spreadsheetName = file.name;
    }

    return { sku_column, image_columns, manufacturer_id, stream, spreadsheetBuffer, spreadsheetName };
  }

  const body = (await req.json()) as IngestRequestBody;
  return {
    sku_column: String(body.sku_column ?? "").trim(),
    image_columns: parseImageColumnNames(body.image_columns, String(body.image_column ?? "")),
    manufacturer_id: parseInt(String(body.manufacturer_id ?? ""), 10),
    stream: Boolean(body.stream),
    spreadsheetBuffer: null,
    spreadsheetName: "",
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);
  const limited = rejectIfLimited(`ingest-images:${user.id}:${clientIp(req)}`, INGEST_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;
  if (contentLengthTooLarge(req)) return err(uploadTooLargeMessage(), 413);

  try {
    const { id } = await params;
    const catalogId = parseInt(id, 10);
    const { sku_column, image_columns, manufacturer_id, stream, spreadsheetBuffer, spreadsheetName } =
      await parseIngestRequest(req);

    if (!catalogId || !sku_column || !manufacturer_id) {
      return err("catalog id, sku_column and manufacturer_id are required");
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
    if (buffer.length > MAX_UPLOAD_BYTES) return err(uploadTooLargeMessage(), 413);
    if (spreadsheetBuffer && !sniffSpreadsheetKind(spreadsheetBuffer, spreadsheetName || "catalog.xlsx")) {
      return err("Invalid file type. Allowed: CSV, XLSX, XLS");
    }

    const headerRowIndex = catalog.header_row_index ?? 0;

    const runIngest = (onProgress?: (progress: CatalogImageIngestProgress) => void) =>
      ingestCatalogImagesFromSpreadsheet({
        catalogId,
        manufacturerId: manufacturer_id,
        userId: user.id,
        skuColumn: sku_column,
        imageColumns: image_columns,
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
    if (e instanceof Error && e.message.includes("MB limit")) return err(e.message, 413);
    const message =
      e instanceof Error && e.message.includes("Could not download the catalog file")
        ? e.message
        : "Failed to import images from catalog URLs";
    return err(message, 500);
  }
}
