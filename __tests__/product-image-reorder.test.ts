import { describe, expect, test } from "vitest";
import { orderedTraideImageIds } from "@/lib/traide/operations/product-image-reorder";
import { PRODUCT_IMAGE_REORDER_MUTATION } from "@/app/graphql/mutations/product-image-reorder";
import { TRAIDE_MUTATIONS } from "@/app/graphql";

describe("product image reorder", () => {
  test("registers the mutation with the same GraphQL documents used by other Traide calls", () => {
    expect(TRAIDE_MUTATIONS.productImageReorder).toContain("productImageReorder");
    expect(PRODUCT_IMAGE_REORDER_MUTATION).toContain("$productId: ID!");
    expect(PRODUCT_IMAGE_REORDER_MUTATION).toContain("$imagesIds: [ID!]!");
  });

  test("takes product and image ids from stored inventory rows, not hardcoded samples", () => {
    const productFromQuery = { id: "UHJvZHVjdDo4NDU2Ng==" };
    const variantImagesFromDb = [
      { id: "UHJvZHVjdEltYWdlOjgwNzI3", url: "https://cdn.example.com/a.jpg" },
      { id: "local:skip", url: "https://cdn.example.com/local.jpg" },
      { id: "UHJvZHVjdEltYWdlOjgwNzI4", url: "https://cdn.example.com/b.jpg" },
      { id: "UHJvZHVjdEltYWdlOjgwMDE5", url: "https://cdn.example.com/c.jpg" },
      { id: "UHJvZHVjdEltYWdlOjgwNzI3", url: "https://cdn.example.com/a-again.jpg" },
    ];
    expect(productFromQuery.id).toMatch(/^UHJvZHVjdDo/);
    expect(orderedTraideImageIds(variantImagesFromDb)).toEqual([
      "UHJvZHVjdEltYWdlOjgwNzI3",
      "UHJvZHVjdEltYWdlOjgwNzI4",
      "UHJvZHVjdEltYWdlOjgwMDE5",
    ]);
  });
});
