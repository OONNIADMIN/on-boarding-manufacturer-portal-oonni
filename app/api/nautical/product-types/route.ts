import { NextRequest } from "next/server";
import { isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, ok, unauthorized } from "@/lib/api-response";
import {
  fetchAllNauticalProductTypes,
  getNauticalConfig,
} from "@/lib/nautical-client";

export const dynamic = "force-dynamic";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error || !user) return unauthorized(error ?? undefined);

  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return forbidden("Only manufacturer users can download catalog templates.");
  }

  if (!getNauticalConfig()) {
    return err("Catalog templates are not available right now. Contact your Oonni administrator.", 503);
  }

  try {
    const nodes = await fetchAllNauticalProductTypes();
    const product_types = nodes.map((n) => ({
      id: n.id,
      slug: n.slug,
      name: n.name,
    }));
    return ok({ product_types });
  } catch (e) {
    console.error("nautical product-types:", e);
    const msg = e instanceof Error ? e.message : "Could not load catalog templates";
    return err(/traide|nautical/i.test(msg) ? "Could not load catalog templates" : msg, 502);
  }
}
