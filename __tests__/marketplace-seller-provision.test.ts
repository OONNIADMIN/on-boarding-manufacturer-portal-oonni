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
const getNauticalConfig = vi.fn(() => ({ url: "https://marketplace.example/graphql", token: "token" }));

vi.mock("@/lib/marketplace/graphql/client", () => ({
  executeMarketplaceMutation: (...args: unknown[]) => executeMarketplaceMutation(...args),
  getNauticalConfig: () => getNauticalConfig(),
}));

describe("marketplace seller provision", () => {
  beforeEach(() => {
    executeMarketplaceMutation.mockReset();
    getNauticalConfig.mockReturnValue({ url: "https://marketplace.example/graphql", token: "token" });
  });

  it("does not use agreementCommissionCreate to create a seller", () => {
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerShellCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("staffCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).toContain("sellerUserMappingCreate");
    expect(Object.keys(MARKETPLACE_MUTATIONS)).not.toContain("agreementCommissionCreate");
    expect(MARKETPLACE_MUTATIONS.sellerShellCreate).toContain("sellerShellCreate");
    expect(MARKETPLACE_MUTATIONS.privateMetadataUpdate).toContain("privateMetadataUpdate");
    expect(MARKETPLACE_MUTATIONS.privateMetadataUpdate).toContain("MetadataInput");
  });

  it("splits a full name into first and last names", () => {
    expect(splitPersonName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(splitPersonName("Ada")).toEqual({ firstName: "Ada", lastName: "Ada" });
  });

  it("does not create a second marketplace seller when the manufacturer already has one", async () => {
    const { ensureMarketplaceSeller } = await import("@/lib/marketplace/operations/seller-provision");
    executeMarketplaceMutation.mockResolvedValue({
      privateMetadataUpdate: { metadataErrors: [] },
    });

    const sellerId = await ensureMarketplaceSeller({
      id: 9,
      name: "Acme",
      nautical_seller_id: "U2VsbGVyOjQy",
    });

    expect(sellerId).toBe("U2VsbGVyOjQy");
    expect(executeMarketplaceMutation).toHaveBeenCalledTimes(1);
    expect(executeMarketplaceMutation.mock.calls[0][0]).toBe("privateMetadataUpdate");
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
    expect(executeMarketplaceMutation.mock.calls[1][1]).toEqual({
      id: "U2VsbGVyOjEw",
      input: [{ key: "brand", value: "true" }],
    });
    expect(executeMarketplaceMutation.mock.calls[2][1]).toMatchObject({
      input: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        sellerId: "U2VsbGVyOjEw",
      },
    });
  });
});
