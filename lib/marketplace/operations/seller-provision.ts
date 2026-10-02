import { prisma } from "@/lib/db";
import { recordSystemOk } from "@/lib/error-log";
import {
  executeMarketplaceMutation,
  executeMarketplaceQuery,
  createMarketplaceUserAccessToken,
  getNauticalConfig,
} from "@/lib/marketplace/graphql/client";
import type {
  AgreementBySlugPayload,
  AgreementCreatePayload,
  MarketplaceMeSellerPayload,
  PermissionGroupsPayload,
  PermissionGroupUpdatePayload,
  PrivateMetadataUpdatePayload,
  SellerShellCreatePayload,
  SellerStaffUsersPayload,
  SellerUserMappingCreatePayload,
  SellerWithOwnerCreatePayload,
  SellerAgreementAssignPayload,
  SellerAgreementAcknowledgePayload,
  SellerAgreementStatePayload,
  StaffCreatePayload,
  StaffUpdatePayload,
} from "@/app/graphql";

export type MarketplaceInviteLogContext = {
  path?: string | null;
  userId?: number | null;
};

const BRAND_PRIVATE_METADATA_KEY = "brand";
const BRAND_PRIVATE_METADATA_VALUE = "true";
const TECHNICAL = { preserveTechnicalError: true } as const;
const SELLER_ADMIN_GROUP_NAME = "seller admin";
const BRAND_AGREEMENT_SLUG = "brand-0";
const BRAND_AGREEMENT_TITLE = "Brand 0%";

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

function normalizeGroupName(name: string): string {
  return name.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isSellerAdminGroupName(name: string): boolean {
  const normalized = normalizeGroupName(name);
  return normalized === SELLER_ADMIN_GROUP_NAME || normalized === "selleradmin";
}

export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Manufacturer", lastName: "User" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function passwordLogContext(
  manufacturerId: number,
  extra?: MarketplaceInviteLogContext
): { source: string; path?: string | null; userId?: number | null; manufacturerId: number } {
  return {
    source: "set-password-marketplace",
    path: extra?.path ?? "/api/auth/set-password",
    userId: extra?.userId ?? null,
    manufacturerId,
  };
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

export async function resolveSellerAdminGroupId(): Promise<string> {
  const data = await executeMarketplaceQuery<PermissionGroupsPayload>(
    "permissionGroups",
    { first: 100 },
    TECHNICAL
  );
  const groups = data.permissionGroups?.edges ?? [];
  const match =
    groups.find((edge) => normalizeGroupName(edge.node.name) === SELLER_ADMIN_GROUP_NAME) ??
    groups.find((edge) => isSellerAdminGroupName(edge.node.name));
  const groupId = match?.node.id?.trim();
  if (!groupId) {
    const names = groups.map((edge) => edge.node.name).filter(Boolean).join(", ") || "none";
    throw new Error(`Marketplace Seller Admin permission group was not found. Groups: ${names}`);
  }
  return groupId;
}

async function createOrReuseStaffUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  sellerId?: string;
  isActive: boolean;
  addGroups?: string[];
}): Promise<string> {
  const staffInput: Record<string, unknown> = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
    isActive: input.isActive,
  };
  if (input.sellerId) staffInput.sellerId = input.sellerId;
  if (input.addGroups?.length) staffInput.addGroups = input.addGroups;

  const data = await executeMarketplaceMutation<StaffCreatePayload>(
    "staffCreate",
    { input: staffInput },
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
    const reusedId =
      duplicate?.users?.find((id) => Boolean(id?.trim()))?.trim() ||
      (duplicate ? createdId : "");
    if (reusedId) return reusedId;
    throw new Error(joinMutationErrors(errors) || "Marketplace staff user could not be created.");
  }
  if (!createdId) {
    throw new Error("Marketplace staff user could not be created.");
  }
  return createdId;
}

/** Persist marketplace staff id even if the Prisma client is stale. */
export async function persistMarketplaceStaffUserId(userId: number, staffUserId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE users SET nautical_user_id = ${staffUserId} WHERE id = ${userId}
  `;
}

export async function loadMarketplaceStaffUserId(userId: number): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ nautical_user_id: string | null }>>`
    SELECT nautical_user_id FROM users WHERE id = ${userId} LIMIT 1
  `;
  return rows[0]?.nautical_user_id?.trim() || null;
}

async function assignSellerAdminGroup(staffUserId: string, groupId: string): Promise<void> {
  const updateData = await executeMarketplaceMutation<StaffUpdatePayload>(
    "staffUpdate",
    { id: staffUserId, input: { addGroups: [groupId], isActive: true } },
    TECHNICAL
  );
  const staffErrors = updateData.staffUpdate?.staffErrors ?? [];
  if (staffErrors.length && !staffErrors.every((error) => isAlreadyExistsError(error.code, error.message))) {
    throw new Error(joinMutationErrors(staffErrors) || "Marketplace staff group could not be assigned.");
  }

  const groupData = await executeMarketplaceMutation<PermissionGroupUpdatePayload>(
    "permissionGroupUpdate",
    { id: groupId, input: { addUsers: [staffUserId] } },
    TECHNICAL
  );
  const groupErrors = groupData.permissionGroupUpdate?.permissionGroupErrors ?? [];
  if (groupErrors.length && !groupErrors.every((error) => isAlreadyExistsError(error.code, error.message))) {
    throw new Error(joinMutationErrors(groupErrors) || "Marketplace Seller Admin group could not be assigned.");
  }
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

function isZeroCommission(value: number | string): boolean {
  return Number(value) === 0;
}

function sellerHasCompleteBrandAgreement(
  seller: NonNullable<SellerAgreementStatePayload["seller"]>
): boolean {
  const brandMetadata = seller.privateMetadata.some(
    (item) =>
      item.key === BRAND_PRIVATE_METADATA_KEY && item.value === BRAND_PRIVATE_METADATA_VALUE
  );
  return Boolean(
    brandMetadata &&
      seller.agreement?.slug === BRAND_AGREEMENT_SLUG &&
      isZeroCommission(seller.agreement.defaultCommission) &&
      seller.agreementAcknowledged
  );
}

export async function isMarketplaceProvisionComplete(input: {
  localUserId: number;
  manufacturer: ManufacturerSellerRecord;
  email: string;
}): Promise<boolean> {
  const sellerId = input.manufacturer.nautical_seller_id?.trim();
  const staffUserId = await loadMarketplaceStaffUserId(input.localUserId);
  if (!sellerId || !staffUserId) return false;

  const state = await executeMarketplaceQuery<SellerAgreementStatePayload>(
    "sellerAgreementState",
    { id: sellerId },
    TECHNICAL
  );
  if (!state.seller || !sellerHasCompleteBrandAgreement(state.seller)) return false;

  await assertSellerHasMappedUser(sellerId, staffUserId, input.email);
  return true;
}

async function resolveBrandAgreementId(): Promise<string> {
  const existing = await executeMarketplaceQuery<AgreementBySlugPayload>(
    "agreementBySlug",
    { slug: BRAND_AGREEMENT_SLUG },
    TECHNICAL
  );
  if (existing.agreement) {
    if (!isZeroCommission(existing.agreement.defaultCommission)) {
      throw new Error(
        `Marketplace agreement ${BRAND_AGREEMENT_SLUG} must have a 0 commission.`
      );
    }
    if (!existing.agreement.isPublished) {
      throw new Error(`Marketplace agreement ${BRAND_AGREEMENT_SLUG} must be published.`);
    }
    return existing.agreement.id;
  }

  const data = await executeMarketplaceMutation<AgreementCreatePayload>(
    "agreementCreate",
    {
      input: {
        title: BRAND_AGREEMENT_TITLE,
        slug: BRAND_AGREEMENT_SLUG,
        defaultCommission: 0,
        isPublished: true,
        content: "Agreement for brand sellers with zero commission.",
        contentHtml: "<p>Agreement for brand sellers with zero commission.</p>",
      },
    },
    TECHNICAL
  );
  const payload = data.agreementCreate;
  const errors = payload?.agreementErrors ?? [];
  const agreement = payload?.agreement;
  if (errors.length || !agreement?.id) {
    throw new Error(joinMutationErrors(errors) || "Marketplace brand agreement could not be created.");
  }
  if (!isZeroCommission(agreement.defaultCommission)) {
    throw new Error("Marketplace brand agreement was created with a non-zero commission.");
  }
  return agreement.id;
}

async function assignAndAcknowledgeBrandAgreement(input: {
  sellerId: string;
  email: string;
  password: string;
  logContext: ReturnType<typeof passwordLogContext>;
}): Promise<{ agreementId: string; sellerAgreementId: string }> {
  const agreementId = await resolveBrandAgreementId();
  recordSystemOk(`Marketplace 0 commission agreement resolved (${agreementId})`, input.logContext);
  const current = await executeMarketplaceQuery<SellerAgreementStatePayload>(
    "sellerAgreementState",
    { id: input.sellerId },
    TECHNICAL
  );
  const seller = current.seller;
  if (!seller) throw new Error("Marketplace seller was not found while assigning its agreement.");

  const existingAssignment = seller.sellerAgreements.edges.find(
    (edge) => edge.node.plan?.id === agreementId
  )?.node;
  if (
    existingAssignment?.acknowledgedOn &&
    seller.agreement?.id === agreementId &&
    seller.agreementAcknowledged
  ) {
    recordSystemOk(
      `Marketplace agreement already assigned and acknowledged (${existingAssignment.id})`,
      input.logContext
    );
    return { agreementId, sellerAgreementId: existingAssignment.id };
  }

  let sellerAgreementId = existingAssignment?.id ?? "";
  if (!sellerAgreementId) {
    const assigned = await executeMarketplaceMutation<SellerAgreementAssignPayload>(
      "sellerAgreementAssign",
      {
        input: {
          agreement: agreementId,
          seller: input.sellerId,
          effectiveAt: new Date().toISOString().slice(0, 10),
        },
      },
      TECHNICAL
    );
    const payload = assigned.sellerAgreementAssign;
    const errors = payload?.agreementErrors ?? [];
    sellerAgreementId = payload?.sellerAgreement?.id?.trim() ?? "";
    if (errors.length || !sellerAgreementId) {
      throw new Error(joinMutationErrors(errors) || "Marketplace agreement could not be assigned.");
    }
    recordSystemOk(
      `Marketplace agreement assigned to seller ${input.sellerId} (${sellerAgreementId})`,
      input.logContext
    );
  } else {
    recordSystemOk(
      `Marketplace pending agreement assignment reused (${sellerAgreementId})`,
      input.logContext
    );
  }

  const sellerToken = await createMarketplaceUserAccessToken(input.email, input.password);
  const sellerAuth = { ...TECHNICAL, accessToken: sellerToken, authorizationScheme: "JWT" as const };
  const currentUser = await executeMarketplaceQuery<MarketplaceMeSellerPayload>(
    "marketplaceMeSeller",
    undefined,
    sellerAuth
  );
  if (currentUser.me?.seller?.id !== input.sellerId) {
    throw new Error(
      `Authenticated marketplace user is not linked to seller ${input.sellerId}.`
    );
  }
  const acknowledged =
    await executeMarketplaceMutation<SellerAgreementAcknowledgePayload>(
      "sellerAgreementAcknowledge",
      { id: input.sellerId, input: {} },
      sellerAuth
    );
  const payload = acknowledged.sellerAgreementAcknowledge;
  const errors = payload?.agreementErrors ?? [];
  if (errors.length || !payload?.sellerAgreement?.acknowledgedOn) {
    throw new Error(
      joinMutationErrors(errors) || "Marketplace agreement could not be acknowledged by the seller."
    );
  }
  recordSystemOk(
    `Marketplace agreement acknowledged by seller user ${input.email} (${sellerAgreementId})`,
    input.logContext
  );

  const verified = await executeMarketplaceQuery<SellerAgreementStatePayload>(
    "sellerAgreementState",
    { id: input.sellerId },
    TECHNICAL
  );
  const verifiedSeller = verified.seller;
  if (
    !verifiedSeller ||
    !sellerHasCompleteBrandAgreement(verifiedSeller) ||
    verifiedSeller.agreement?.id !== agreementId ||
    !verifiedSeller.agreementAcknowledged
  ) {
    throw new Error(
      "Marketplace seller agreement verification failed: brand metadata, 0 commission, or acceptance is missing."
    );
  }
  recordSystemOk(
    `Marketplace seller ${input.sellerId} verified with brand metadata and 0 commission agreement`,
    input.logContext
  );
  return { agreementId, sellerAgreementId };
}

async function createSellerWithOwner(input: {
  manufacturer: ManufacturerSellerRecord;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}): Promise<{ sellerId: string; staffUserId: string }> {
  const data = await executeMarketplaceMutation<SellerWithOwnerCreatePayload>(
    "sellerWithOwnerCreate",
    {
      user: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        password: input.password,
      },
      seller: { companyName: input.manufacturer.name.trim() },
    },
    TECHNICAL
  );
  const payload = data.sellerWithOwnerCreate;
  const errors = payload?.sellerErrors ?? [];
  const sellerId = payload?.seller?.id?.trim();
  const staffUserId = payload?.seller?.owner?.id?.trim();
  if (errors.length || !sellerId || !staffUserId) {
    throw new Error(joinMutationErrors(errors) || "Marketplace seller and owner could not be created.");
  }

  await prisma.manufacturer.update({
    where: { id: input.manufacturer.id },
    data: { nautical_seller_id: sellerId },
  });
  input.manufacturer.nautical_seller_id = sellerId;
  await setSellerBrandPrivateMetadata(sellerId);
  return { sellerId, staffUserId };
}

export async function provisionMarketplaceUserOnPasswordSet(options: {
  localUserId: number;
  manufacturer: ManufacturerSellerRecord;
  email: string;
  name: string;
  password: string;
  logContext?: MarketplaceInviteLogContext;
}): Promise<{ sellerId: string; staffUserId: string }> {
  if (!getNauticalConfig()) {
    throw new Error("Marketplace integration is not configured.");
  }

  const ctx = passwordLogContext(options.manufacturer.id, options.logContext);
  console.info("[marketplace] creating seller admin user", {
    email: options.email,
    manufacturerId: options.manufacturer.id,
    localUserId: options.localUserId,
  });
  recordSystemOk(`Marketplace user creation started for ${options.email}`, ctx);
  const { firstName, lastName } = splitPersonName(options.name);
  const groupId = await resolveSellerAdminGroupId();
  recordSystemOk(`Marketplace Seller Admin group resolved (${groupId})`, ctx);

  let sellerId = options.manufacturer.nautical_seller_id?.trim() || "";
  let staffUserId = await loadMarketplaceStaffUserId(options.localUserId) ?? "";

  if (sellerId && staffUserId) {
    recordSystemOk(
      `Marketplace seller and staff user reused (${sellerId}, ${staffUserId})`,
      ctx
    );
  } else if (sellerId) {
    staffUserId = await createOrReuseStaffUser({
      email: options.email,
      firstName,
      lastName,
      companyName: options.manufacturer.name,
      sellerId,
      isActive: true,
      addGroups: [groupId],
    });
    recordSystemOk(
      `Marketplace staff user created (${staffUserId}) for existing seller ${sellerId}`,
      ctx
    );
  } else {
    const created = await createSellerWithOwner({
      manufacturer: options.manufacturer,
      email: options.email,
      firstName,
      lastName,
      password: options.password,
    });
    sellerId = created.sellerId;
    staffUserId = created.staffUserId;
    recordSystemOk(
      `Marketplace seller and owner created (${sellerId}, ${staffUserId}) for ${options.email}`,
      ctx
    );
  }

  await assignSellerAdminGroup(staffUserId, groupId);
  recordSystemOk(`Marketplace Seller Admin group assigned to ${staffUserId}`, ctx);

  await mapStaffUserToSeller(sellerId, staffUserId);
  await assertSellerHasMappedUser(sellerId, staffUserId, options.email);
  await persistMarketplaceStaffUserId(options.localUserId, staffUserId);
  recordSystemOk(
    `Marketplace user id saved for local user ${options.localUserId} (${staffUserId})`,
    ctx
  );

  const agreement = await assignAndAcknowledgeBrandAgreement({
    sellerId,
    email: options.email,
    password: options.password,
    logContext: ctx,
  });
  recordSystemOk(
    `Marketplace 0 commission agreement ${agreement.agreementId} assigned and acknowledged (${agreement.sellerAgreementId})`,
    ctx
  );
  return { sellerId, staffUserId };
}
