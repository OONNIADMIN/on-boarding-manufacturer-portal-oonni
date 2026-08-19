import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductImageCreatePayload } from "@/app/graphql";

export type TraideProductImageCreateInput = {
  url: string;
  product: string;
  transferImageOwnership: boolean;
  externalId: string;
  externalSource: string;
};

export async function productImageCreate(input: TraideProductImageCreateInput): Promise<{
  imageId: string | null;
  url: string | null;
  errors: string[];
}> {
  const data = await executeTraideMutation<ProductImageCreatePayload>("productImageCreate", { input });
  const errors = (data.productImageCreate.productErrors ?? [])
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean);
  return {
    imageId: data.productImageCreate.image?.id ?? null,
    url: data.productImageCreate.image?.url ?? input.url,
    errors,
  };
}
