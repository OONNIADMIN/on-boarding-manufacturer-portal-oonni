-- Track Traide seller provisioning so login can retry in the background.
ALTER TABLE "users" ADD COLUMN "marketplace_provision_status" VARCHAR(32);
