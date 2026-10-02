-- Unexpected application errors shown to users as a generic support message.
CREATE TABLE "system_error_logs" (
    "id" SERIAL NOT NULL,
    "public_id" VARCHAR(16) NOT NULL,
    "source" VARCHAR(120) NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" VARCHAR(500),
    "user_id" INTEGER,
    "manufacturer_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_error_logs_public_id_key" ON "system_error_logs"("public_id");
CREATE INDEX "system_error_logs_created_at_idx" ON "system_error_logs"("created_at");
CREATE INDEX "system_error_logs_source_idx" ON "system_error_logs"("source");
