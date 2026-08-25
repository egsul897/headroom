"use server";

import { revalidatePath } from "next/cache";
import { createManualFinancialState } from "@/lib/onboarding/financial";

function num(formData: FormData, name: string): number {
  const v = Number(formData.get(name));
  if (Number.isNaN(v)) throw new Error(`"${name}" must be a number.`);
  return v;
}

export async function submitFinancialsAction(companyId: string, formData: FormData) {
  await createManualFinancialState({
    companyId,
    asOfDate: new Date(String(formData.get("asOfDate"))),
    ebitda: num(formData, "ebitda"),
    cash: num(formData, "cash"),
    totalDebtPrincipal: num(formData, "totalDebtPrincipal"),
    securedDebtPrincipal: num(formData, "securedDebtPrincipal"),
    cumulativeNetIncomeSinceIssue: num(formData, "cumulativeNetIncomeSinceIssue"),
    equityProceedsSinceIssue: num(formData, "equityProceedsSinceIssue"),
    interestExpense: num(formData, "interestExpense"),
    assumedNewDebtRatePct: num(formData, "assumedNewDebtRatePct"),
  });
  revalidatePath(`/${companyId}/onboarding/financials`);
}
