/**
 * Traide GraphQL HTTP client. Same Authorization: Bearer header as inventory queries.
 */

import {
  TRAIDE_MUTATIONS,
  TRAIDE_QUERIES,
  type TraideMutationName,
  type TraideQueryName,
} from "@/app/graphql";

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

/** Short user-facing Traide error. Raw GraphQL/HTTP payloads stay in server logs. */
export function formatTraideUserError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/Field '[^']+' is not defined/i.test(raw) || /got invalid value/i.test(raw)) {
    return "Traide rejected the update.";
  }
  if (/Nautical HTTP \d+/i.test(raw) || /"errors"\s*:/.test(raw)) {
    return "Traide could not save this change.";
  }
  const firstLine = raw.split(/\r?\n/)[0]?.trim() || "Traide could not save this change.";
  return firstLine.length > 160 ? "Traide could not save this change." : firstLine;
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
    console.error("Traide HTTP error", res.status, text.slice(0, 4000));
    throw new Error(formatTraideUserError(`Nautical HTTP ${res.status}: ${text}`));
  }

  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (body.errors?.length) {
    console.error("Traide GraphQL errors", body.errors);
    throw new Error(formatTraideUserError(body.errors.map((e) => e.message).join("; ")));
  }
  if (body.data == null) {
    throw new Error("Traide returned no data");
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
