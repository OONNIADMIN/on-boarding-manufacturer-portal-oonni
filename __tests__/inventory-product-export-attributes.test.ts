import { describe, expect, test } from "vitest";
import { resolveScopedCatalogAttributes } from "@/lib/inventory-attribute-catalog";

const productCatalog = [
  { id: "p-brand", name: "Brand", slug: "brand", inputType: "PLAIN_TEXT", valueRequired: true },
  { id: "p-desc", name: "Product description", slug: "product-description", inputType: "PLAIN_TEXT", valueRequired: true },
];
const variantCatalog = [
  { id: "v-color", name: "Color", slug: "color", inputType: "DROPDOWN", valueRequired: true },
  { id: "v-size", name: "Size", slug: "size", inputType: "DROPDOWN", valueRequired: true },
];

describe("product excel attributes", () => {
  test("drops variant attributes that were stored on the product", () => {
    const product = {
      attributes: [
        { id: "p-brand", name: "Brand", value: "Acme" },
        { id: "v-color", name: "Color", value: "Blue" },
        { id: "v-size", name: "Size", value: "M" },
      ],
    };
    const scoped = resolveScopedCatalogAttributes(product, productCatalog, variantCatalog);
    expect(scoped.map((attr) => attr.name).sort()).toEqual(["Brand", "Product description"]);
    expect(scoped.find((attr) => attr.name === "Brand")?.value).toBe("Acme");
    expect(scoped.some((attr) => attr.name === "Color")).toBe(false);
    expect(scoped.some((attr) => attr.name === "Size")).toBe(false);
  });

  test("keeps variant attributes only when scoping to the variant catalog", () => {
    const variant = {
      attributes: [
        { id: "p-brand", name: "Brand", value: "Acme" },
        { id: "v-color", name: "Color", value: "Blue" },
      ],
    };
    const scoped = resolveScopedCatalogAttributes(variant, variantCatalog, productCatalog);
    expect(scoped.map((attr) => attr.name)).toContain("Color");
    expect(scoped.map((attr) => attr.name)).toContain("Size");
    expect(scoped.some((attr) => attr.name === "Brand")).toBe(false);
  });

  test("drops variant attributes even when the product catalog is empty", () => {
    const product = {
      attributes: [
        { id: "p-brand", name: "Brand", value: "Acme" },
        { id: "v-color", name: "Color", value: "Blue" },
      ],
    };
    const scoped = resolveScopedCatalogAttributes(product, [], variantCatalog);
    expect(scoped.map((attr) => attr.name)).toEqual(["Brand"]);
  });
});
