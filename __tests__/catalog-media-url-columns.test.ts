import { describe, expect, test } from "vitest";
import {
  cellLooksLikeImageUrl,
  cellLooksLikeRemoteAssetUrl,
  detectCatalogMediaUrlColumns,
  detectImageUrlColumns,
  resolveSkuColumn,
} from "@/lib/catalog-column-detection";
import { validateCatalogColumns } from "@/lib/catalog-column-validation";
import { catalogImageStorageKey, imageKitFilePathFromKey, isUniqueConstraintError } from "@/lib/image-record";
import { manufacturerImageKitImagesFolder } from "@/lib/manufacturer-media-path";

describe("catalog URL columns (original path)", () => {
  const header = ["Product #", "Image URL", "Video", "Spec PDF", "Notes"];
  const sample = [
    [
      "020-3-B",
      "https://cdn.example.com/spoon.jpg",
      "https://cdn.example.com/demo.mp4",
      "https://cdn.example.com/spec.pdf",
      "plain text",
    ],
  ];

  test("still detects image URL columns", () => {
    expect(cellLooksLikeImageUrl("https://cdn.example.com/spoon.jpg")).toBe(true);
    expect(detectImageUrlColumns(header, "Product #", undefined, sample)).toEqual(["Image URL"]);
  });

  test("also detects video and file URL columns without dropping image URLs", () => {
    expect(cellLooksLikeRemoteAssetUrl("https://cdn.example.com/demo.mp4")).toBe(true);
    expect(cellLooksLikeRemoteAssetUrl("https://cdn.example.com/spec.pdf")).toBe(true);
    expect(detectCatalogMediaUrlColumns(header, "Product #", undefined, sample)).toEqual([
      "Image URL",
      "Video",
      "Spec PDF",
    ]);
  });

  test("embedded-only Image column is not treated as a URL column", () => {
    const embeddedHeader = ["Product #", "Image"];
    const embeddedSample = [
      ["020-3-B", ""],
      ["020-3-ES", "#VALUE!"],
    ];
    expect(detectImageUrlColumns(embeddedHeader, "Product #", undefined, embeddedSample)).toEqual([]);
    expect(detectCatalogMediaUrlColumns(embeddedHeader, "Product #", undefined, embeddedSample)).toEqual(
      []
    );
  });

  test("locates SKU from admin candidates and does not block upload when other columns are missing", () => {
    const headers = ["Product #", "Product Description", "Image", "Stock items"];
    const rules = [
      {
        id: 1,
        label: "sku",
        candidates: ["sku", "product #", "item code"],
        sort_order: 0,
        is_active: true,
      },
      {
        id: 2,
        label: "brand",
        candidates: ["brand", "manufacturer"],
        sort_order: 1,
        is_active: true,
      },
    ];
    expect(resolveSkuColumn(headers, { rules })).toBe("Product #");
    const check = validateCatalogColumns(headers, rules);
    expect(check.valid).toBe(true);
    expect(check.missing).toContain("brand");
  });

  test("gives each product one storage key per file so repeats do not duplicate", () => {
    const company = { id: 9, slug: "unused-slug", name: "Acme Tools" };
    const filePath = `${manufacturerImageKitImagesFolder(company)}/photo.jpg`;
    expect(filePath).toBe("/Acme-Tools/images/photo.jpg");
    expect(manufacturerImageKitImagesFolder({ id: 2, slug: "other", name: "Northwind" })).toBe(
      "/Northwind/images"
    );
    expect(catalogImageStorageKey(filePath, "p12")).toBe(`${filePath}#p12`);
    expect(catalogImageStorageKey(filePath, "p12")).toBe(catalogImageStorageKey(filePath, "p12"));
    expect(catalogImageStorageKey(filePath, "p13")).toBe(`${filePath}#p13`);
    expect(imageKitFilePathFromKey(`${filePath}#p12`)).toBe(filePath);
    const longPath = `/${"a".repeat(490)}/photo.jpg`;
    expect(catalogImageStorageKey(longPath, "p1").length).toBeLessThanOrEqual(500);
    expect(
      isUniqueConstraintError({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`s3_key`)",
      })
    ).toBe(true);
  });
});
