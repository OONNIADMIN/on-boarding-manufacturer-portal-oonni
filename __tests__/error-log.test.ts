import { describe, expect, it } from "vitest";
import { isPublicSupportMessage, publicSupportMessage, SUPPORT_CONTACT_URL } from "@/lib/support";

describe("public support error copy", () => {
  it("keeps the technical detail out of the user-facing message", () => {
    const text = publicSupportMessage("abc123def456");
    expect(text).toContain("Please contact support");
    expect(text).toContain("Reference: abc123def456");
    expect(text).not.toContain("Prisma");
    expect(text).not.toContain("ECONNREFUSED");
  });

  it("recognizes the support message so the UI can render a link", () => {
    expect(isPublicSupportMessage(publicSupportMessage("abc"))).toBe(true);
    expect(isPublicSupportMessage("File exceeds 150MB limit")).toBe(false);
    expect(SUPPORT_CONTACT_URL).toBe("https://www.oonni.com/contact");
  });
});
