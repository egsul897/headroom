import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getReviewProgress } from "@/lib/onboarding/review";

export const metadata = { title: "Headroom — Onboarding wizard" };
export const dynamic = "force-dynamic";

/**
 * The onboarding wizard shell (docs/company-onboarding-v1-implementation.md,
 * deliverable 8): Company -> Documents -> Extraction -> Review -> Financials
 * -> Facilities -> Activate. Each stage is its own route under
 * app/[companyId]/onboarding/** so a reviewer can leave and resume freely -
 * there is no forced linear wizard state machine, only a suggested order.
 */
export default async function OnboardingWizardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const [documentCount, chunkCount, progress, permissionCount, financialStateCount, facilityCount, goldenTestCount] = await Promise.all([
    prisma.document.count({ where: { companyId } }),
    prisma.documentChunk.count({ where: { document: { companyId } } }),
    getReviewProgress(companyId),
    prisma.permission.count({ where: { companyId } }),
    prisma.financialState.count({ where: { companyId } }),
    prisma.facility.count({ where: { companyId } }),
    prisma.goldenTest.count({ where: { companyId } }),
  ]);

  const stages = [
    { href: `/${companyId}/onboarding/documents`, label: "Documents", detail: `${documentCount} document(s), ${chunkCount} chunk(s)`, done: documentCount > 0 },
    { href: `/${companyId}/onboarding/review`, label: "Review", detail: `${progress.total} candidate(s), ${progress.approved + progress.edited} ready to promote`, done: progress.total > 0 && progress.pending === 0 && progress.reviewRequired === 0 },
    { href: `/${companyId}/onboarding/financials`, label: "Financials", detail: `${financialStateCount} snapshot(s) recorded`, done: financialStateCount > 0 },
    { href: `/${companyId}/onboarding/facilities`, label: "Facility mapping", detail: `${facilityCount} facility(ies) mapped, ${permissionCount} permission(s) available`, done: facilityCount > 0 },
    { href: `/${companyId}/onboarding/activate`, label: "Activate", detail: `status: ${company.onboardingStatus}, ${goldenTestCount} golden-test proposal(s)`, done: company.onboardingStatus !== "ONBOARDING" },
  ];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">{company.name} — onboarding</div>
        <div className="card-subtitle">
          Status: <Chip tone={company.onboardingStatus === "ACTIVE" ? "pass" : company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS" ? "tight" : "idle"}>{company.onboardingStatus}</Chip>
        </div>
        <div className="onboarding-stage-list">
          {stages.map((s) => (
            <Link key={s.href} href={s.href} className="onboarding-stage" style={{ textDecoration: "none", color: "inherit" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div className="row-note">{s.detail}</div>
              </div>
              <span className="onboarding-stage-status">{s.done ? "✓ started" : "not started"}</span>
            </Link>
          ))}
        </div>
      </Card>
      {(company.onboardingStatus === "ACTIVE" || company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS") && (
        <Card>
          <div className="card-title">This company is live</div>
          <div className="row-note">It now appears in the generalized product pages, exactly like any other company.</div>
          <div className="button-row" style={{ marginTop: 10 }}>
            <Link href={`/${companyId}/overview`} className="button button-primary" style={{ textDecoration: "none" }}>
              Go to Overview
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
