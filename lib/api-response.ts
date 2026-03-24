import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function err(message: string, status = 400) {
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

export function serverError(message = "Internal server error") {
  return NextResponse.json({ detail: message }, { status: 500 });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}
