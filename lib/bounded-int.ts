export function parseBoundedInt(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
