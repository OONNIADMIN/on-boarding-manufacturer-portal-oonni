import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api-response";
import { requireInventoryUser } from "@/lib/inventory-access";
import { listStoredCategoryTree } from "@/lib/traide/services/category-sync";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireInventoryUser(req);
  if (!auth.ok) return auth.response;

  try {
    const categories = await listStoredCategoryTree();
    return ok({ categories, total: categories.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to load categories", 500);
  }
}
