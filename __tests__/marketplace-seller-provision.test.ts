import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_MUTATIONS } from "@/app/graphql";
import { isSellerAdminGroupName, splitPersonName } from "@/lib/marketplace/operations/seller-provision";

vi.mock("@/lib/db", () => ({
  prisma: {
    manufacturer: {
      update: vi.fn(async ({ data }: { data: { nautical_seller_id: string } }) => ({
        nautical_seller_id: data.nautical_seller_id,
      })),
    },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ nautical_user_id: null }]),
  },
}));

const executeMarketplaceMutation = vi.fn();
const executeMarketplaceQuery = vi.fn();
const createMarketplaceUserAccessToken = vi.fn(
  async (_email: string, _password: string) => "seller-token"
);
const getNauticalConfig = vi.fn(() => ({ url: "https://marketplace.example/graphql", token: "token" }));

vi.mock("@/lib/marketplace/graphql/client", () => ({
  executeMarketplaceMutation: (...args: unknown[]) => executeMarketplaceMutation(...args),
  executeMarketplaceQuery: (...args: unknown[]) => executeMarketplaceQuery(...args),
  createMarketplaceUserAccessToken: (email: string, password: string) =>
    createMarketplaceUserAccessToken(email, password),
  getNauticalConfig: () => getNauticalConfig(),
}));

vi.mock("@/lib/error-log", () => ({
  recordSystemOk: vi.fn(() => "okref"),
  recordSystemError: vi.fn(() => "errref"),
}));

function mockSellerAdminGroups() {
  let agreementStateCalls = 0;
  executeMarketplaceQuery.mockImplementation(async (name: string) => {
    if (name === "permissionGroups") {
      return {
        permissionGroups: {
          edges: [
            { node: { id: "R3JvdXA6MQ==", name: "Marketplace Operator" } },
            { node: { id: "R3JvdXA6Mg==", name: "Seller Admin" } },
          ],
        },
      };
    }
    if (name === "sellerStaffUsers") {
      return {
        seller: {
          id: "U2VsbGVyOjEw",
          sellerusers: {
            edges: [
              {
                node: {
                  id: "bWFwcGluZzox",
                  isDefault: true,
                  user: { id: "VXNlcjox", email: "ada@example.com" },
                },
              },
            ],
          },
        },
      };
    }
    if (name === "agreementBySlug") {
      return {
        agreement: {
          id: "QWdyZWVtZW50Ojk=",
          slug: "brand-0",
          title: "Brand 0%",
          defaultCommission: 0,
          isPublished: true,
        },
      };
    }
    if (name === "sellerAgreementState") {
      agreementStateCalls += 1;
      const acknowledged = agreementStateCalls > 1;
      return {
        seller: {
          id: "U2VsbGVyOjEw",
          privateMetadata: [{ key: "brand", value: "true" }],
          agreement: acknowledged
            ? { id: "QWdyZWVtZW50Ojk=", slug: "brand-0", defaultCommission: 0 }
            : null,
          agreementAcknowledged: acknowledged ? "2026-10-01T12:00:00Z" : null,
          sellerAgreements: { edges: [] },
        },
      };
    }
    if (name === "marketplaceMeSeller") {
      return {
        me: {
          id: "VXNlcjox",
          email: "ada@example.com",
          seller: { id: "U2VsbGVyOjEw" },
        },
      };
    }
    throw new Error(`unexpected query ${name}`);
  });
}

describe("marketplace seller provision", () => {
  beforeEach(() => {
    executeMarketplaceMutation.mockReset();
    executeMarketplaceQuery.mockReset();
    createMarketplaceUserAccessToken.mockClear();
    getNauticalConfig.mockReturnValue({ url: "https://marketplace.example/graphql", token: "token" });
  });

  it("uses sellerWithOwnerCreate when a password can be set, not agreementCommissionCreate", () => {
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerWithOwnerCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("staffCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("permissionGroupUpdate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerAgreementAssign");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerAgreementAcknowledge");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).not.toContain("agreementCommissionCreate");
  });

  it("splits a full name into first and last names", () => {
    expect(splitPersonName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(splitPersonName("Ada")).toEqual({ firstName: "Ada", lastName: "Ada" });
  });

  it("matches Seller Admin permission group names", () => {
    expect(isSellerAdminGroupName("Seller Admin")).toBe(true);
    expect(isSellerAdminGroupName("seller-admin")).toBe(true);
    expect(isSellerAdminGroupName("Marketplace Operator")).toBe(false);
  });

  it("does not create a second marketplace seller when the manufacturer already has one", async () => {
    const { ensureMarketplaceSeller } = await import("@/lib/marketplace/operations/seller-provision");

    const sellerId = await ensureMarketplaceSeller({
      id: 9,
      name: "Acme",
      nautical_seller_id: "U2VsbGVyOjQy",
    });

    expect(sellerId).toBe("U2VsbGVyOjQy");
    expect(executeMarketplaceMutation).not.toHaveBeenCalled();
  });

  it("creates seller and owner with the manufacturer password when no seller exists yet", async () => {
    const { prisma } = await import("@/lib/db");
    const { provisionMarketplaceUserOnPasswordSet } = await import(
      "@/lib/marketplace/operations/seller-provision"
    );
    mockSellerAdminGroups();
    executeMarketplaceMutation.mockImplementation(async (name: string) => {
      if (name === "sellerWithOwnerCreate") {
        return {
          sellerWithOwnerCreate: {
            seller: {
              id: "U2VsbGVyOjEw",
              companyName: "Acme",
              owner: { id: "VXNlcjox", email: "ada@example.com" },
            },
            sellerErrors: [],
          },
        };
      }
      if (name === "privateMetadataUpdate") {
        return { privateMetadataUpdate: { metadataErrors: [] } };
      }
      if (name === "staffUpdate") {
        return { staffUpdate: { user: { id: "VXNlcjox" }, staffErrors: [] } };
      }
      if (name === "permissionGroupUpdate") {
        return { permissionGroupUpdate: { group: { id: "R3JvdXA6Mg==", name: "Seller Admin" }, permissionGroupErrors: [] } };
      }
      if (name === "sellerUserMappingCreate") {
        return {
          sellerUserMappingCreate: { ok: true, sellerUser: { id: "bWFwcGluZzox", isDefault: true }, sellerErrors: [] },
        };
      }
      if (name === "sellerAgreementAssign") {
        return {
          sellerAgreementAssign: {
            sellerAgreement: {
              id: "QWdyZWVtZW50U2VsbGVyOjE=",
              effectiveAt: "2026-10-01",
              acknowledgedOn: null,
              plan: { id: "QWdyZWVtZW50Ojk=", slug: "brand-0", defaultCommission: 0 },
            },
            agreementErrors: [],
          },
        };
      }
      if (name === "sellerAgreementAcknowledge") {
        return {
          sellerAgreementAcknowledge: {
            sellerAgreement: {
              id: "QWdyZWVtZW50U2VsbGVyOjE=",
              effectiveAt: "2026-10-01",
              acknowledgedOn: "2026-10-01T12:00:00Z",
              plan: { id: "QWdyZWVtZW50Ojk=", slug: "brand-0", defaultCommission: 0 },
            },
            user: { id: "VXNlcjox", email: "ada@example.com" },
            agreementErrors: [],
          },
        };
      }
      throw new Error(`unexpected mutation ${name}`);
    });

    const result = await provisionMarketplaceUserOnPasswordSet({
      localUserId: 12,
      manufacturer: { id: 3, name: "Acme", nautical_seller_id: null },
      email: "ada@example.com",
      name: "Ada Lovelace",
      password: "SecretPass1!",
    });

    expect(result).toEqual({ sellerId: "U2VsbGVyOjEw", staffUserId: "VXNlcjox" });
    expect(prisma.manufacturer.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { nautical_seller_id: "U2VsbGVyOjEw" },
    });
    expect(executeMarketplaceMutation.mock.calls[0][0]).toBe("sellerWithOwnerCreate");
    expect(executeMarketplaceMutation.mock.calls[0][1]).toEqual({
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        password: "SecretPass1!",
      },
      seller: { companyName: "Acme" },
    });
    expect(executeMarketplaceMutation.mock.calls.map((call) => call[0])).toContain("permissionGroupUpdate");
    expect(executeMarketplaceMutation.mock.calls.map((call) => call[0])).toContain("sellerAgreementAssign");
    expect(executeMarketplaceMutation.mock.calls.map((call) => call[0])).toContain("sellerAgreementAcknowledge");
    const acknowledgeCall = executeMarketplaceMutation.mock.calls.find(
      (call) => call[0] === "sellerAgreementAcknowledge"
    );
    expect(acknowledgeCall?.[1]).toEqual({
      id: "U2VsbGVyOjEw",
      input: {},
    });
    expect(acknowledgeCall?.[2]).toMatchObject({
      accessToken: "seller-token",
      authorizationScheme: "JWT",
    });
    expect(createMarketplaceUserAccessToken).toHaveBeenCalledWith(
      "ada@example.com",
      "SecretPass1!"
    );
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it("creates staff on an existing seller and assigns Seller Admin without passwordUrl", async () => {
    const { provisionMarketplaceUserOnPasswordSet } = await import(
      "@/lib/marketplace/operations/seller-provision"
    );
    mockSellerAdminGroups();
    executeMarketplaceMutation.mockImplementation(async (name: string) => {
      if (name === "staffCreate") {
        return { staffCreate: { user: { id: "VXNlcjox", email: "ada@example.com" }, staffErrors: [] } };
      }
      if (name === "staffUpdate") {
        return { staffUpdate: { user: { id: "VXNlcjox" }, staffErrors: [] } };
      }
      if (name === "permissionGroupUpdate") {
        return { permissionGroupUpdate: { group: { id: "R3JvdXA6Mg==", name: "Seller Admin" }, permissionGroupErrors: [] } };
      }
      if (name === "sellerUserMappingCreate") {
        return {
          sellerUserMappingCreate: { ok: true, sellerUser: { id: "bWFwcGluZzox", isDefault: true }, sellerErrors: [] },
        };
      }
      if (name === "sellerAgreementAssign") {
        return {
          sellerAgreementAssign: {
            sellerAgreement: {
              id: "QWdyZWVtZW50U2VsbGVyOjE=",
              effectiveAt: "2026-10-01",
              acknowledgedOn: null,
              plan: { id: "QWdyZWVtZW50Ojk=", slug: "brand-0", defaultCommission: 0 },
            },
            agreementErrors: [],
          },
        };
      }
      if (name === "sellerAgreementAcknowledge") {
        return {
          sellerAgreementAcknowledge: {
            sellerAgreement: {
              id: "QWdyZWVtZW50U2VsbGVyOjE=",
              effectiveAt: "2026-10-01",
              acknowledgedOn: "2026-10-01T12:00:00Z",
              plan: { id: "QWdyZWVtZW50Ojk=", slug: "brand-0", defaultCommission: 0 },
            },
            user: { id: "VXNlcjox", email: "ada@example.com" },
            agreementErrors: [],
          },
        };
      }
      throw new Error(`unexpected mutation ${name}`);
    });

    const result = await provisionMarketplaceUserOnPasswordSet({
      localUserId: 12,
      manufacturer: { id: 3, name: "Acme", nautical_seller_id: "U2VsbGVyOjEw" },
      email: "ada@example.com",
      name: "Ada Lovelace",
      password: "SecretPass1!",
    });

    expect(result.staffUserId).toBe("VXNlcjox");
    const staffCreateInput = executeMarketplaceMutation.mock.calls.find((call) => call[0] === "staffCreate")?.[1];
    expect(staffCreateInput).toEqual({
      input: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        companyName: "Acme",
        isActive: true,
        sellerId: "U2VsbGVyOjEw",
        addGroups: ["R3JvdXA6Mg=="],
      },
    });
    expect(JSON.stringify(staffCreateInput)).not.toContain("passwordUrl");
    expect(executeMarketplaceMutation.mock.calls.map((call) => call[0])).not.toContain("sellerWithOwnerCreate");
  });

  it("detects a fully provisioned seller so login does not repeat the flow", async () => {
    const { prisma } = await import("@/lib/db");
    const { isMarketplaceProvisionComplete } = await import(
      "@/lib/marketplace/operations/seller-provision"
    );
    const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
    queryRawMock.mockResolvedValueOnce([{ nautical_user_id: "VXNlcjox" }]);
    executeMarketplaceQuery.mockImplementation(async (name: string) => {
      if (name === "sellerAgreementState") {
        return {
          seller: {
            id: "U2VsbGVyOjEw",
            privateMetadata: [{ key: "brand", value: "true" }],
            agreement: {
              id: "QWdyZWVtZW50Ojk=",
              slug: "brand-0",
              defaultCommission: 0,
            },
            agreementAcknowledged: "2026-10-01T12:00:00Z",
            sellerAgreements: { edges: [] },
          },
        };
      }
      if (name === "sellerStaffUsers") {
        return {
          seller: {
            id: "U2VsbGVyOjEw",
            sellerusers: {
              edges: [
                {
                  node: {
                    id: "bWFwcGluZzox",
                    isDefault: true,
                    user: { id: "VXNlcjox", email: "ada@example.com" },
                  },
                },
              ],
            },
          },
        };
      }
      throw new Error(`unexpected query ${name}`);
    });

    await expect(
      isMarketplaceProvisionComplete({
        localUserId: 12,
        manufacturer: {
          id: 3,
          name: "Acme",
          nautical_seller_id: "U2VsbGVyOjEw",
        },
        email: "ada@example.com",
      })
    ).resolves.toBe(true);
    expect(executeMarketplaceMutation).not.toHaveBeenCalled();
  });
});
