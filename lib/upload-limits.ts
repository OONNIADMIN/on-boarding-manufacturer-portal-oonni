export const MAX_IMAGE_UPLOAD_MB = 50;
export const MAX_SPREADSHEET_UPLOAD_MB = 150;

export const MAX_IMAGE_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_MB * 1024 * 1024;
export const MAX_SPREADSHEET_UPLOAD_BYTES = MAX_SPREADSHEET_UPLOAD_MB * 1024 * 1024;

/** Default upload cap: catalog Excel/CSV (real manufacturer files can exceed 50MB). */
export const MAX_UPLOAD_BYTES = MAX_SPREADSHEET_UPLOAD_BYTES;
export const MAX_UPLOAD_MB = MAX_SPREADSHEET_UPLOAD_MB;

export function uploadTooLargeMessage(maxMb: number = MAX_UPLOAD_MB): string {
  return `File exceeds ${maxMb}MB limit`;
}
