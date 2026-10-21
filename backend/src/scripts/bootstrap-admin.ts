import { prisma } from "../db.js";
import { hashPassword, normalizeEmail, validatePassword } from "../security.js";

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Refusing to provision an administrator without --confirm");
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim();
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ? normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL) : "";
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!name || !email) throw new Error("ADMIN_BOOTSTRAP_NAME and ADMIN_BOOTSTRAP_EMAIL are required");
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  await prisma.$connect();
  if (await prisma.user.findUnique({ where: { email } })) throw new Error("An account with this email already exists");
  await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password), role: "admin", lastDashboard: "admin", favorites: [], following: [], notifications: { email: true, push: true, smsReady: false } } });
  console.log(`Administrator provisioned for ${email}. No credential material was logged.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
