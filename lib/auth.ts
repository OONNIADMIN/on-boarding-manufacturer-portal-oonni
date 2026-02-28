import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-secret-change-in-production"
);
const JWT_EXPIRE_MINUTES = parseInt(
  process.env.JWT_EXPIRE_MINUTES ?? "1440",
  10
);

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export async function signToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRE_MINUTES}m`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/** Genera un token aleatorio de 64 caracteres hex para invitación. Mismo valor se guarda en DB y se envía en el link del correo. */
export function generateInvitationToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getInvitationTokenExpiry(): Date {
  const hours = parseInt(process.env.INVITATION_TOKEN_EXPIRE_HOURS ?? "72", 10);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function isInvitationTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return new Date() > expiresAt;
}

export async function getCurrentUser(req?: NextRequest) {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
    if (!token) {
      token = req.cookies.get("access_token")?.value;
    }
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get("access_token")?.value;
  }

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(payload.sub, 10) },
    include: { role: true, manufacturer: true },
  });

  return user;
}

export async function getTokenFromRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies.get("access_token")?.value ?? null;
}

export async function requireAuth(req: NextRequest) {
  const token = await getTokenFromRequest(req);
  if (!token) return { user: null, error: "No authentication token" };

  const payload = await verifyToken(token);
  if (!payload) return { user: null, error: "Invalid or expired token" };

  const user = await prisma.user.findUnique({
    where: { id: parseInt(payload.sub, 10) },
    include: { role: true, manufacturer: true },
  });

  if (!user) return { user: null, error: "User not found" };
  if (!user.is_active) return { user: null, error: "Inactive user" };

  return { user, error: null };
}

export async function requireAdmin(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return { user: null, error: error ?? "Unauthorized" };
  if (user.role.name !== "admin") return { user: null, error: "Admin access required" };
  return { user, error: null };
}
