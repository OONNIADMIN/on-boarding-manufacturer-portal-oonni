const STORAGE_KEY = "oonni_catalog_import_jobs";

export function listRememberedCatalogImportJobs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function rememberCatalogImportJob(id: string): void {
  if (typeof window === "undefined" || !id) return;
  const ids = listRememberedCatalogImportJobs().filter((existing) => existing !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([id, ...ids].slice(0, 8)));
}

export function forgetCatalogImportJob(id: string): void {
  if (typeof window === "undefined") return;
  const ids = listRememberedCatalogImportJobs().filter((existing) => existing !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
