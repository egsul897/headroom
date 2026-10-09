"use server";

import { revalidatePath } from "next/cache";
import { createManualFinancialState } from "@/lib/onboarding/financial";

function num(formData: FormData, name: string): number {
  const v = Number(formData.get(name));
  if (Number.isNaN(v)) throw new Error(`"${name}" must be a number.`);
  return v;
}

function optionalNum(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return undefined;
  return num(formData, name);
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
    fixedCharges: optionalNum(formData, "fixedCharges"),
    totalAssets: optionalNum(formData, "totalAssets"),
    firstLienDebtPrincipal: optionalNum(formData, "firstLienDebtPrincipal"),
    restrictedGroupEbitda: optionalNum(formData, "restrictedGroupEbitda"),
    ebitdaAdjustmentsAmount: optionalNum(formData, "ebitdaAdjustmentsAmount"),
    contractualEbitdaTerm: String(formData.get("contractualEbitdaTerm") ?? "").trim() || undefined,
    testingPeriod: String(formData.get("testingPeriod") ?? "").trim() || undefined,
    proFormaAdjustments: String(formData.get("proFormaAdjustments") ?? "").trim() || undefined,
  });
  revalidatePath(`/${companyId}/onboarding/financials`);
  revalidatePath(`/${companyId}/intelligence`);
  revalidatePath(`/${companyId}/capacity`);
  revalidatePath(`/${companyId}/simulate`);
}
