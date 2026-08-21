import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { parsePositiveInt } from "@/lib/inventory-access";
import { inventoryOrderBy, inventorySearchOr } from "@/lib/inventory-list-query";
import { parseBoundedInt } from "@/lib/bounded-int";

const SPECIAL_TEXT = `O'Brien 12" board & 100% cotton`;

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkTsFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("SQL injection hardening", () => {
  test("source does not concatenate raw SQL", () => {
    const root = join(__dirname, "..");
    const files = [
      ...walkTsFiles(join(root, "app")),
      ...walkTsFiles(join(root, "lib")),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (src.includes("$queryRawUnsafe") || src.includes("$executeRawUnsafe")) {
        hits.push(file.replace(`${root}\\`, "").replace(`${root}/`, ""));
      }
    }
    expect(hits).toEqual([]);
  });

  test("tagged SQL keeps special characters as bound values, not SQL text", () => {
    const sql = Prisma.sql`SELECT id FROM inventory_products WHERE name = ${SPECIAL_TEXT}`;
    expect(sql.values).toEqual([SPECIAL_TEXT]);
    expect(sql.strings.join("")).not.toContain(SPECIAL_TEXT);
    expect(sql.strings.join("")).not.toContain("O'Brien");
  });

  test("inventory search passes the whole string to contains (Prisma parameter)", () => {
    const or = inventorySearchOr(SPECIAL_TEXT);
    expect(or).toBeDefined();
    expect(or?.[0]).toEqual({ name: { contains: SPECIAL_TEXT, mode: "insensitive" } });
    expect(JSON.stringify(or)).not.toMatch(/\$queryRaw|SELECT |UNION /i);
  });

  test("empty search does not add OR filters", () => {
    expect(inventorySearchOr("")).toBeUndefined();
    expect(inventorySearchOr("   ")).toBeUndefined();
  });

  test("inventory sort only maps known columns", () => {
    expect(inventoryOrderBy("name", "asc")).toEqual({ name: "asc" });
    expect(inventoryOrderBy("external_id", "desc")).toEqual({ external_id: "desc" });
    expect(inventoryOrderBy("status", "asc")).toEqual({ status: "asc" });
    expect(inventoryOrderBy("payload", "desc")).toEqual({ name: "desc" });
    expect(inventoryOrderBy("name;updated_at", "asc")).toEqual({ name: "asc" });
    expect(inventoryOrderBy("name", "sideways")).toEqual({ name: "asc" });
  });

  test("parsePositiveInt rejects non-integer ids", () => {
    expect(parsePositiveInt("42", "id")).toBe(42);
    expect(parsePositiveInt("0", "id")).toBeNull();
    expect(parsePositiveInt("-3", "id")).toBeNull();
    expect(parsePositiveInt("12abc", "id")).toBeNull();
    expect(parsePositiveInt("1.5", "id")).toBeNull();
    expect(parsePositiveInt("1e2", "id")).toBeNull();
    expect(parsePositiveInt("", "id")).toBeNull();
    expect(parsePositiveInt("  7  ", "id")).toBe(7);
  });

  test("parseBoundedInt clamps instead of interpolating", () => {
    expect(parseBoundedInt("10", 50, 1, 100)).toBe(10);
    expect(parseBoundedInt("9999", 50, 1, 100)).toBe(100);
    expect(parseBoundedInt("abc", 50, 1, 100)).toBe(50);
    expect(parseBoundedInt("", 50, 1, 100)).toBe(50);
  });
});
