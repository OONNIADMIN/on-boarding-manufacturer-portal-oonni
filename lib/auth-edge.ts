/**
 * Edge-safe auth helpers (only jose). Use this in middleware.
 * Do not import from @/lib/auth in middleware - it pulls in bcrypt and Prisma (Node-only).
 */
import { jwtVerify } from "jose";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
