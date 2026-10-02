import { executeMarketplaceQuery } from "@/lib/marketplace/graphql/client";

type ApprovedSellerNode = {
  id: string;
  companyName?: string | null;
};

type SellerConnection = {
  sellers: {
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ApprovedSellerNode | null }>;
  };
};

const SELLER_PAGE_LIMIT = 20;

/** Compare portal company names with Nautical `companyName` (case, punctuation, Inc/LLC). */
export function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co|gmbh|plc|sa|sas)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function companyNamesMatch(companyName: string, search: string): boolean {
  const company = normalizeCompanyName(companyName);
  const needle = normalizeCompanyName(search);
  if (!company || !needle) return false;
  if (company === needle) return true;
  // Reject tiny tokens so "Co" does not match every name that contains "co".
  if (company.length < 3 || needle.length < 3) return false;
  return company.includes(needle) || needle.includes(company);
}

export function pickSellerId(nodes: ApprovedSellerNode[], search: string): string | null {
  const needle = search.trim();
  if (!needle) return null;
  const sellers = nodes.filter((node) => node.id && (node.companyName ?? "").trim());
  const exact = sellers.find((node) => companyNamesMatch(node.companyName ?? "", needle) &&
    normalizeCompanyName(node.companyName ?? "") === normalizeCompanyName(needle));
  if (exact?.id) return exact.id;
  const partial = sellers.find((node) => companyNamesMatch(node.companyName ?? "", needle));
  return partial?.id ?? null;
}

async function collectSellers(
  queryName: "approvedSellers" | "sellersSearch" | "sellersPage",
  variables: Record<string, unknown>
): Promise<ApprovedSellerNode[]> {
  const nodes: ApprovedSellerNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < SELLER_PAGE_LIMIT; page += 1) {
    const requestVariables: Record<string, unknown> = { ...variables, after };
    const data: SellerConnection = await executeMarketplaceQuery<SellerConnection>(
      queryName,
      requestVariables
    );
    for (const edge of data.sellers?.edges ?? []) {
      if (edge?.node?.id) nodes.push(edge.node);
    }
    const pageInfo = data.sellers?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    const next = pageInfo.endCursor?.trim() || null;
    if (!next || next === after) break;
    after = next;
  }

  return nodes;
}

export async function searchApprovedSellerId(search: string): Promise<string | null> {
  const query = search.trim();
  if (!query) return null;
  const nodes = await collectSellers("approvedSellers", { search: query });
  return pickSellerId(nodes, query);
}

async function searchSellerIdByName(search: string): Promise<string | null> {
  const query = search.trim();
  if (!query) return null;
  const nodes = await collectSellers("sellersSearch", { search: query });
  return pickSellerId(nodes, query);
}

async function findSellerIdInCatalog(search: string): Promise<string | null> {
  const query = search.trim();
  if (!query) return null;
  const nodes = await collectSellers("sellersPage", {});
  return pickSellerId(nodes, query);
}

export async function resolveManufacturerSellerId(manufacturer: {
  name: string;
  nautical_seller_id: string | null;
}): Promise<string> {
  const companyName = manufacturer.name.trim();
  if (!companyName) {
    throw new Error("Company name is missing. Set it on the manufacturer profile before syncing inventory.");
  }

  const cached = manufacturer.nautical_seller_id?.trim();
  if (cached) return cached;

  const sellerId =
    (await searchApprovedSellerId(companyName)) ??
    (await searchSellerIdByName(companyName)) ??
    (await findSellerIdInCatalog(companyName));
  if (sellerId) return sellerId;

  throw new Error(`No approved Nautical seller matched Company "${companyName}".`);
}
