import Link from "next/link";
import { Card, Chip, type ChipTone } from "@/components/ui";
import { getReviewProgress } from "@/lib/onboarding/review";
import { getCoverageSnapshot } from "@/lib/onboarding/promotion";
import { prisma } from "@/lib/prisma";
import { onboardingStatusLabel } from "@/lib/status-labels";
import { promoteAction, generateGoldenTestsAction, activateDeterministicAction } from "./actions";
import { getAnalysisReadinessForCompany } from "@/lib/contract-model/analysis";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { deterministicActivationGate } from "@/lib/onboarding/deterministic-activation";

export const metadata = { title: "Headroom — Activate company" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, ChipTone> = { SOLVER_NATIVE: "pass", LEGACY: "navy", NOT_TESTED: "tight" };
// Customer-facing labels for lib/solver/coverage.ts's own status vocabulary (task §57 - no raw internal enum shown verbatim).
const STATUS_LABEL: Record<string, string> = { SOLVER_NATIVE: "Solver-native", LEGACY: "Legacy formula", NOT_TESTED: "Not tested" };

export default async function ActivatePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [company, progress, goldenTests, readiness, rulebook, financialSnapshots, declarations] =
    await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      getReviewProgress(companyId),
      prisma.goldenTest.findMany({ where: { companyId } }),
      getAnalysisReadinessForCompany(companyId).catch(() => ({ ready: false, reason: "READINESS_CHECK_FAILED" })),
      loadRulebookReadiness(companyId).catch(() => null),
      prisma.financialState.count({ where: { companyId } }),
      prisma.solverCoverageDeclaration.findMany({ where: { companyId }, select: { isComplete: true } }).catch(() => []),
    ]);
  const coverage = await getCoverageSnapshot(companyId).catch(() => []);
  const promote = promoteAction.bind(null, companyId);
  const generateGoldenTests = generateGoldenTestsAction.bind(null, companyId);
  const activateDeterministic = activateDeterministicAction.bind(null, companyId);
  // Deterministic (no-LLM) activation gate — counsel review +
  // financials. The LLM Promote card below stays for the LLM path.
  const detGate = deterministicActivationGate({
    rulebookStage: rulebook?.stage ?? "DISCOVERED",
    discoveredSummaries: rulebook?.discoveredSummaries ?? 0,
    exceptions: rulebook?.exceptionItems ?? 0,
    exceptionDecisions: rulebook?.exceptionDecisions ?? 0,
    financialSnapshots,
    declarationsComplete: declarations.length > 0 && declarations.every((d) => d.isComplete),
  });

  const readyToPromote = progress.approved + progress.edited;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Activate workspace (Rulebook path)</div>
        <div className="card-subtitle">
          Deterministic review — no LLM credential needed. Counsel decisions in the Rulebook compile the executable
          rulebook; activation marks the workspace live.
        </div>
        <div className="row-note">
          Rulebook: {rulebook?.stage ?? "DISCOVERED"} · {rulebook?.exceptionDecisions ?? 0} of {rulebook?.exceptionItems ?? 0}{" "}
          exception items reviewed (routine items system-accepted) · {rulebook?.executablePermissions ?? 0} executable permission(s) ·{" "}
          {financialSnapshots} financial snapshot(s).
        </div>
        {!detGate.ready &&
          detGate.blockers.map((b) => (
            <div key={b} className="row-note" style={{ marginTop: 6 }}>
              {b}
            </div>
          ))}
        {company.onboardingStatus !== "ONBOARDING" && (
          <div className="row-note" style={{ marginTop: 6 }}>
            Already activated ({onboardingStatusLabel(company.onboardingStatus)}).
          </div>
        )}
        <form action={activateDeterministic} style={{ marginTop: 10 }}>
          <button
            type="submit"
            className="button-primary"
            disabled={!detGate.ready || company.onboardingStatus !== "ONBOARDING"}
          >
            {company.onboardingStatus === "ONBOARDING"
              ? detGate.status === "ACTIVE_WITH_LIMITATIONS"
                ? "Activate workspace (with limitations)"
                : "Activate workspace"
              : "Already activated"}
          </button>
        </form>
      </Card>

      <Card>
        <div className="card-title">Activate {company.name}</div>
        <div className="card-subtitle">
          Onboarding status: <Chip tone={company.onboardingStatus === "ACTIVE" ? "pass" : company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS" ? "tight" : "idle"}>{onboardingStatusLabel(company.onboardingStatus)}</Chip>
        </div>
        <div className="row-note">
          {readyToPromote} candidate(s) approved/edited and ready to promote. Promotion writes legacy Permission / financial rows after Phase 3 contract analysis is ready — promoted Permissions stay UNVERIFIED. Phase 3 VERIFIED semantic units (when analysis produces them) are surfaced separately and are not package CERTIFIED or Phase 4E capacity. A KNOWN_NOT_MODELED permission is excluded even if approved.
        </div>
        {/* Rule 103: same readiness gate as the review page —
            never promote against a stale document set. */}
        {!readiness.ready && (
          <div className="row-note" style={{ marginTop: 10 }}>
            <Chip tone="trip">PROMOTION BLOCKED</Chip> Contract-model analysis is not current ({readiness.reason}). Re-run analysis before promoting — a newly uploaded
            document may otherwise sit entirely unanalyzed while the rulebook claims coverage.
          </div>
        )}
        <form action={promote} style={{ marginTop: 10 }}>
          <button type="submit" className="button-primary" disabled={readyToPromote === 0 || !readiness.ready}>
            Promote {readyToPromote} candidate(s)
          </button>
        </form>
      </Card>

      <Card>
        <div className="card-title">Post-promotion coverage-gate results</div>
        <div className="card-subtitle">Using the same lib/solver/coverage.ts predicate the covenant engine itself uses — no new gap logic.</div>
        {coverage.length === 0 && <div className="row-note">No coverage scopes declared yet — promote at least one Permission first.</div>}
        {coverage.map((c) => (
          <div className="row" key={`${c.documentId}:${c.side}:${c.grantType}`}>
            <div className="row-label">
              {c.documentId} · {c.side} · {c.grantType}
            </div>
            <div className="row-value">
              <Chip tone={STATUS_TONE[c.status] ?? "idle"}>{STATUS_LABEL[c.status] ?? c.status}</Chip>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Golden-test proposals</div>
        <div className="card-subtitle">
          Uses GoldenTest.stableKey (format companyId:qNN, never a new hardcoded id), computed by actually running the engine — never fabricated, never auto-VERIFIED. Requires financial onboarding to be complete first.
        </div>
        <form action={generateGoldenTests} style={{ marginBottom: 10 }}>
          <button type="submit" className="button">
            Generate/refresh golden-test proposals
          </button>
        </form>
        {goldenTests.map((g) => (
          <div className="row" key={g.id}>
            <div className="row-label">
              {g.stableKey} — {g.question}
            </div>
            <div className="row-value">
              <Chip tone={g.status === "VERIFIED" ? "pass" : "idle"}>{g.status}</Chip>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="row-note">
          Once ACTIVE or ACTIVE_WITH_LIMITATIONS, {company.name} is a normal company in the generalized product pages — no separate dashboard.
        </div>
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link href={`/${companyId}`} className="button button-primary" style={{ textDecoration: "none" }}>
            Open overview
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>
    </div>
  );
}
