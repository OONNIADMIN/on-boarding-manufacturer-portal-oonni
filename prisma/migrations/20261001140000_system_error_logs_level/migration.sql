-- Record successful operations alongside errors.
ALTER TABLE "system_error_logs" ADD COLUMN "level" VARCHAR(16) NOT NULL DEFAULT 'error';
CREATE INDEX "system_error_logs_level_idx" ON "system_error_logs"("level");
