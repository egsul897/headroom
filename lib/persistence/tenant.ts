import { TenantIsolationError } from "./types";

/** Fail closed if a payload companyId disagrees with the store scope. */
export function assertSameTenant(expectedCompanyId: string, actualCompanyId: string, context: string): void {
  if (expectedCompanyId !== actualCompanyId) {
    throw new TenantIsolationError(
      `Cross-tenant access refused in ${context}: store scoped to ${expectedCompanyId}, got ${actualCompanyId}`,
    );
  }
}

export function requireCompanyId(companyId: string | null | undefined, context: string): string {
  if (!companyId || companyId.trim() === "") {
    throw new TenantIsolationError(`Missing companyId in ${context}`);
  }
  return companyId;
}
