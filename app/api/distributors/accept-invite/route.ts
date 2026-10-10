import { NextRequest } from "next/server";
import { err, ok, tooManyRequests } from "@/lib/api-response";
import {
  acceptDistributorInvitation,
  previewDistributorInvitation,
} from "@/lib/distributor-accept-invite";
import { AUTH_WINDOW_MS, consumeRateLimit } from "@/lib/rate-limit";
import { contentLengthTooLarge } from "@/lib/request-limits";
import { clientIp } from "@/lib/session-cookie";

const INVALID_LINK = "This invitation link is invalid or has expired.";

function passwordError(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password must include uppercase and lowercase letters.";
  }
  if (!/\d/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  if (!consumeRateLimit(`distributor-invite-preview:${ip}`, 30, AUTH_WINDOW_MS)) {
    return tooManyRequests("Too many attempts. Try again in 15 minutes.");
  }
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) return err(INVALID_LINK, 400);
  const preview = await previewDistributorInvitation(token);
  if (!preview) return err(INVALID_LINK, 400);
  return ok(preview);
}

export async function POST(req: NextRequest) {
  if (contentLengthTooLarge(req, 16_384, 0)) return err("Request too large", 413);
  const ip = clientIp(req);
  if (!consumeRateLimit(`distributor-invite-accept:${ip}`, 10, AUTH_WINDOW_MS)) {
    return tooManyRequests("Too many attempts. Try again in 15 minutes.");
  }

  const body = (await req.json().catch(() => null)) as { token?: unknown; password?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || !password) return err(INVALID_LINK, 400);
  const policy = passwordError(password);
  if (policy) return err(policy, 400);

  try {
    const accepted = await acceptDistributorInvitation(token, password);
    return ok(accepted);
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() : "";
    if (/invalid or has expired/i.test(message)) return err(INVALID_LINK, 400);
    console.error("distributor-accept-invite", message || error);
    return err("The password could not be saved. Open the invitation email and try again.", 400);
  }
}
