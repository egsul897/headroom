"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { promoteCompanyCandidates } from "@/lib/onboarding/promotion";
import { getAnalysisReadinessForCompany } from "@/lib/contract-model/analysis";
import { generateGoldenTestProposals } from "@/lib/onboarding/golden-tests";
import { prisma } from "@/lib/prisma";

export async function promoteAction(companyId: string) {
  await requireTenantAction(companyId);
  // Rule 103: promotion must not run against a stale document set.
  // The review page already redirects when analysis is not current;
  // the Activate page must enforce the same gate, or promotion
  // could certify a rulebook while a newly uploaded document
  // (e.g. a superseding amendment) sits entirely unanalyzed.
  const readiness = await getAnalysisReadinessForCompany(companyId);
  if (!readiness.ready) {
    throw new Error(
      `Promotion refused: contract-model analysis is not current (${readiness.reason}). Re-run analysis before promoting.`,
    );
  }
  await promoteCompanyCandidates(companyId);
  revalidatePath(`/${companyId}/onboarding/activate`);
  revalidatePath(`/${companyId}/onboarding`);
  revalidatePath(`/${companyId}`);
  // Legacy dashboard stays under Deal setup & tools. Invalidate its cache; it is not the home destination.
  revalidatePath(`/${companyId}/dashboard`);
}

export async function generateGoldenTestsAction(companyId: string) {
  await requireTenantAction(companyId);
  const latestState = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  const asOfDate = latestState?.asOfDate ?? new Date();
  await generateGoldenTestProposals(companyId, asOfDate);
  revalidatePath(`/${companyId}/onboarding/activate`);
}
