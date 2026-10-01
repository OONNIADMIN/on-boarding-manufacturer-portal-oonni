import { prisma } from "@/lib/db";
import {
  executeMarketplaceMutation,
  executeMarketplaceQuery,
  getNauticalConfig,
} from "@/lib/marketplace/graphql/client";
import type {
  PrivateMetadataUpdatePayload,
  SellerShellCreatePayload,
  SellerStaffUsersPayload,
  SellerUserMappingCreatePayload,
  StaffCreatePayload,
} from "@/app/graphql";

const BRAND_PRIVATE_METADATA_KEY = "brand";
const BRAND_PRIVATE_METADATA_VALUE = "true";
const TECHNICAL = { preserveTechnicalError: true } as const;

export type ManufacturerSellerRecord = {
  id: number;
  name: string;
  nautical_seller_id: string | null;
};

function joinMutationErrors(
  errors: Array<{ field?: string | null; message?: string | null; code?: string | null }>
): string {
  return errors
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
}

function isAlreadyExistsError(code?: string | null, message?: string | null): boolean {
  const haystack = `${code ?? ""} ${message ?? ""}`.toLowerCase();
  return /unique|already exists|duplicate|already.?mapped|already assigned/.test(haystack);
}

export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Manufacturer", lastName: "User" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function setSellerBrandPrivateMetadata(sellerId: string): Promise<void> {
  const data = await executeMarketplaceMutation<PrivateMetadataUpdatePayload>(
    "privateMetadataUpdate",
    {
      id: sellerId,
      input: [{ key: BRAND_PRIVATE_METADATA_KEY, value: BRAND_PRIVATE_METADATA_VALUE }],
    },
    TECHNICAL
  );
  const errors = data.privateMetadataUpdate?.metadataErrors ?? [];
  if (errors.length) {
    throw new Error(joinMutationErrors(errors) || "Failed to set seller private metadata");
  }
}

/** Create the marketplace seller once and store its id. Re-invites skip seller creation. */
export async function ensureMarketplaceSeller(manufacturer: ManufacturerSellerRecord): Promise<string> {
  const existing = manufacturer.nautical_seller_id?.trim();
  if (existing) return existing;

  if (!getNauticalConfig()) {
    throw new Error("Marketplace integration is not configured.");
  }

  const companyName = manufacturer.name.trim();
  if (!companyName) {
    throw new Error("Manufacturer name is required to create a marketplace seller.");
  }

  const data = await executeMarketplaceMutation<SellerShellCreatePayload>(
    "sellerShellCreate",
    { name: companyName },
    TECHNICAL
  );
  const payload = data.sellerShellCreate;
  const errors = payload?.sellerErrors ?? [];
  const sellerId = payload?.seller?.id?.trim();
  if (errors.length || !sellerId) {
    throw new Error(joinMutationErrors(errors) || "Marketplace seller could not be created.");
  }

  await prisma.manufacturer.update({
    where: { id: manufacturer.id },
    data: { nautical_seller_id: sellerId },
  });
  manufacturer.nautical_seller_id = sellerId;

  await setSellerBrandPrivateMetadata(sellerId);
  return sellerId;
}

async function createOrReuseStaffUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  sellerId: string;
}): Promise<string> {
  const data = await executeMarketplaceMutation<StaffCreatePayload>(
    "staffCreate",
    {
      input: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        sellerId: input.sellerId,
        isActive: true,
      },
    },
    TECHNICAL
  );
  const payload = data.staffCreate;
  if (!payload) {
    throw new Error("Marketplace staffCreate returned no payload.");
  }

  const errors = payload.staffErrors ?? [];
  const createdId = payload.user?.id?.trim() ?? "";
  if (errors.length) {
    const duplicate = errors.find((error) => isAlreadyExistsError(error.code, error.message));
    const reusedId = duplicate?.users?.find((id) => Boolean(id?.trim()))?.trim();
    if (reusedId) return reusedId;
    throw new Error(joinMutationErrors(errors) || "Marketplace staff user could not be created.");
  }
  if (!createdId) {
    throw new Error("Marketplace staff user could not be created.");
  }
  return createdId;
}

async function mapStaffUserToSeller(sellerId: string, userId: string): Promise<void> {
  const data = await executeMarketplaceMutation<SellerUserMappingCreatePayload>(
    "sellerUserMappingCreate",
    { input: { seller: sellerId, user: userId } },
    TECHNICAL
  );
  const payload = data.sellerUserMappingCreate;
  if (!payload) {
    throw new Error("Marketplace sellerUserMappingCreate returned no payload.");
  }
  const errors = payload.sellerErrors ?? [];
  if (errors.length) {
    if (errors.every((error) => isAlreadyExistsError(error.code, error.message))) return;
    throw new Error(joinMutationErrors(errors) || "Marketplace seller user mapping could not be created.");
  }
  if (!payload.ok && !payload.sellerUser?.id) {
    throw new Error("Marketplace seller user mapping could not be created.");
  }
}

async function assertSellerHasMappedUser(sellerId: string, staffUserId: string, email: string): Promise<void> {
  const data = await executeMarketplaceQuery<SellerStaffUsersPayload>("sellerStaffUsers", { id: sellerId }, TECHNICAL);
  const mapped = (data.seller?.sellerusers?.edges ?? []).some((edge) => {
    const user = edge.node?.user;
    if (!user) return false;
    if (user.id === staffUserId) return true;
    return (user.email ?? "").trim().toLowerCase() === email.trim().toLowerCase();
  });
  if (!mapped) {
    throw new Error(
      `Marketplace staff user was created but is not mapped to the seller (${email}).`
    );
  }
}

export async function provisionMarketplaceStaffForSeller(options: {
  sellerId: string;
  email: string;
  name: string;
  companyName: string;
}): Promise<string> {
  const { firstName, lastName } = splitPersonName(options.name);
  const userId = await createOrReuseStaffUser({
    email: options.email,
    firstName,
    lastName,
    companyName: options.companyName,
    sellerId: options.sellerId,
  });
  await mapStaffUserToSeller(options.sellerId, userId);
  await assertSellerHasMappedUser(options.sellerId, userId, options.email);
  return userId;
}

/** Seller (once) + staff user mapped as the seller's primary marketplace user. */
export async function provisionMarketplaceManufacturer(options: {
  manufacturer: ManufacturerSellerRecord;
  email: string;
  name: string;
}): Promise<{ sellerId: string; staffUserId: string }> {
  const sellerId = await ensureMarketplaceSeller(options.manufacturer);
  const staffUserId = await provisionMarketplaceStaffForSeller({
    sellerId,
    email: options.email,
    name: options.name,
    companyName: options.manufacturer.name,
  });
  return { sellerId, staffUserId };
}
