import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { hashPassword } from "@/lib/auth";
import {
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  LOGIN_LIMIT,
  resetRateLimits,
} from "@/lib/rate-limit";
import {
  LOGIN_FAILURE_DETAIL,
  consumeLoginAttempt,
  passwordsMatch,
} from "@/lib/login-guard";

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTsFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("credential stuffing defenses", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  test("failed logins use one generic detail string", () => {
    expect(LOGIN_FAILURE_DETAIL).toBe("Incorrect email or password");
    const loginSrc = readFileSync(join(__dirname, "../app/api/auth/login/route.ts"), "utf8");
    expect(loginSrc).toContain("LOGIN_FAILURE_DETAIL");
    expect(loginSrc).not.toMatch(/User not found|Invalid password|No such user|Inactive user/);
  });

  test("the same email is capped across different source IPs", () => {
    const email = "target@example.com";
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < LOGIN_EMAIL_LIMIT + 12; i += 1) {
      if (consumeLoginAttempt(`203.0.113.${i}`, email)) allowed += 1;
      else blocked += 1;
    }
    expect(allowed).toBe(LOGIN_EMAIL_LIMIT);
    expect(blocked).toBe(12);
  });

  test("different emails from one IP are capped by the IP limit", () => {
    let allowed = 0;
    for (let i = 0; i < LOGIN_IP_LIMIT + 5; i += 1) {
      if (consumeLoginAttempt("198.51.100.10", `user${i}@example.com`)) allowed += 1;
    }
    expect(allowed).toBe(LOGIN_IP_LIMIT);
  });

  test("one IP and email pair hits the tighter pair cap first", () => {
    let allowed = 0;
    for (let i = 0; i < LOGIN_LIMIT + 4; i += 1) {
      if (consumeLoginAttempt("198.51.100.20", "one@example.com")) allowed += 1;
    }
    expect(allowed).toBe(LOGIN_LIMIT);
  });

  test("email-wide cap is stricter than the IP cap", () => {
    expect(LOGIN_EMAIL_LIMIT).toBeLessThan(LOGIN_IP_LIMIT);
    expect(LOGIN_LIMIT).toBeLessThanOrEqual(LOGIN_EMAIL_LIMIT);
  });

  test("missing stored hash still runs a password check and never matches", async () => {
    expect(await passwordsMatch("any-password-value", null)).toBe(false);
    expect(await passwordsMatch("any-password-value", undefined)).toBe(false);
    expect(await passwordsMatch("any-password-value", "")).toBe(false);
  });

  test("stored hash still accepts only the real password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await passwordsMatch("correct-horse-battery", hash)).toBe(true);
    expect(await passwordsMatch("wrong-password-value", hash)).toBe(false);
  });

  test("login route does not return distinct errors for unknown vs known emails", () => {
    const files = walkTsFiles(join(__dirname, "../app/api/auth"));
    const login = files.find((f) => f.replace(/\\/g, "/").endsWith("/login/route.ts"));
    expect(login).toBeDefined();
    const src = readFileSync(login!, "utf8");
    expect(src).toContain("passwordsMatch");
    expect(src).toContain("consumeLoginAttempt");
  });
});
