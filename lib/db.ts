import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Bump when Prisma schema fields change so the Next.js singleton is recreated. */
const PRISMA_CLIENT_GENERATION = 2;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaGeneration?: number;
};

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaGeneration === PRISMA_CLIENT_GENERATION) {
    return globalForPrisma.prisma;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  globalForPrisma.prisma = client;
  globalForPrisma.prismaGeneration = PRISMA_CLIENT_GENERATION;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  },
});
