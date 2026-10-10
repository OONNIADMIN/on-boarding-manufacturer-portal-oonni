import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getJwtSecretBytes } from "@/lib/jwt-secret";

function encryptionKey(): Buffer {
  return createHash("sha256").update(getJwtSecretBytes()).digest();
}

export function newDistributorInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDistributorInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function distributorInvitationExpiry(): Date {
  const parsed = Number.parseInt(process.env.INVITATION_TOKEN_EXPIRE_HOURS ?? "72", 10);
  const hours = Number.isFinite(parsed) && parsed > 0 ? parsed : 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** Encrypt the temporary marketplace password. The invitation email never contains it. */
export function encryptDistributorPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptDistributorPassword(payload: string): string {
  const [ivPart, tagPart, encryptedPart] = payload.split(".");
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Stored marketplace password could not be read.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
