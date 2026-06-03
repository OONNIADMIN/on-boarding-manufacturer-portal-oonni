import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ok, err, unauthorized } from "@/lib/api-response";
import { getActiveCatalogColumnRules } from "@/lib/catalog-column-rules-service";

/** Read-only rules for catalog upload validation (any authenticated user). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  try {
    const rules = await getActiveCatalogColumnRules();
    return ok({ rules });
  } catch (e) {
    console.error("List catalog column rules error:", e);
    return err("Failed to load catalog column rules", 500);
  }
}
