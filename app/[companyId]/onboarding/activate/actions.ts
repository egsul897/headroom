"use server";
import { requireTenantAction } from "@/lib/auth/guard";

import { revalidatePath } from "next/cache";
import { promoteCompanyCandidates } from "@/lib/onboarding/promotion";
import { getAnalysisReadinessForCompany } from "@/lib/contract-model/analysis";
import { generateGoldenTestProposals } from "@/lib/onboarding/golden-tests";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import { deterministicActivationGate } from "@/lib/onboarding/deterministic-activation";
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

/**
 * Deterministic (no-LLM) activation: the Rulebook path. Counsel
 * review + financials are the gate; the status mirrors the LLM
 * promotion verdict (ACTIVE only when every solver-coverage
 * declaration is complete). Fail closed — refuses with the
 * missing pieces named.
 */
export async function activateDeterministicAction(companyId: string) {
  await requireTenantAction(companyId);
  const [rulebook, approvals, financialSnapshots, declarations] = await Promise.all([
    loadRulebookReadiness(companyId),
    listReviewerApprovals(companyId),
    prisma.financialState.count({ where: { companyId } }),
    prisma.solverCoverageDeclaration.findMany({ where: { companyId }, select: { isComplete: true } }),
  ]);
  const gate = deterministicActivationGate({
    rulebookStage: rulebook.stage,
    discoveredSummaries: rulebook.discoveredSummaries,
    decisions: approvals.length,
    financialSnapshots,
    declarationsComplete: declarations.length > 0 && declarations.every((d) => d.isComplete),
  });
  if (!gate.ready) {
    throw new Error(`Activation refused: ${gate.blockers.join(" ")}`);
  }
  await prisma.company.update({ where: { id: companyId }, data: { onboardingStatus: gate.status } });
  revalidatePath(`/${companyId}/onboarding/activate`);
  revalidatePath(`/${companyId}/onboarding`);
  revalidatePath(`/${companyId}`);
  revalidatePath(`/${companyId}/dashboard`);
}

export async function generateGoldenTestsAction(companyId: string) {
  await requireTenantAction(companyId);
  const latestState = await prisma.financialState.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } });
  const asOfDate = latestState?.asOfDate ?? new Date();
  await generateGoldenTestProposals(companyId, asOfDate);
  revalidatePath(`/${companyId}/onboarding/activate`);
}
