/**
 * Admin provisioning input validation (pure — no database access).
 *
 * Accounts are provisioned by Egzon's team with the offline script
 * (scripts/provision-company-account.ts). There is no self-serve signup
 * and no "create a company" flow for customers.
 */

export interface ProvisionInput {
  email: string;
  password: string;
  /** Existing company to attach the user to (preferred when known). */
  companyId?: string;
  /** New company name to create when companyId is absent. */
  companyName?: string;
  /** Account role. Defaults to USER. ADMIN is for Egzon's team only (provisioning surfaces). */
  role?: "USER" | "ADMIN";
}

export type ProvisionValidation = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProvisionInput(input: ProvisionInput): ProvisionValidation {
  if (!input || typeof input.email !== "string" || !EMAIL_RE.test(input.email.trim())) {
    return { ok: false, error: "A valid email address is required." };
  }
  if (typeof input.password !== "string" || input.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const hasCompanyId = typeof input.companyId === "string" && input.companyId.trim().length > 0;
  const hasCompanyName = typeof input.companyName === "string" && input.companyName.trim().length > 0;
  if (!hasCompanyId && !hasCompanyName) {
    return { ok: false, error: "Either an existing companyId or a new companyName is required." };
  }
  if (input.role !== undefined && input.role !== "USER" && input.role !== "ADMIN") {
    return { ok: false, error: "Role must be USER or ADMIN." };
  }
  return { ok: true };
}
