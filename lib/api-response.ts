import { NextResponse } from "next/server";
import { unexpectedError } from "@/lib/error-log";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function err(message: string, status = 400, cause?: unknown) {
  if (status === 500 || status === 502) {
    return unexpectedError(cause ?? message, { source: "api" }, status);
  }
  return NextResponse.json({ detail: message }, { status });
}

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ detail: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ detail: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ detail: message }, { status: 404 });
}

export function serverError(message = "Internal server error", cause?: unknown) {
  return unexpectedError(cause ?? message, { source: "api" }, 500);
}

export function tooManyRequests(message = "Too many requests. Try again later.", retryAfterSeconds = 900) {
  const res = NextResponse.json({ detail: message }, { status: 429 });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

export { slugify } from "@/lib/slugify";

