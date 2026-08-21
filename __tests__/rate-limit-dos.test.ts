import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  LOGIN_IP_LIMIT,
  LOGIN_LIMIT,
  MAX_RATE_LIMIT_KEYS,
  consumeRateLimit,
  rateLimitKeyCount,
  resetRateLimits,
} from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES, contentLengthTooLarge, fileTooLarge } from "@/lib/request-limits";
import { tooManyRequests } from "@/lib/api-response";

function headerReq(contentLength: string | null) {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-length" ? contentLength : null;
      },
    },
  } as unknown as Parameters<typeof contentLengthTooLarge>[0];
}

describe("rate limit and DoS guards", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  test("allows up to the limit then denies in the same window", () => {
    const key = "test:login";
    expect(consumeRateLimit(key, 3, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(true);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(false);
    expect(consumeRateLimit(key, 3, 60_000)).toBe(false);
  });

  test("separate keys do not share a bucket", () => {
    expect(consumeRateLimit("a", 1, 60_000)).toBe(true);
    expect(consumeRateLimit("b", 1, 60_000)).toBe(true);
    expect(consumeRateLimit("a", 1, 60_000)).toBe(false);
    expect(consumeRateLimit("b", 1, 60_000)).toBe(false);
  });

  test("window reset allows traffic again", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(consumeRateLimit("window", 1, 1_000)).toBe(true);
    expect(consumeRateLimit("window", 1, 1_000)).toBe(false);
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    expect(consumeRateLimit("window", 1, 1_000)).toBe(true);
  });

  test("login IP cap is higher than per-email cap", () => {
    expect(LOGIN_IP_LIMIT).toBeGreaterThan(LOGIN_LIMIT);
    expect(LOGIN_LIMIT).toBeGreaterThan(0);
  });

  test("bucket map cannot grow without bound", () => {
    for (let i = 0; i < MAX_RATE_LIMIT_KEYS + 250; i += 1) {
      consumeRateLimit(`flood:${i}`, 1, 60_000);
    }
    expect(rateLimitKeyCount()).toBeLessThanOrEqual(MAX_RATE_LIMIT_KEYS);
  });

  test("429 responses include Retry-After", () => {
    const res = tooManyRequests("Too many requests. Try again later.", 900);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("900");
  });

  test("upload size guards reject oversized files before buffering", () => {
    expect(fileTooLarge(MAX_UPLOAD_BYTES)).toBe(false);
    expect(fileTooLarge(MAX_UPLOAD_BYTES + 1)).toBe(true);
    expect(fileTooLarge(-1)).toBe(true);
    expect(contentLengthTooLarge(headerReq(String(MAX_UPLOAD_BYTES + 2_000_000)))).toBe(true);
    expect(contentLengthTooLarge(headerReq("1024"))).toBe(false);
    expect(contentLengthTooLarge(headerReq("20000"), 16_384, 0)).toBe(true);
    expect(contentLengthTooLarge(headerReq("100"), 16_384, 0)).toBe(false);
  });
});
