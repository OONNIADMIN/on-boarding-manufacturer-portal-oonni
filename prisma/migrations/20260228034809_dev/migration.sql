/*
  Warnings:

  - A unique constraint covering the columns `[invitation_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_invitation_token_idx";

-- CreateIndex
CREATE UNIQUE INDEX "users_invitation_token_key" ON "users"("invitation_token");
