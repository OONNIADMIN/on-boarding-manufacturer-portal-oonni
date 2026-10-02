import { describe, expect, it } from "vitest";
import { companyNamesMatch, pickSellerId } from "@/lib/marketplace/operations/sellers";

describe("companyNamesMatch", () => {
  it("matches the same company ignoring case and legal suffixes", () => {
    expect(companyNamesMatch("WINCO", "Winco")).toBe(true);
    expect(companyNamesMatch("Winco, Inc.", "Winco")).toBe(true);
    expect(companyNamesMatch("Winco DWL", "Winco")).toBe(true);
  });

  it("does not treat a short token as a match", () => {
    expect(companyNamesMatch("Co", "Winco")).toBe(false);
    expect(companyNamesMatch("Acme Furniture", "Winco")).toBe(false);
  });
});

describe("pickSellerId", () => {
  it("prefers the exact company over a longer name that only contains it", () => {
    const id = pickSellerId(
      [
        { id: "longer", companyName: "Winco DWL" },
        { id: "exact", companyName: "Winco" },
      ],
      "Winco"
    );
    expect(id).toBe("exact");
  });

  it("returns null when no company name matches", () => {
    expect(pickSellerId([{ id: "other", companyName: "Acme" }], "Winco")).toBeNull();
  });
});
