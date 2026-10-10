import { prisma } from "@/lib/db";
import {
  decryptDistributorPassword,
  hashDistributorInvitationToken,
} from "@/lib/distributor-invitation-token";
import {
  createMarketplaceOperatorAccessToken,
  createMarketplaceUserAccessToken,
  nauticalGraphql,
} from "@/lib/marketplace/graphql/client";
import { sendSellerAgreementNeededNotice } from "@/lib/email";
import { provisionMarketplaceDistributorSeller } from "@/lib/marketplace/operations/seller-provision";

type InvitationRow = {
  id: number;
  manufacturer_id: number;
  company_name: string;
  contact_name: string;
  email: string;
  invitation_token_expires_at: Date | null;
  marketplace_password_ciphertext: string | null;
  brand_name: string;
};

const PASSWORD_CHANGE_MUTATION = `
mutation PasswordChange($oldPassword: String!, $newPassword: String!) {
  passwordChange(oldPassword: $oldPassword, newPassword: $newPassword) {
    user { id email }
    accountErrors { field message code }
  }
}
`;

const STAFF_BY_EMAIL_QUERY = `
query StaffByEmail($search: String!) {
  staffUsers(first: 5, filter: { search: $search }) {
    edges { node { id email } }
  }
}
`;

const STAFF_DELETE_MUTATION = `
mutation StaffDelete($id: ID!) {
  staffDelete(id: $id) {
    user { id }
    staffErrors { field message code }
  }
}
`;

const SELLERS_BY_OWNER_EMAIL_QUERY = `
query SellersByOwnerEmail($search: String!) {
  sellers(first: 10, filter: { search: $search }) {
    edges { node { id owner { id email } } }
  }
}
`;

const RELEASE_OWNER_EMAIL_MUTATION = `
mutation ReleaseOwnerEmail($id: ID!, $email: String!) {
  staffUpdate(id: $id, input: { email: $email }) {
    user { id }
    staffErrors { field message code }
  }
}
`;

export type DistributorInvitationPreview = {
  email: string;
  brandName: string;
  companyName: string;
};

export async function previewDistributorInvitation(
  token: string,
): Promise<DistributorInvitationPreview | null> {
  const row = await findInvitation(token);
  if (!row || isExpired(row.invitation_token_expires_at)) return null;
  return {
    email: row.email,
    brandName: row.brand_name,
    companyName: row.company_name,
  };
}

export async function acceptDistributorInvitation(
  token: string,
  password: string,
): Promise<{ email: string }> {
  const row = await findInvitation(token);
  if (!row || isExpired(row.invitation_token_expires_at)) {
    throw new Error("This invitation link is invalid or has expired.");
  }

  const ciphertext = row.marketplace_password_ciphertext?.trim() || "";
  if (ciphertext) {
    const currentPassword = decryptDistributorPassword(ciphertext);
    await changeMarketplacePassword(row.email, currentPassword, password);
  } else {
    await replaceMarketplaceOwnerPassword(row, password);
  }

  await prisma.$executeRaw`
    UPDATE authorized_distributors
    SET invitation_token_hash = NULL,
        invitation_token_expires_at = NULL,
        marketplace_password_ciphertext = NULL,
        status = 'active',
        updated_at = NOW()
    WHERE id = ${row.id}
  `;

  await notifyAgreementTeam(row);

  return { email: row.email };
}

async function notifyAgreementTeam(row: InvitationRow): Promise<void> {
  try {
    const ids = await prisma.$queryRaw<
      Array<{ nautical_seller_id: string | null; nautical_user_id: string | null }>
    >`
      SELECT nautical_seller_id, nautical_user_id
      FROM authorized_distributors
      WHERE id = ${row.id}
      LIMIT 1
    `;
    const sent = await sendSellerAgreementNeededNotice({
      manufacturerName: row.brand_name,
      companyName: row.company_name,
      userName: row.contact_name,
      userEmail: row.email,
      sellerId: ids[0]?.nautical_seller_id?.trim() || "",
      marketplaceUserId: ids[0]?.nautical_user_id?.trim() || "",
    });
    if (!sent) {
      console.error("distributor-agreement-notice", "email was not sent");
    }
  } catch (error) {
    console.error("distributor-agreement-notice", error);
  }
}

async function findInvitation(token: string): Promise<InvitationRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const hash = hashDistributorInvitationToken(trimmed);
  const rows = await prisma.$queryRaw<InvitationRow[]>`
    SELECT
      d.id,
      d.manufacturer_id,
      d.company_name,
      d.contact_name,
      d.email,
      d.invitation_token_expires_at,
      d.marketplace_password_ciphertext,
      m.name AS brand_name
    FROM authorized_distributors d
    JOIN manufacturers m ON m.id = d.manufacturer_id
    WHERE d.invitation_token_hash = ${hash}
      AND d.deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function isExpired(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() <= Date.now();
}

async function changeMarketplacePassword(
  email: string,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const accessToken = await createMarketplaceUserAccessToken(email, currentPassword);
  const data = await nauticalGraphql<{
    passwordChange: {
      user: { id: string } | null;
      accountErrors: Array<{ message?: string | null }>;
    } | null;
  }>(
    PASSWORD_CHANGE_MUTATION,
    { oldPassword: currentPassword, newPassword: nextPassword },
    { accessToken, authorizationScheme: "JWT", preserveTechnicalError: true },
  );
  const errors = data.passwordChange?.accountErrors ?? [];
  if (errors.length || !data.passwordChange?.user?.id) {
    throw new Error("The password could not be saved. Open the invitation email and try again.");
  }
}

async function replaceMarketplaceOwnerPassword(
  row: InvitationRow,
  password: string,
): Promise<void> {
  // Seller owners are not staff, and the app token cannot delete them.
  // Free the email by renaming that user, then create the owner with the chosen password.
  const operatorToken = await createMarketplaceOperatorAccessToken();
  const owner = await findSellerOwnerByEmail(row.email);
  if (owner) {
    await releaseOwnerEmail(owner.ownerId, retiredOwnerEmail(row), operatorToken);
  } else {
    const existingUserId = await findStaffUserId(row.email);
    if (existingUserId) await deleteStaffUser(existingUserId, false, operatorToken);
  }

  await provisionMarketplaceDistributorSeller(
    {
      id: row.id,
      manufacturer_id: row.manufacturer_id,
      company_name: row.company_name,
      contact_name: row.contact_name,
      email: row.email,
    },
    { ownerPassword: password, replaceExisting: true },
  );
}

async function findSellerOwnerByEmail(
  email: string,
): Promise<{ sellerId: string; ownerId: string } | null> {
  const data = await nauticalGraphql<{
    sellers: {
      edges: Array<{ node: { id: string; owner: { id: string; email: string | null } | null } | null }>;
    } | null;
  }>(SELLERS_BY_OWNER_EMAIL_QUERY, { search: email }, { preserveTechnicalError: true });
  const wanted = email.trim().toLowerCase();
  const match = (data.sellers?.edges ?? []).find(
    (edge) => (edge.node?.owner?.email ?? "").trim().toLowerCase() === wanted,
  );
  const sellerId = match?.node?.id?.trim() || "";
  const ownerId = match?.node?.owner?.id?.trim() || "";
  if (!sellerId || !ownerId) return null;
  return { sellerId, ownerId };
}

function retiredOwnerEmail(row: InvitationRow): string {
  const domain = row.email.split("@")[1]?.trim() || "example.com";
  return `retired.${row.id}.${Date.now()}@${domain}`;
}

async function releaseOwnerEmail(
  ownerId: string,
  retiredEmail: string,
  operatorToken: string,
): Promise<void> {
  const updated = await nauticalGraphql<{
    staffUpdate: { user: { id: string } | null; staffErrors: Array<{ message?: string | null; code?: string | null; field?: string | null }> } | null;
  }>(RELEASE_OWNER_EMAIL_MUTATION, { id: ownerId, email: retiredEmail }, {
    accessToken: operatorToken,
    authorizationScheme: "JWT",
    preserveTechnicalError: true,
  });
  const errors = updated.staffUpdate?.staffErrors ?? [];
  if (errors.length || !updated.staffUpdate?.user?.id) {
    throw new Error(mutationError(errors) || "Marketplace owner email could not be released.");
  }
}

async function deleteStaffUser(
  id: string,
  ignoreMissing: boolean,
  operatorToken: string,
): Promise<void> {
  try {
    const deleted = await nauticalGraphql<{
      staffDelete: { staffErrors: Array<{ message?: string | null; code?: string | null }> } | null;
    }>(STAFF_DELETE_MUTATION, { id }, {
      accessToken: operatorToken,
      authorizationScheme: "JWT",
      preserveTechnicalError: true,
    });
    const errors = deleted.staffDelete?.staffErrors ?? [];
    if (!errors.length) return;
    if (ignoreMissing && errors.every((error) => isMissingUserError(error.message, error.code))) return;
    throw new Error(mutationError(errors) || "Marketplace staff user could not be removed.");
  } catch (error) {
    if (ignoreMissing && error instanceof Error && isMissingUserError(error.message)) return;
    throw error;
  }
}

function mutationError(
  errors: Array<{ field?: string | null; message?: string | null; code?: string | null }>,
): string {
  return errors
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
}

function isMissingUserError(message?: string | null, code?: string | null): boolean {
  const haystack = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  return /not found|does not exist|could not resolve|couldn't resolve|invalid id/.test(haystack);
}

async function findStaffUserId(email: string): Promise<string> {
  const data = await nauticalGraphql<{
    staffUsers: {
      edges: Array<{ node: { id: string; email: string | null } | null }>;
    } | null;
  }>(STAFF_BY_EMAIL_QUERY, { search: email }, { preserveTechnicalError: true });
  const wanted = email.trim().toLowerCase();
  const match = (data.staffUsers?.edges ?? []).find(
    (edge) => (edge.node?.email ?? "").trim().toLowerCase() === wanted,
  );
  return match?.node?.id?.trim() || "";
}
