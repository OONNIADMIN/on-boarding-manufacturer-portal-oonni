#!/bin/sh
set -e

echo "Starting manufacturer portal..."

if [ -z "${JWT_SECRET}" ]; then
  echo "JWT_SECRET is required in production."
  exit 1
fi

if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL is required."
  exit 1
fi

echo "Applying Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding roles and initial admin (existing admin passwords are not changed)..."
  npx tsx prisma/seed.ts
fi

echo "Starting Next.js on port ${PORT:-3000}..."
exec node server.js
