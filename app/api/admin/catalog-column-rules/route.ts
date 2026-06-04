import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/api-response";
import {
  listCatalogColumnRules,
  replaceCatalogColumnRules,
  seedDefaultCatalogColumnRules,
  type CatalogColumnRuleInput,
} from "@/lib/catalog-column-rules-service";

export async function GET(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) {
    if (error === "Admin access required") return forbidden(error);
    return unauthorized(error ?? undefined);
  }

  try {
    const rules = await listCatalogColumnRules();
    return ok({ rules });
  } catch (e) {
    console.error("Admin list catalog column rules error:", e);
    return err("Failed to load catalog column rules", 500);
  }
}

export async function PUT(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) {
    if (error === "Admin access required") return forbidden(error);
    return unauthorized(error ?? undefined);
  }

  try {
    const body = await req.json();
    const rules = body?.rules as CatalogColumnRuleInput[] | undefined;
    if (!Array.isArray(rules)) return err("rules array is required");

    const saved = await replaceCatalogColumnRules(rules);
    return ok({ rules: saved, message: "Catalog column rules updated" });
  } catch (e) {
    console.error("Admin update catalog column rules error:", e);
    return err(e instanceof Error ? e.message : "Failed to update catalog column rules", 500);
  }
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error || !user) {
    if (error === "Admin access required") return forbidden(error);
    return unauthorized(error ?? undefined);
  }

  try {
    const body = await req.json();
    if (body?.action !== "reset_defaults") return err("Unsupported action");

    await seedDefaultCatalogColumnRules();
    const rules = await listCatalogColumnRules();
    return ok({ rules, message: "Default catalog column rules restored" });
  } catch (e) {
    console.error("Admin reset catalog column rules error:", e);
    return err("Failed to reset catalog column rules", 500);
  }
}
