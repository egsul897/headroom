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

function padKey(companyId: string, seq: number): string {
  return `${companyId}:q${String(seq).padStart(2, "0")}`;
}

/**
 * A fixed, content-derived "slot" tag embedded in reviewerNotes - what makes
 * re-running this generator idempotent (upsert onto the SAME stableKey each
 * time) rather than minting a fresh q<NN> every call. stableKey itself stays
 * the plain numeric-sequence format docs/database-replay-safety.md
 * documents (never derived from mutable content); this tag is only how THIS
 * generator re-finds which existing row, if any, already occupies a given
 * logical slot for this company, so it can resolve that row's CURRENT
 * stableKey instead of guessing the next sequence number.
 */
function slotTag(kind: "cross-document-secured-capacity" | "cross-document-unsecured-capacity"): string {
  return `[onboarding-slot: ${kind}]`;
}

async function resolveSlotStableKey(companyId: string, tag: string, mintNextSeq: () => number): Promise<string> {
  const existing = await prisma.goldenTest.findFirst({ where: { companyId, reviewerNotes: { contains: tag } }, select: { stableKey: true } });
  return existing?.stableKey ?? padKey(companyId, mintNextSeq());
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

  const existingRows = await prisma.goldenTest.findMany({ where: { companyId, stableKey: { startsWith: `${companyId}:q` } }, select: { stableKey: true } });
  let seq = existingRows.reduce((max, r) => {
    const m = /:q(\d+)/.exec(r.stableKey);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);
  const mintNextSeq = () => ++seq;

  const summaries: GoldenTestProposalSummary[] = [];

  for (const secured of [true, false]) {
    const sideLabel = secured ? "secured" : "unsecured";
    const tag = slotTag(secured ? "cross-document-secured-capacity" : "cross-document-unsecured-capacity");
    const stableKey = await resolveSlotStableKey(companyId, tag, mintNextSeq);
    const postTxn = computeRemainingCapacityAfterDebtIncurrence(covenantData, position, 0, secured, solverContext);

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
          reviewerNotes: `${tag} Onboarding-proposed row - expectedAnswer computed by actually running computeRemainingCapacityAfterDebtIncurrence at proposal time (asOfDate ${asOfDate.toISOString()}), not guessed. Requires founder legal review before VERIFIED.`,
          status: "UNVERIFIED",
        },
        update: {
          question,
          queryParams: { amount: 0, secured, metric: "remainingAfterAmount" },
          // expectedAnswer/status/reviewerNotes intentionally NOT re-synced
          // on update - see prisma/seed.ts's own established "never reset a
          // promoted row" discipline (docs/database-replay-safety.md §D).
          // Re-running proposal generation refreshes the QUESTION shape
          // only; a value a reviewer has already looked at (or disputed) is
          // not silently clobbered by a later run.
        },
      });
      summaries.push({ stableKey, question, outcome: "computed" });
      // Known v1 limitation: if this slot's existing row was previously
      // created as OUT_OF_SCOPE (the gap arm below) and the gap is later
      // resolved, this upsert's `update` branch does not itself flip
      // queryType/expectedAnswer onto that existing row - re-running after a
      // gap resolves onto a PREVIOUSLY-flagged slot needs a human to also
      // update that row's queryType, exactly like any other reviewed row
      // this generator deliberately never silently overwrites.
    } else {
      const question = `Structural finding for legal review: ${company.name}'s cross-document maximum additional ${sideLabel} debt capacity is not yet determinable from the currently-modeled Permission graph (a real coverage gap, not a $0 answer) - see the company's onboarding coverage-gate results.`;
      await prisma.goldenTest.upsert({
        where: { stableKey },
        create: {
          companyId,
          stableKey,
          question,
          queryType: "OUT_OF_SCOPE",
          reviewerNotes: `${tag} Onboarding-proposed row - flagged because the underlying Permission graph does not yet resolve to a single determinable cross-document capacity (an unpromoted/KNOWN_NOT_MODELED gap remains). Not a computational error - see Company.onboardingStatus.`,
          status: "UNVERIFIED",
        },
        update: { question },
      });
      summaries.push({ stableKey, question, outcome: "flagged_gap" });
    }
  }

  return summaries;
}
