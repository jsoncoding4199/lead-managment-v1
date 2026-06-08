/**
 * Standalone CLI to reset any user's password.
 *
 * Usage (from lead-management-v2/):
 *   $env:DATABASE_URL = "<your prod pooled url>"
 *   npm run reset-password -- --user master --password "newPassword123"
 *
 * Short flags also work:
 *   npm run reset-password -- -u master -p "newPassword123"
 *
 * The script reads DATABASE_URL from the environment, so it works against
 * whichever DB you point it at. The password is hashed with bcrypt before
 * being written — the plaintext is never stored.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { user?: string; password?: string } {
  const out: { user?: string; password?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--user" || arg === "-u") out.user = argv[++i];
    else if (arg === "--password" || arg === "-p") out.password = argv[++i];
  }
  return out;
}

async function main() {
  const { user, password } = parseArgs(process.argv.slice(2));

  if (!user) {
    console.error('Missing --user <username>.  Example: npm run reset-password -- -u master -p "newpass"');
    process.exit(1);
  }
  if (!password) {
    console.error("Missing --password <newPassword>.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username: user } });
  if (!existing) {
    console.error(`No user named "${user}" exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { username: user },
    data: { passwordHash, active: true },
  });

  console.log(`Password reset for ${existing.role.toLowerCase()} "${user}". Account is active.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
