const STORAGE_PREFIX = "oonni_catalog_import_jobs:";

function storedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown };
    const id = parsed?.id;
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
    if (typeof id === "string" && id.trim()) return id.trim();
    return null;
  } catch {
    return null;
  }
}

function storageKey(userId?: string | number | null): string | null {
  const id = userId != null && String(userId).trim() ? String(userId) : storedUserId();
  if (!id) return null;
  return `${STORAGE_PREFIX}${id}`;
}

export function listRememberedCatalogImportJobs(userId?: string | number | null): string[] {
  const key = storageKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberCatalogImportJob(id: string, userId?: string | number | null): void {
  if (typeof window === "undefined" || !id) return;
  const key = storageKey(userId);
  if (!key) return;
  const ids = listRememberedCatalogImportJobs(userId).filter((existing) => existing !== id);
  localStorage.setItem(key, JSON.stringify([id, ...ids].slice(0, 8)));
}

export function forgetCatalogImportJob(id: string, userId?: string | number | null): void {
  if (typeof window === "undefined") return;
  const key = storageKey(userId);
  if (!key) return;
  const ids = listRememberedCatalogImportJobs(userId).filter((existing) => existing !== id);
  localStorage.setItem(key, JSON.stringify(ids));
}

export function clearRememberedCatalogImportJobs(userId?: string | number | null): void {
  if (typeof window === "undefined") return;
  const key = storageKey(userId);
  if (key) localStorage.removeItem(key);
  localStorage.removeItem("oonni_catalog_import_jobs");
}
