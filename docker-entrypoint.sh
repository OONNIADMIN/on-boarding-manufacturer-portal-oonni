#!/bin/sh
set -e

echo "🚀 Starting OONNI App..."
echo "================================"

echo "📊 Running Prisma migrations..."
npx prisma migrate deploy
echo "✓ Migrations completed!"

echo "🌱 Running database seeds..."
npx tsx /app/prisma/seed.ts

echo "================================"
echo "🎉 Starting Next.js application..."
echo "================================"

exec node server.js
