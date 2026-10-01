import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_MUTATIONS } from "@/app/graphql";
import { splitPersonName } from "@/lib/marketplace/operations/seller-provision";

vi.mock("@/lib/db", () => ({
  prisma: {
    manufacturer: {
      update: vi.fn(async ({ data }: { data: { nautical_seller_id: string } }) => ({
        nautical_seller_id: data.nautical_seller_id,
      })),
    },
  },
}));

const executeMarketplaceMutation = vi.fn();
const executeMarketplaceQuery = vi.fn();
const getNauticalConfig = vi.fn(() => ({ url: "https://marketplace.example/graphql", token: "token" }));

vi.mock("@/lib/marketplace/graphql/client", () => ({
  executeMarketplaceMutation: (...args: unknown[]) => executeMarketplaceMutation(...args),
  executeMarketplaceQuery: (...args: unknown[]) => executeMarketplaceQuery(...args),
  getNauticalConfig: () => getNauticalConfig(),
}));

describe("marketplace seller provision", () => {
  beforeEach(() => {
    executeMarketplaceMutation.mockReset();
    executeMarketplaceQuery.mockReset();
    getNauticalConfig.mockReturnValue({ url: "https://marketplace.example/graphql", token: "token" });
  });

  it("does not use agreementCommissionCreate to create a seller", () => {
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerShellCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("staffCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerUserMappingCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).not.toContain("agreementCommissionCreate");
  });

  it("splits a full name into first and last names", () => {
    expect(splitPersonName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(splitPersonName("Ada")).toEqual({ firstName: "Ada", lastName: "Ada" });
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

  it("fails when staffCreate returns errors even if a user payload is present", async () => {
    const { provisionMarketplaceStaffForSeller } = await import("@/lib/marketplace/operations/seller-provision");
    executeMarketplaceMutation.mockResolvedValue({
      staffCreate: {
        user: { id: "VXNlcjox", email: "ada@example.com" },
        staffErrors: [{ field: "sellerId", code: "INVALID", message: "Seller assignment failed" }],
      },
    });

    await expect(
      provisionMarketplaceStaffForSeller({
        sellerId: "U2VsbGVyOjEw",
        email: "ada@example.com",
        name: "Ada Lovelace",
        companyName: "Acme",
      })
    ).rejects.toThrow(/Seller assignment failed/);
    expect(executeMarketplaceMutation).toHaveBeenCalledTimes(1);
    expect(executeMarketplaceMutation.mock.calls[0][0]).toBe("staffCreate");
  });

  it("creates a seller, stores the id, then creates staff and mapping", async () => {
    const { prisma } = await import("@/lib/db");
    const { provisionMarketplaceManufacturer } = await import("@/lib/marketplace/operations/seller-provision");

    executeMarketplaceMutation.mockImplementation(async (name: string) => {
      if (name === "sellerShellCreate") {
        return {
          sellerShellCreate: {
            ok: true,
            seller: { id: "U2VsbGVyOjEw", companyName: "Acme" },
            sellerErrors: [],
          },
        };
      }
      if (name === "privateMetadataUpdate") {
        return { privateMetadataUpdate: { metadataErrors: [] } };
      }
      if (name === "staffCreate") {
        return { staffCreate: { user: { id: "VXNlcjox", email: "ada@example.com" }, staffErrors: [] } };
      }
      if (name === "sellerUserMappingCreate") {
        return {
          sellerUserMappingCreate: { ok: true, sellerUser: { id: "bWFwcGluZzox", isDefault: true }, sellerErrors: [] },
        };
      }
      throw new Error(`unexpected mutation ${name}`);
    });
    executeMarketplaceQuery.mockResolvedValue({
      seller: {
        id: "U2VsbGVyOjEw",
        sellerusers: {
          edges: [{ node: { id: "bWFwcGluZzox", isDefault: true, user: { id: "VXNlcjox", email: "ada@example.com" } } }],
        },
      },
    });

    const manufacturer = { id: 3, name: "Acme", nautical_seller_id: null };
    const result = await provisionMarketplaceManufacturer({
      manufacturer,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });

    expect(result).toEqual({ sellerId: "U2VsbGVyOjEw", staffUserId: "VXNlcjox" });
    expect(prisma.manufacturer.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { nautical_seller_id: "U2VsbGVyOjEw" },
    });
    expect(executeMarketplaceMutation.mock.calls.map((call) => call[0])).toEqual([
      "sellerShellCreate",
      "privateMetadataUpdate",
      "staffCreate",
      "sellerUserMappingCreate",
    ]);
    expect(executeMarketplaceQuery).toHaveBeenCalledWith("sellerStaffUsers", { id: "U2VsbGVyOjEw" }, expect.anything());
  });
});
