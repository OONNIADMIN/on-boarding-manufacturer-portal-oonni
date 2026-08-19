/**
 * Traide GraphQL HTTP client. Same Authorization: Bearer header as inventory queries.
 */

import { TRAIDE_MUTATIONS, TRAIDE_QUERIES, type TraideMutationName, type TraideQueryName } from "./documents";

export type TraideConfig = {
  url: string;
  token: string;
};

export function getNauticalConfig(): TraideConfig | null {
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
    throw new Error(`Nautical HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  if (body.data == null) {
    throw new Error("Nautical returned no data");
  }
  return body.data;
}

export async function executeTraideQuery<T>(
  name: TraideQueryName,
  variables?: Record<string, unknown>
): Promise<T> {
  return nauticalGraphql<T>(TRAIDE_QUERIES[name], variables);
}

export async function executeTraideMutation<T>(
  name: TraideMutationName,
  variables?: Record<string, unknown>
): Promise<T> {
  return nauticalGraphql<T>(TRAIDE_MUTATIONS[name], variables);
}
