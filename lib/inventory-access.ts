import { NextRequest, NextResponse } from "next/server";
import { effectiveManufacturerId, isAdminUser, requireAuth } from "@/lib/auth";
import { err, forbidden, unauthorized } from "@/lib/api-response";

export const LOCAL_INVENTORY_PREFIX = "local:";

function isManufacturerUser(user: { role: { name: string } }): boolean {
  return user.role.name.trim().toLowerCase() === "manufacturer";
}

function manufacturerIdFromRequest(req: NextRequest): number | null {
  return parsePositiveInt(new URL(req.url).searchParams.get("manufacturer_id") ?? undefined, "manufacturer_id");
}

export async function requireInventoryUser(req: NextRequest): Promise<
  | { ok: true; userId: number; isAdmin: boolean; manufacturerId: number | null }
  | { ok: false; response: NextResponse }
> {
  const { user, error } = await requireAuth(req);
  if (error || !user) return { ok: false, response: unauthorized(error ?? undefined) };
  if (isAdminUser(user)) {
    return {
      ok: true,
      userId: user.id,
      isAdmin: true,
      manufacturerId: manufacturerIdFromRequest(req),
    };
  }
  if (!isManufacturerUser(user)) {
    return { ok: false, response: forbidden("You do not have access to inventory.") };
  }
  const manufacturerId = effectiveManufacturerId(user);
  if (!manufacturerId) return { ok: false, response: err("Manufacturer ID is missing", 400) };
  return { ok: true, userId: user.id, isAdmin: false, manufacturerId };
}

export async function requireInventoryAdmin(req: NextRequest): Promise<
  | { ok: true; userId: number; manufacturerId: number | null }
  | { ok: false; response: NextResponse }
> {
  const { user, error } = await requireAuth(req);
  if (error || !user) return { ok: false, response: unauthorized(error ?? undefined) };
  if (!isAdminUser(user)) {
    return { ok: false, response: forbidden("Only administrators can perform this action.") };
  }
  return { ok: true, userId: user.id, manufacturerId: manufacturerIdFromRequest(req) };
}

export async function requireInventoryManufacturer(req: NextRequest): Promise<
  | { ok: true; manufacturerId: number; userId: number; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireInventoryUser(req);
  if (!auth.ok) return auth;
  if (!auth.manufacturerId) {
    return { ok: false, response: err("Manufacturer ID is required", 400) };
  }
  return {
    ok: true,
    manufacturerId: auth.manufacturerId,
    userId: auth.userId,
    isAdmin: auth.isAdmin,
  };
}

export function parsePositiveInt(value: string | undefined, label: string): number | null {
  const parsed = parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  void label;
  return parsed;
}
