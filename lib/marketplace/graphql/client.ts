/**
 * Marketplace GraphQL HTTP client. Same Authorization: Bearer header as inventory queries.
 */

import {
  MARKETPLACE_MUTATIONS,
  MARKETPLACE_QUERIES,
  TOKEN_CREATE_MUTATION,
  type MarketplaceMutationName,
  type MarketplaceQueryName,
  type TokenCreatePayload,
} from "@/app/graphql";

export type MarketplaceConfig = {
  url: string;
  token: string;
};

const LOGIN_TOKEN_TTL_MS = 4 * 60 * 1000;

const globalForMarketplaceAuth = globalThis as unknown as {
  marketplaceLoginToken?: string;
  marketplaceLoginTokenExpiresAt?: number;
};

function staticMarketplaceToken(): string {
  return (
    process.env.NAUTICAL_BEARER_TOKEN?.trim() ||
    process.env.NAUTICAL_KEY_BEARER?.trim() ||
    ""
  );
}

function marketplaceLoginCredentials(): { email: string; password: string } | null {
  const email = process.env.NAUTICAL_USERNAME?.trim();
  const password = process.env.NAUTICAL_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function getNauticalConfig(): MarketplaceConfig | null {
  const url = process.env.NAUTICAL_API_URL?.trim();
  if (!url) return null;
  const token = staticMarketplaceToken();
  if (token) return { url, token };
  if (marketplaceLoginCredentials()) return { url, token: "" };
  return null;
}

export function nauticalNotConfiguredMessage(): string {
  return "Marketplace integration is not configured. Set NAUTICAL_API_URL and NAUTICAL_BEARER_TOKEN (or NAUTICAL_KEY_BEARER), or NAUTICAL_USERNAME and NAUTICAL_PASSWORD, on the server.";
}

export type GraphqlCallOptions = {
  preserveTechnicalError?: boolean;
  accessToken?: string;
  authorizationScheme?: "Bearer" | "JWT";
};

function graphqlMessages(errors: Array<{ message?: string | null }>): string {
  return errors.map((error) => error.message?.trim()).filter(Boolean).join("; ");
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

async function requestMarketplaceAccessToken(
  url: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: TOKEN_CREATE_MUTATION,
      variables: { email, password },
    }),
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("Marketplace login HTTP error", res.status, text.slice(0, 4000));
    throw new Error(`Marketplace login HTTP ${res.status}`);
  }

  let body: {
    data?: TokenCreatePayload;
    errors?: Array<{ message: string }>;
  };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    console.error("Marketplace login returned non-JSON", text.slice(0, 4000));
    throw new Error("Marketplace login failed");
  }
  const accountErrors = body.data?.tokenCreate?.accountErrors ?? [];
  const token = body.data?.tokenCreate?.token?.trim();
  if (body.errors?.length || accountErrors.length || !token) {
    const detail = [
      ...(body.errors ?? []).map((item) => item.message),
      ...accountErrors.map((item) => item.message).filter(Boolean),
    ].join("; ");
    console.error("Marketplace login failed", detail || text.slice(0, 4000));
    throw new Error(detail || "Marketplace login failed");
  }

  return token;
}

async function loginMarketplace(url: string): Promise<string> {
  const cached = globalForMarketplaceAuth.marketplaceLoginToken;
  const expiresAt = globalForMarketplaceAuth.marketplaceLoginTokenExpiresAt ?? 0;
  if (cached && Date.now() < expiresAt) return cached;

  const credentials = marketplaceLoginCredentials();
  if (!credentials) {
    throw new Error(nauticalNotConfiguredMessage());
  }

  const token = await requestMarketplaceAccessToken(
    url,
    credentials.email,
    credentials.password
  );
  globalForMarketplaceAuth.marketplaceLoginToken = token;
  globalForMarketplaceAuth.marketplaceLoginTokenExpiresAt = Date.now() + LOGIN_TOKEN_TTL_MS;
  return token;
}

/** Authenticate a newly-created seller owner so agreement acceptance is attributed to that user. */
export async function createMarketplaceUserAccessToken(
  email: string,
  password: string
): Promise<string> {
  const cfg = getNauticalConfig();
  if (!cfg) throw new Error(nauticalNotConfiguredMessage());
  return requestMarketplaceAccessToken(cfg.url, email, password);
}

async function resolveMarketplaceToken(cfg: MarketplaceConfig): Promise<string> {
  if (cfg.token) return cfg.token;
  return loginMarketplace(cfg.url);
}

export async function nauticalGraphql<T>(
  query: string,
  variables?: Record<string, unknown>,
  options?: GraphqlCallOptions
): Promise<T> {
  const cfg = getNauticalConfig();
  if (!cfg) {
    throw new Error(nauticalNotConfiguredMessage());
  }

  const token = options?.accessToken?.trim() || (await resolveMarketplaceToken(cfg));
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${options?.authorizationScheme ?? "Bearer"} ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const throwError = (technical: string) => {
    throw new Error(options?.preserveTechnicalError ? technical : formatMarketplaceUserError(technical));
  };

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Marketplace HTTP error", res.status, text.slice(0, 4000));
    throwError(`Marketplace HTTP ${res.status}: ${text}`);
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    const technical = graphqlMessages(body.errors);
    console.error("Marketplace GraphQL errors", body.errors);
    throwError(technical || "Marketplace GraphQL error");
  }
  if (body.data == null) {
    throwError("Marketplace returned no data");
  }
  return body.data as T;
}

export async function executeMarketplaceQuery<T>(
  name: MarketplaceQueryName,
  variables?: Record<string, unknown>,
  options?: GraphqlCallOptions
): Promise<T> {
  return nauticalGraphql<T>(MARKETPLACE_QUERIES[name], variables, options);
}

export async function executeMarketplaceMutation<T>(
  name: MarketplaceMutationName,
  variables?: Record<string, unknown>,
  options?: GraphqlCallOptions
): Promise<T> {
  return nauticalGraphql<T>(MARKETPLACE_MUTATIONS[name], variables, options);
}
