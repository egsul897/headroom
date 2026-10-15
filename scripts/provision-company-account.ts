/**
 * Admin account provisioning — run by Egzon's team only. There is no
 * self-serve signup and no customer-facing "create a company" flow.
 *
 * Usage:
 *   npx tsx scripts/provision-company-account.ts \
 *     --email cfo@apex.example --password '...' \
 *     --company-name "Apex Manufacturing" [--company-id <existing-id>] [--role ADMIN]
 *
 * --company-id attaches the user to an existing company; otherwise a new
 * CUSTOMER company is created from --company-name. --role defaults to USER;
 * pass --role ADMIN only for Egzon's team accounts (provisioning surfaces).
 * The password is read from the flag for scripting convenience — prefer
 * passing it via the HEADROOM_PROVISION_PASSWORD env var so it never lands
 * in shell history.
 */
import { provisionAccount } from "../lib/auth/provision-account";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const password = process.env.HEADROOM_PROVISION_PASSWORD || arg("password");
  const companyId = arg("company-id");
  const companyName = arg("company-name");
  const roleArg = arg("role");
  if (!email || !password) {
    throw new Error("Usage: --email <email> --password <password> (--company-id <id> | --company-name <name>) [--role ADMIN]");
  }
  const role = roleArg === undefined ? undefined : roleArg === "ADMIN" ? "ADMIN" : roleArg === "USER" ? "USER" : undefined;
  if (roleArg !== undefined && role === undefined) throw new Error("--role must be USER or ADMIN.");
  const { userId, companyId: resolved } = await provisionAccount({ email, password, companyId, companyName, role });
  console.log(`Provisioned user ${userId} for company ${resolved}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
