ALTER TABLE "authorized_distributors" ADD COLUMN "invitation_token_hash" VARCHAR(64);
ALTER TABLE "authorized_distributors" ADD COLUMN "invitation_token_expires_at" TIMESTAMPTZ;
ALTER TABLE "authorized_distributors" ADD COLUMN "marketplace_password_ciphertext" TEXT;

CREATE INDEX "authorized_distributors_invitation_token_hash_idx"
  ON "authorized_distributors" ("invitation_token_hash");
