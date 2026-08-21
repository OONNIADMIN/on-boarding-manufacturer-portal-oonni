const JWT_SECRET_MIN_LENGTH = 32;

export function getJwtExpireMinutes(): number {
  const parsed = parseInt(process.env.JWT_EXPIRE_MINUTES ?? "1440", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1440;
}

export function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim() ?? "";
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET is required and must be at least ${JWT_SECRET_MIN_LENGTH} characters`
    );
  }
  return new TextEncoder().encode(secret);
}
