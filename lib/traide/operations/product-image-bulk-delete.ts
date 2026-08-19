import { executeTraideMutation } from "@/lib/traide/graphql/client";
import type { ProductImageBulkDeletePayload } from "@/app/graphql";

export async function productImageBulkDelete(ids: string[]): Promise<{ count: number; errors: string[] }> {
  if (!ids.length) return { count: 0, errors: [] };
  const data = await executeTraideMutation<ProductImageBulkDeletePayload>("productImageBulkDelete", { ids });
  const errors = (data.productImageBulkDelete.productErrors ?? [])
    .map((error) => [error.field, error.code, error.message].filter(Boolean).join(": "))
    .filter(Boolean);
  return { count: data.productImageBulkDelete.count ?? 0, errors };
}
