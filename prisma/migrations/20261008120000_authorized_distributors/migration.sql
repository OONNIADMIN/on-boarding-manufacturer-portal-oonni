CREATE TABLE "authorized_distributors" (
    "id" SERIAL NOT NULL,
    "manufacturer_id" INTEGER NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "contact_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "region" VARCHAR(120),
    "valid_until" DATE,
    "status" VARCHAR(32) NOT NULL DEFAULT 'not_invited',
    "invitation_sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "authorized_distributors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "authorized_distributors_manufacturer_id_deleted_at_idx" ON "authorized_distributors"("manufacturer_id", "deleted_at");
CREATE INDEX "authorized_distributors_manufacturer_id_status_idx" ON "authorized_distributors"("manufacturer_id", "status");

ALTER TABLE "authorized_distributors" ADD CONSTRAINT "authorized_distributors_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
