import { prisma } from "@/lib/db";
import { distributorSetPasswordUrl, sendDistributorInvitation } from "@/lib/email";
import {
  distributorInvitationExpiry,
  hashDistributorInvitationToken,
  newDistributorInvitationToken,
} from "@/lib/distributor-invitation-token";
import { provisionMarketplaceDistributorSeller } from "@/lib/marketplace/operations/seller-provision";

export const DISTRIBUTOR_STATUSES = ["active", "invite_sent", "not_invited"] as const;

export type DistributorStatus = (typeof DISTRIBUTOR_STATUSES)[number];

export type DistributorRecord = {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  region: string | null;
  valid_until: string | null;
  status: DistributorStatus;
  invitation_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isDistributorStatus(value: unknown): value is DistributorStatus {
  return typeof value === "string" && DISTRIBUTOR_STATUSES.includes(value as DistributorStatus);
}

export function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export function serializeDistributor(row: {
  id: number;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  region: string | null;
  valid_until: Date | null;
  status: string;
  invitation_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): DistributorRecord {
  return {
    id: row.id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    region: row.region,
    valid_until: row.valid_until ? row.valid_until.toISOString().slice(0, 10) : null,
    status: isDistributorStatus(row.status) ? row.status : "not_invited",
    invitation_sent_at: row.invitation_sent_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function parseDistributorFields(body: Record<string, unknown>, partial = false) {
  const text = (key: string, required: boolean, max: number): { error: string } | { value?: string | null } => {
    const raw = body[key];
    if (raw === undefined) {
      if (partial) return {};
      return required ? { error: `${key.replace(/_/g, " ")} is required` } : { value: null };
    }
    if (raw === null) {
      if (required) return { error: `${key.replace(/_/g, " ")} is required` };
      return { value: null };
    }
    if (typeof raw !== "string") return { error: `${key.replace(/_/g, " ")} must be text` };
    const value = raw.trim();
    if (required && !value) return { error: `${key.replace(/_/g, " ")} is required` };
    if (value.length > max) return { error: `${key.replace(/_/g, " ")} is too long` };
    return { value: value || null };
  };

  const company_name = text("company_name", true, 255);
  const contact_name = text("contact_name", true, 255);
  const email = text("email", true, 255);
  const phone = text("phone", false, 50);
  const region = text("region", false, 120);
  if ("error" in company_name) return company_name;
  if ("error" in contact_name) return contact_name;
  if ("error" in email) return email;
  if ("error" in phone) return phone;
  if ("error" in region) return region;

  if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return { error: "Enter a valid email address" };
  }

  const validUntil = parseOptionalDate(body.valid_until);
  if (body.valid_until !== undefined && validUntil === undefined) {
    return { error: "valid_until must be a date" };
  }

  let status: DistributorStatus | undefined;
  if (body.status !== undefined) {
    if (!isDistributorStatus(body.status)) return { error: "Invalid status" };
    status = body.status;
  }

  return {
    company_name: company_name.value ?? undefined,
    contact_name: contact_name.value ?? undefined,
    email: email.value?.toLowerCase() ?? undefined,
    phone: phone.value,
    region: region.value,
    valid_until: validUntil,
    status,
    send_invite: body.send_invite === true,
  };
}

export async function inviteAuthorizedDistributor(opts: {
  distributor: {
    id: number;
    manufacturer_id: number;
    company_name: string;
    contact_name: string;
    email: string;
    status: string;
    nautical_seller_id?: string | null;
    nautical_user_id?: string | null;
  };
  brandName: string;
}): Promise<{ error: string } | { ok: true }> {
  const resend = opts.distributor.status === "invite_sent" || opts.distributor.status === "active";
  try {
    await provisionMarketplaceDistributorSeller(opts.distributor);
  } catch (error) {
    const raw = error instanceof Error ? error.message.trim() : "";
    const alreadyExists = /unique|already exists|uq_user_email_normalized_per_tenant/i.test(raw);
    if (!(resend && alreadyExists)) {
      return { error: raw || "The distributor seller account could not be created." };
    }
  }

  const token = newDistributorInvitationToken();
  const expiresAt = distributorInvitationExpiry();
  await prisma.$executeRaw`
    UPDATE authorized_distributors
    SET invitation_token_hash = ${hashDistributorInvitationToken(token)},
        invitation_token_expires_at = ${expiresAt},
        updated_at = NOW()
    WHERE id = ${opts.distributor.id}
  `;

  const sent = await sendDistributorInvitation({
    email: opts.distributor.email,
    contactName: opts.distributor.contact_name,
    companyName: opts.distributor.company_name,
    brandName: opts.brandName,
    acceptUrl: distributorSetPasswordUrl(token),
  });
  if (!sent) {
    return { error: "The marketplace account was created, but the invitation email could not be sent. Try again later." };
  }

  await prisma.authorizedDistributor.update({
    where: { id: opts.distributor.id },
    data: {
      status: opts.distributor.status === "active" ? "active" : "invite_sent",
      invitation_sent_at: new Date(),
    },
  });
  return { ok: true };
}
