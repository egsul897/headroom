/**
 * Shared executable financial as-of identity for Dashboard, Position, Simulate,
 * and contractual-leverage. One company → one latest-cohort FinancialState date
 * via resolveCanonicalFinancialIdentity — never a wall-clock "today" fallback
 * when an authenticated state exists.
 */
import { FinancialIdentityError, resolveCanonicalFinancialIdentity } from "@/lib/financial-identity";
import { prisma } from "@/lib/prisma";

export async function resolveCanonicalFinancialAsOf(companyId: string): Promise<Date> {
  const resolution = await resolveCanonicalFinancialIdentity(
    (args) => prisma.financialState.findMany(args),
    { where: { companyId }, selection: "latest-cohort" },
  );
  if (resolution.status === "UNIQUE") return resolution.row.asOfDate;
  if (resolution.status === "AMBIGUOUS") {
    throw new FinancialIdentityError(
      "AMBIGUOUS",
      resolution.matchCount,
      `${resolution.matchCount} FinancialState rows claim the latest identity for company ${companyId}`,
    );
  }
  throw new FinancialIdentityError("UNKNOWN", 0, `No FinancialState found for company ${companyId}`);
}
