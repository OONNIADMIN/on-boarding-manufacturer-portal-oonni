/** Hardcoded until a real support desk is wired in. Safe to import from client components. */
export const SUPPORT_CONTACT_URL = "https://www.oonni.com/contact";

export const SUPPORT_ERROR_HEADLINE =
  "Something went wrong. Please contact support and we will help you.";

export function publicSupportMessage(referenceId?: string | null): string {
  const base = SUPPORT_ERROR_HEADLINE;
  const id = referenceId?.trim();
  return id ? `${base} Reference: ${id}` : base;
}

export function isPublicSupportMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  return /please contact support/i.test(text) || /www\.oonni\.com\/contact/i.test(text);
}
