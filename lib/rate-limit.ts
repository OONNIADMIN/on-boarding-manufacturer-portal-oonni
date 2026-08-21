type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
export const MAX_RATE_LIMIT_KEYS = 10_000;

function prune(now: number) {
  if (buckets.size === 0) return;
  if (buckets.size > 256) {
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(key);
    }
  }
  while (buckets.size >= MAX_RATE_LIMIT_KEYS) {
    const first = buckets.keys().next().value;
    if (!first) break;
    buckets.delete(first);
  }
}

/** Returns true if the request is allowed. */
export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || now > existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function rateLimitKeyCount(): number {
  return buckets.size;
}

export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_EMAIL_LIMIT = 8;
export const SET_PASSWORD_LIMIT = 10;
export const RESEND_INVITE_LIMIT = 3;
export const VERIFY_INVITE_LIMIT = 30;
export const UPLOAD_LIMIT = 30;
export const INGEST_LIMIT = 5;
export const IMPORT_LIMIT = 8;
