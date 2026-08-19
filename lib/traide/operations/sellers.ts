import { executeTraideQuery } from "@/lib/traide/graphql/client";

type ApprovedSellerNode = {
  id: string;
  companyName?: string | null;
};

function pickApprovedSeller(nodes: ApprovedSellerNode[], search: string): string | null {
  const needle = search.trim().toLowerCase();
  if (!needle) return null;
  const sellers = nodes.filter((node) => node.id);
  const exact = sellers.find((node) => (node.companyName ?? "").trim().toLowerCase() === needle);
  if (exact?.id) return exact.id;
  const partial = sellers.find((node) => {
    const company = (node.companyName ?? "").trim().toLowerCase();
    return company.includes(needle) || needle.includes(company);
  });
  if (partial?.id) return partial.id;
  if (sellers.length === 1) return sellers[0].id;
  return null;
}

export async function searchApprovedSellerId(search: string): Promise<string | null> {
  const query = search.trim();
  if (!query) return null;
  const data = await executeTraideQuery<{
    sellers: { edges: Array<{ node: ApprovedSellerNode }> };
  }>("approvedSellers", { search: query });
  return pickApprovedSeller(
    data.sellers.edges.map((edge) => edge.node),
    query
  );
}

export async function resolveManufacturerSellerId(manufacturer: {
  name: string;
  nautical_seller_id: string | null;
}): Promise<string> {
  const companyName = manufacturer.name.trim();
  if (!companyName) {
    throw new Error("Company name is missing. Set it on the manufacturer profile before syncing inventory.");
  }

  const sellerId = await searchApprovedSellerId(companyName);
  if (sellerId) return sellerId;

  const cached = manufacturer.nautical_seller_id?.trim();
  if (cached) return cached;

  throw new Error(`No approved Nautical seller matched Company "${companyName}".`);
}
