import { NextRequest } from "next/server";
import { err, ok } from "@/lib/api-response";
import { requireInventoryAdmin } from "@/lib/inventory-access";
import { getNauticalConfig, nauticalNotConfiguredMessage } from "@/lib/traide/graphql/client";
import { listStoredCategoryTree, syncTraideCategories } from "@/lib/traide/services/category-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const auth = await requireInventoryAdmin(req);
  if (!auth.ok) return auth.response;

  if (!getNauticalConfig()) {
    return err(nauticalNotConfiguredMessage(), 400);
  }

  try {
    const result = await syncTraideCategories();
    const categories = await listStoredCategoryTree();
    return ok({
      synced: result.synced,
      removed: result.removed,
      total: categories.length,
      categories,
    });
  } catch (e) {
    console.error("Failed to fetch Traide categories", e);
    return err(e instanceof Error ? e.message : "Failed to fetch categories", 500);
  }
}
