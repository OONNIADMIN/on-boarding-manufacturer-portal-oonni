import { verifyPassword } from "@/lib/auth";
import {
  AUTH_WINDOW_MS,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_LIMIT,
  consumeRateLimit,
} from "@/lib/rate-limit";

export const LOGIN_FAILURE_DETAIL = "Incorrect email or password";

/** Precomputed bcrypt hash used only so missing users still pay compare cost. */
const DUMMY_PASSWORD_HASH =
  "$2b$12$3Qk9bPSfERcx2j5LDDbmteap9y//.R4fw/LJvSU39vQqAKg4owBey";

export function consumeLoginAttempt(ip: string, email: string): boolean {
  const normalized = email.trim().toLowerCase() || "unknown";
  if (!consumeRateLimit(`login-ip:${ip}`, LOGIN_IP_LIMIT, AUTH_WINDOW_MS)) return false;
  if (!consumeRateLimit(`login-email:${normalized}`, LOGIN_EMAIL_LIMIT, AUTH_WINDOW_MS)) return false;
  if (!consumeRateLimit(`login:${ip}:${normalized}`, LOGIN_LIMIT, AUTH_WINDOW_MS)) return false;
  return true;
}

/** Always runs bcrypt so unknown emails are not cheaper than known ones. */
export async function passwordsMatch(plain: string, storedHash: string | null | undefined): Promise<boolean> {
  const hash = storedHash && storedHash.length > 0 ? storedHash : DUMMY_PASSWORD_HASH;
  const matches = await verifyPassword(plain, hash);
  if (!storedHash) return false;
  return matches;
}
