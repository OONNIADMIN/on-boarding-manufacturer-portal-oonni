/**
 * Marketplace GraphQL HTTP client. Same Authorization: Bearer header as inventory queries.
 */

import {
  MARKETPLACE_MUTATIONS,
  MARKETPLACE_QUERIES,
  type MarketplaceMutationName,
  type MarketplaceQueryName,
} from "@/app/graphql";

export type MarketplaceConfig = {
  url: string;
  token: string;
};

export function getNauticalConfig(): MarketplaceConfig | null {
  const url = process.env.NAUTICAL_API_URL?.trim();
  const token =
    process.env.NAUTICAL_BEARER_TOKEN?.trim() ||
    process.env.NAUTICAL_KEY_BEARER?.trim();
  if (!url || !token) return null;
  return { url, token };
}

export function nauticalNotConfiguredMessage(): string {
  return "Nautical integration is not configured. Set NAUTICAL_API_URL and NAUTICAL_BEARER_TOKEN (or NAUTICAL_KEY_BEARER) on the server.";
}

/** Short user-facing catalog error. Raw GraphQL/HTTP payloads stay in server logs. */
export function formatMarketplaceUserError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const fallback = "This change could not be saved to your catalog.";
  if (/Field '[^']+' is not defined/i.test(raw) || /got invalid value/i.test(raw)) {
    return "This update could not be published to your catalog.";
  }
  if (/Nautical HTTP \d+/i.test(raw) || /"errors"\s*:/.test(raw) || /marketplace|nautical/i.test(raw)) {
    return fallback;
  }
  const firstLine = raw.split(/\r?\n/)[0]?.trim() || fallback;
  return firstLine.length > 160 ? fallback : firstLine;
}

export async function nauticalGraphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const cfg = getNauticalConfig();
  if (!cfg) {
    throw new Error(nauticalNotConfiguredMessage());
  }

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Marketplace HTTP error", res.status, text.slice(0, 4000));
    throw new Error(formatMarketplaceUserError(`Nautical HTTP ${res.status}: ${text}`));
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    console.error("Marketplace GraphQL errors", body.errors);
    throw new Error(formatMarketplaceUserError(body.errors.map((e) => e.message).join("; ")));
  }
  if (body.data == null) {
    throw new Error(formatMarketplaceUserError("This change could not be saved to your catalog."));
  }
  return body.data;
}

export async function executeMarketplaceQuery<T>(
  name: MarketplaceQueryName,
  variables?: Record<string, unknown>
): Promise<T> {
  return nauticalGraphql<T>(MARKETPLACE_QUERIES[name], variables);
}

export async function executeMarketplaceMutation<T>(
  name: MarketplaceMutationName,
  variables?: Record<string, unknown>
): Promise<T> {
  return nauticalGraphql<T>(MARKETPLACE_MUTATIONS[name], variables);
}
