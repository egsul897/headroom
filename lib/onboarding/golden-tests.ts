/**
 * Golden-test proposal generation (docs/company-onboarding-v1-implementation.md,
 * deliverable 7).
 *
 * Generates GoldenTest rows from a company's OWN promoted, solver-native
 * Permission graph plus its manually-entered FinancialState - by actually
 * RUNNING the existing engine (lib/covenant-engine.ts's
 * computeRemainingCapacityAfterDebtIncurrence, the same function
 * lib/dashboard-service.ts's Overview/Capacity pages and
 * scripts/golden-test.ts's own DEBT_SIMULATION/remainingAfterAmount branch
 * both call) rather than guessing a number - `expectedAnswer` is always a
 * real, freshly-computed figure, never fabricated.
 *
 * Reuses GoldenTest.stableKey exactly as documented in
 * docs/database-replay-safety.md - format `<companyId>:q<NN>`, continuing
 * from this company's own current max sequence number, upserted (never a
 * new hardcoded id, never a duplicate row for the same slot). Every proposed
 * row starts `status: "UNVERIFIED"` - this function NEVER writes VERIFIED;
 * that status is reserved for Headroom's founder's own legal review
 * (components/ui.tsx's LEGAL_REVIEW_STATUS_EXPLANATION), which a proposal
 * generator can never substitute for.
 */

import { prisma } from "../prisma";
import { computeCovenantPosition, computeRemainingCapacityAfterDebtIncurrence, loadCompanyCovenantData } from "../covenant-engine";
import { buildSolverContext, getCompanySummary } from "../dashboard-service";

async function nextStableKeySeq(companyId: string): Promise<number> {
  const rows = await prisma.goldenTest.findMany({ where: { companyId, stableKey: { startsWith: `${companyId}:q` } }, select: { stableKey: true } });
  let max = 0;
  for (const r of rows) {
    const m = /:q(\d+)/.exec(r.stableKey);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

function padKey(companyId: string, seq: number): string {
  return `${companyId}:q${String(seq).padStart(2, "0")}`;
}

export interface GoldenTestProposalSummary {
  stableKey: string;
  question: string;
  outcome: "computed" | "flagged_gap";
}

/**
 * Proposes (upserts) golden-test rows for both sides (secured/unsecured)
 * cross-document debt capacity, using the exact same engine call the app's
 * own Overview page and the golden-test harness's own solver-native-aware
 * DEBT_SIMULATION/remainingAfterAmount branch use. A side whose cross-document
 * capacity is not determinable (a real coverage gap - NOT_TESTED/
 * REVIEW_REQUIRED, never fabricated as 0) is proposed as an OUT_OF_SCOPE row
 * instead, flagged for human review rather than silently skipped.
 */
export async function generateGoldenTestProposals(companyId: string, asOfDate: Date): Promise<GoldenTestProposalSummary[]> {
  const [company, covenantData] = await Promise.all([getCompanySummary(companyId), loadCompanyCovenantData(prisma, companyId, asOfDate)]);
  const position = computeCovenantPosition(covenantData);
  const solverContext = await buildSolverContext(companyId, asOfDate);

  let seq = await nextStableKeySeq(companyId);
  const summaries: GoldenTestProposalSummary[] = [];

  for (const secured of [true, false]) {
    const sideLabel = secured ? "secured" : "unsecured";
    const postTxn = computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, secured, solverContext);
    const stableKey = padKey(companyId, seq++);

    if (postTxn.remainingCapacity !== undefined) {
      const citation = postTxn.binding?.bindingConstraint?.[0];
      const bindingPermission = citation?.permissionId ? await prisma.permission.findUnique({ where: { id: citation.permissionId }, select: { code: true } }) : null;
      const question = `What is ${company.name}'s current maximum additional ${sideLabel} debt capacity, considered across all governing documents?`;
      await prisma.goldenTest.upsert({
        where: { stableKey },
        create: {
          companyId,
          stableKey,
          question,
          queryType: "DEBT_SIMULATION",
          queryParams: { amount: 0, secured, metric: "remainingAfterAmount" },
          expectedAnswer: postTxn.remainingCapacity,
          tolerance: 0.01,
          bindingProvision: bindingPermission?.code ?? undefined,
          reviewerNotes: `Onboarding-proposed row - expectedAnswer computed by actually running computeRemainingCapacityAfterDebtIncurrence at proposal time (asOfDate ${asOfDate.toISOString()}), not guessed. Requires founder legal review before VERIFIED.`,
          status: "UNVERIFIED",
        },
        update: {
          question,
          queryParams: { amount: 0, secured, metric: "remainingAfterAmount" },
          // expectedAnswer/status intentionally NOT re-synced on update - see
          // prisma/seed.ts's own established "never reset a promoted row"
          // discipline (docs/database-replay-safety.md §D). Re-running
          // proposal generation refreshes the QUESTION shape only; a value a
          // reviewer has already looked at (or disputed) is not silently
          // clobbered by a later run.
        },
      });
      summaries.push({ stableKey, question, outcome: "computed" });
    } else {
      const question = `Structural finding for legal review: ${company.name}'s cross-document maximum additional ${sideLabel} debt capacity is not yet determinable from the currently-modeled Permission graph (a real coverage gap, not a $0 answer) - see the company's onboarding coverage-gate results.`;
      await prisma.goldenTest.upsert({
        where: { stableKey },
        create: {
          companyId,
          stableKey,
          question,
          queryType: "OUT_OF_SCOPE",
          reviewerNotes: "Onboarding-proposed row - flagged because the underlying Permission graph does not yet resolve to a single determinable cross-document capacity (an unpromoted/KNOWN_NOT_MODELED gap remains). Not a computational error - see Company.onboardingStatus.",
          status: "UNVERIFIED",
        },
        update: { question },
      });
      summaries.push({ stableKey, question, outcome: "flagged_gap" });
    }
  }

  return summaries;
}
