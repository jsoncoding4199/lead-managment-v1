import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.MASTER_USERNAME ?? "master";
  const password = process.env.MASTER_PASSWORD;
  const displayName = process.env.MASTER_DISPLAY_NAME ?? "Master";

  if (!password) {
    throw new Error("MASTER_PASSWORD must be set in .env to seed.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Master "${username}" already exists — skipping.`);
    return;
  }

  await prisma.user.create({
    data: { username, passwordHash, displayName, role: "MASTER" },
  });
  console.log(`Master "${username}" created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
