import { NextRequest, NextResponse } from "next/server";
import { getJwtExpireMinutes } from "@/lib/jwt-secret";

export const SESSION_COOKIE = "access_token";

function cookieBase() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}

export function applySessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    ...cookieBase(),
    maxAge: getJwtExpireMinutes() * 60,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", {
    ...cookieBase(),
    maxAge: 0,
  });
  return res;
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
