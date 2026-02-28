import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set. Cannot run seed.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=".repeat(60));
  console.log("Starting database seeding...");
  console.log("=".repeat(60));

  // Seed roles
  console.log("\n[1/2] Seeding roles...");
  const roles = ["admin", "manufacturer"];
  for (const name of roles) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  ✓ Role: ${role.name}`);
  }

  // Seed admin user
  console.log("\n[2/2] Seeding admin user...");
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL ?? "admin@oonni.com").trim().toLowerCase();
  const adminPassword = (process.env.INITIAL_ADMIN_PASSWORD ?? "change-me-123").trim();
  const adminName = (process.env.INITIAL_ADMIN_NAME ?? "Admin User").trim();

  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  if (!adminRole) throw new Error("Admin role not found after seeding");

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(`  → Admin user already exists: ${adminEmail}`);
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.update({
      where: { id: existing.id },
      data: { password_hash: passwordHash, name: adminName },
    });
    console.log(`  ✓ Updated password for existing admin: ${adminEmail}`);
  } else {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        password_hash: passwordHash,
        role_id: adminRole.id,
        is_active: 1,
      },
    });
    console.log(`  ✓ Created admin user: ${adminEmail}`);
  }

  console.log(`  → Use: ${adminEmail} / (your INITIAL_ADMIN_PASSWORD)`);
  console.log("\n" + "=".repeat(60));
  console.log("✓ Database seeding completed successfully!");
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
