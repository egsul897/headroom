import Link from "next/link";
import { Card, Chip, type ChipTone } from "@/components/ui";
import { getReviewProgress } from "@/lib/onboarding/review";
import { getCoverageSnapshot } from "@/lib/onboarding/promotion";
import { prisma } from "@/lib/prisma";
import { promoteAction, generateGoldenTestsAction } from "./actions";

export const metadata = { title: "Headroom — Activate company" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, ChipTone> = { SOLVER_NATIVE: "pass", LEGACY: "navy", NOT_TESTED: "tight" };

export default async function ActivatePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [company, progress, goldenTests] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    getReviewProgress(companyId),
    prisma.goldenTest.findMany({ where: { companyId } }),
  ]);
  const coverage = await getCoverageSnapshot(companyId).catch(() => []);
  const promote = promoteAction.bind(null, companyId);
  const generateGoldenTests = generateGoldenTestsAction.bind(null, companyId);

  const readyToPromote = progress.approved + progress.edited;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Activate {company.name}</div>
        <div className="card-subtitle">
          Onboarding status: <Chip tone={company.onboardingStatus === "ACTIVE" ? "pass" : company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS" ? "tight" : "idle"}>{company.onboardingStatus}</Chip>
        </div>
        <div className="row-note">
          {readyToPromote} candidate(s) approved/edited and ready to promote. Promotion is transactional and only ever reads APPROVED/EDITED candidates — a KNOWN_NOT_MODELED permission is excluded even if approved (fail-closed, a documented gap).
        </div>
        <form action={promote} style={{ marginTop: 10 }}>
          <button type="submit" className="button-primary" disabled={readyToPromote === 0}>
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
              <Chip tone={STATUS_TONE[c.status] ?? "idle"}>{c.status}</Chip>
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
          <Link href={`/${companyId}/dashboard`} className="button button-primary" style={{ textDecoration: "none" }}>
            Go to Dashboard
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>
    </div>
  );
}
