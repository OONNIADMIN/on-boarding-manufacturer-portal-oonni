import { beforeEach, describe, expect, it, vi } from "vitest";

const provisionMarketplaceDistributorSeller = vi.fn();
const sendDistributorInvitation = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    authorizedDistributor: {
      update: vi.fn(async () => ({})),
    },
    $executeRaw: vi.fn(async () => 1),
  },
}));

vi.mock("@/lib/email", () => ({
  sendDistributorInvitation: (...args: unknown[]) => sendDistributorInvitation(...args),
  distributorSetPasswordUrl: (token: string) =>
    `http://localhost:3003/set-password?token=${token}`,
}));

vi.mock("@/lib/marketplace/operations/seller-provision", () => ({
  provisionMarketplaceDistributorSeller: (...args: unknown[]) =>
    provisionMarketplaceDistributorSeller(...args),
}));

const distributor = {
  id: 1,
  manufacturer_id: 7,
  company_name: "Test compani",
  contact_name: "Ada Lovelace",
  email: "brandportaloonni011@yopmail.com",
  status: "invite_sent",
};

describe("inviteAuthorizedDistributor", () => {
  beforeEach(() => {
    provisionMarketplaceDistributorSeller.mockReset();
    sendDistributorInvitation.mockReset();
    sendDistributorInvitation.mockResolvedValue(true);
  });

  it("resends the email when the marketplace user already exists", async () => {
    provisionMarketplaceDistributorSeller.mockRejectedValue(
      new Error(
        "email: UNIQUE: User with this Tenant and Email already exists.; INVALID: Constraint “uq_user_email_normalized_per_tenant” is violated."
      )
    );
    const { inviteAuthorizedDistributor } = await import("@/lib/distributors");
    const { prisma } = await import("@/lib/db");

    const result = await inviteAuthorizedDistributor({
      distributor,
      brandName: "Test brand",
    });

    expect(result).toEqual({ ok: true });
    expect(sendDistributorInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: distributor.email,
        contactName: distributor.contact_name,
        companyName: distributor.company_name,
        brandName: "Test brand",
        acceptUrl: expect.stringContaining("/set-password?token="),
      }),
    );
    expect(prisma.authorizedDistributor.update).toHaveBeenCalled();
  });

  it("does not send a first invite when marketplace user creation fails", async () => {
    provisionMarketplaceDistributorSeller.mockRejectedValue(
      new Error("email: UNIQUE: User with this Tenant and Email already exists.")
    );
    const { inviteAuthorizedDistributor } = await import("@/lib/distributors");

    const result = await inviteAuthorizedDistributor({
      distributor: { ...distributor, status: "not_invited" },
      brandName: "Test brand",
    });

    expect(result).toEqual({
      error: "email: UNIQUE: User with this Tenant and Email already exists.",
    });
    expect(sendDistributorInvitation).not.toHaveBeenCalled();
  });
});
