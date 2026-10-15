import { prisma } from "@/lib/prisma";
import { hashPassword } from "./password";
import { validateProvisionInput, type ProvisionInput } from "./provision-input";

/**
 * Admin account provisioning (offline, Egzon's team only).
 *
 * Creates a company (when companyId is absent) and a user bound to exactly
 * that company. There is no HTTP route for this — the script
 * scripts/provision-company-account.ts is the only caller. Duplicate emails
 * are rejected; the password is never stored, only its scrypt hash.
 */
export async function provisionAccount(input: ProvisionInput): Promise<{ userId: string; companyId: string }> {
  const validation = validateProvisionInput(input);
  if (!validation.ok) throw new Error(validation.error);
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error(`A user with email ${email} already exists.`);

  let companyId: string;
  if (input.companyId && input.companyId.trim()) {
    const company = await prisma.company.findUnique({ where: { id: input.companyId.trim() } });
    if (!company) throw new Error(`Company ${input.companyId} does not exist.`);
    companyId = company.id;
  } else {
    const company = await prisma.company.create({
      data: { name: input.companyName!.trim(), tenantKind: "CUSTOMER" },
    });
    companyId = company.id;
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: hashPassword(input.password), role: input.role ?? "USER", companyId },
  });
  return { userId: user.id, companyId };
}
