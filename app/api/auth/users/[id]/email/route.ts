import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { err, ok, unauthorized, notFound } from "@/lib/api-response";
import {
  createMarketplaceOperatorAccessToken,
  executeMarketplaceMutation,
  nauticalGraphql,
} from "@/lib/marketplace/graphql/client";
import type { StaffUpdatePayload } from "@/app/graphql";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STAFF_EMAIL_MUTATION = `
mutation StaffEmail($id: ID!, $email: String!) {
  staffUpdate(id: $id, input: { email: $email }) {
    user { id }
    staffErrors { field message code }
  }
}
`;

function marketplaceError(
  errors: Array<{ field?: string | null; message?: string | null; code?: string | null }>,
): string {
  return errors
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(req);
  if (error) return unauthorized(error);

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (!Number.isFinite(userId) || userId < 1) return err("Invalid user id");

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) return err("Enter a valid email address");

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, manufacturer: true },
  });
  if (!target || target.deleted_at) return notFound("User not found");
  if (target.role.name.trim().toLowerCase() !== "manufacturer" || !target.manufacturer_id) {
    return err("Only a manufacturer user email can be changed here");
  }

  if (target.email.trim().toLowerCase() === email) {
    return ok(serialize(target));
  }

  const taken = await prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: target.id },
      deleted_at: null,
    },
    select: { id: true },
  });
  if (taken) return err("User with this email already exists");

  const marketplaceUserId = target.nautical_user_id?.trim() || "";
  if (marketplaceUserId) {
    try {
      await updateMarketplaceEmail(marketplaceUserId, email);
    } catch (cause) {
      console.error("manufacturer-email", cause);
      return err("The email could not be updated. Try again.", 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { email },
    include: { role: true, manufacturer: true },
  });

  return ok(serialize(updated));
}

async function updateMarketplaceEmail(userId: string, email: string): Promise<void> {
  const apply = async (data: StaffUpdatePayload) => {
    const staffErrors = data.staffUpdate?.staffErrors ?? [];
    if (staffErrors.length || !data.staffUpdate?.user?.id) {
      throw new Error(marketplaceError(staffErrors) || "Marketplace email could not be updated.");
    }
  };

  try {
    const data = await executeMarketplaceMutation<StaffUpdatePayload>(
      "staffUpdate",
      { id: userId, input: { email } },
      { preserveTechnicalError: true },
    );
    await apply(data);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (!/permission/i.test(message)) throw cause;
    const operatorToken = await createMarketplaceOperatorAccessToken();
    const data = await nauticalGraphql<StaffUpdatePayload>(
      STAFF_EMAIL_MUTATION,
      { id: userId, email },
      { accessToken: operatorToken, authorizationScheme: "JWT", preserveTechnicalError: true },
    );
    await apply(data);
  }
}

function serialize(user: {
  id: number;
  email: string;
  name: string;
  is_active: number;
  role_id: number;
  manufacturer_id: number | null;
  created_at: Date;
  updated_at: Date;
  invitation_token: string | null;
  role: { id: number; name: string } | null;
  manufacturer: { id: number; name: string; slug: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    is_active: user.is_active,
    role_id: user.role_id,
    manufacturer_id: user.manufacturer_id,
    created_at: user.created_at,
    updated_at: user.updated_at,
    role: user.role,
    manufacturer: user.manufacturer,
    pending_invitation: user.invitation_token !== null,
  };
}
