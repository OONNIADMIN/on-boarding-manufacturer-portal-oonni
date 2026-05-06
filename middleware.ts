import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/set-password", "/api/auth/login", "/api/auth/set-password", "/api/auth/verify-invitation", "/api/health"];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/** Files served from /public — must not redirect to /login or the browser never gets the asset */
const PUBLIC_FILE_RE =
  /\.(?:ico|png|apng|jpe?g|gif|svg|webp|avif|woff2?|ttf|woff|eot|txt|xml|json|webmanifest|pdf)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next/")) return NextResponse.next();

  if (!pathname.startsWith("/api/") && (pathname === "/favicon.ico" || PUBLIC_FILE_RE.test(pathname))) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  const token =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.cookies.get("access_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ detail: "Authentication required" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ detail: "Invalid or expired token" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && payload) {
    const isAdmin = payload.role?.trim().toLowerCase() === "admin";
    const home = isAdmin ? "/dashboard" : "/onboard/template";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|_next/webpack|_next/data|favicon.ico).*)",
  ],
};
