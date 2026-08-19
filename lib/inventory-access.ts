import { NextRequest, NextResponse } from "next/server";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, unauthorized } from "@/lib/api-response";

export const LOCAL_INVENTORY_PREFIX = "local:";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

export async function requireInventoryManufacturer(req: NextRequest): Promise<
  | { ok: true; manufacturerId: number; userId: number }
  | { ok: false; response: NextResponse }
> {
  const { user, error } = await requireAuth(req);
  if (error || !user) return { ok: false, response: unauthorized(error ?? undefined) };
  if (isAdminUser(user) || !isManufacturerUser(user)) {
    return { ok: false, response: forbidden("Only manufacturer users can manage inventory.") };
  }
  const manufacturerId = effectiveManufacturerId(user);
  if (!manufacturerId) return { ok: false, response: err("Manufacturer ID is missing", 400) };
  return { ok: true, manufacturerId, userId: user.id };
}

export function parsePositiveInt(value: string | undefined, label: string): number | null {
  const parsed = parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  void label;
  return parsed;
}
