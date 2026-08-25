import { NextRequest, NextResponse } from "next/server";
import { tooManyRequests } from "@/lib/api-response";
import { consumeRateLimit, AUTH_WINDOW_MS } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
const CONTENT_LENGTH_OVERHEAD = 1_048_576;

export function contentLengthTooLarge(
  req: NextRequest,
  maxBytes: number = MAX_UPLOAD_BYTES,
  overhead = CONTENT_LENGTH_OVERHEAD
): boolean {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > maxBytes + overhead;
}

export function fileTooLarge(size: number, maxBytes: number = MAX_UPLOAD_BYTES): boolean {
  return !Number.isFinite(size) || size < 0 || size > maxBytes;
}

export function rejectIfLimited(
  key: string,
  limit: number,
  windowMs: number = AUTH_WINDOW_MS
): NextResponse | null {
  if (consumeRateLimit(key, limit, windowMs)) return null;
  return tooManyRequests("Too many requests. Try again later.", Math.ceil(windowMs / 1000));
}
