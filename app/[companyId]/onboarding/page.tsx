import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getCompanySetupStatus, nextSetupStep } from "@/lib/onboarding/setup-status";
import { onboardingStatusLabel } from "@/lib/status-labels";

export const metadata = { title: "Headroom — Set up" };
export const dynamic = "force-dynamic";

/**
 * Customer setup hub. Suggested order only — reviewers can leave and resume.
 * Upload → Headroom reads → counsel reviews → financials → activate → dashboard.
 */
export default async function OnboardingWizardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) notFound();

  const status = await getCompanySetupStatus(companyId);
  if (!status) notFound();
  const next = nextSetupStep(status);

  const stages = [
    {
      href: `/${companyId}/onboarding/documents`,
      label: "1. Upload documents",
      detail: `${status.documentsUploaded} uploaded · ${status.extractedDocuments} analyzed`,
      done: status.documentsUploaded > 0 && status.extractedDocuments > 0,
    },
    {
      href: `/${companyId}/onboarding/review`,
      label: "2. Review what Headroom found",
      detail:
        status.pendingReview > 0
          ? `${status.pendingReview} waiting for review`
          : `${status.readyToPromote} ready to promote · ${status.promoted} promoted`,
      done: status.promoted > 0 || (status.readyToPromote > 0 && status.pendingReview === 0),
    },
    {
      href: `/${companyId}/onboarding/financials`,
      label: "3. Confirm financials",
      detail: `${status.financialSnapshots} reporting snapshot(s) recorded`,
      done: status.financialSnapshots > 0,
    },
    {
      href: `/${companyId}/onboarding/activate`,
      label: "4. Activate dashboard",
      detail: `status: ${onboardingStatusLabel(company.onboardingStatus)} · ${status.permissions} permission(s)`,
      done: company.onboardingStatus !== "ONBOARDING",
    },
  ];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Set up {company.name}</div>
        <div className="card-subtitle">
          Upload the debt documents and financials. Headroom reads them, you review the findings, then the dashboard
          computes covenant headroom from this company&apos;s sources — never invented figures.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Chip tone={company.onboardingStatus === "ACTIVE" ? "pass" : company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS" ? "tight" : "idle"}>
            {onboardingStatusLabel(company.onboardingStatus)}
          </Chip>
          <Link href={next.href} className="button button-primary" style={{ textDecoration: "none" }}>
            {next.label}
          </Link>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {next.detail}
        </div>
      </Card>

      <Card>
        <div className="card-title">Setup steps</div>
        <div className="onboarding-stage-list">
          {stages.map((s) => (
            <Link key={s.href} href={s.href} className="onboarding-stage" style={{ textDecoration: "none", color: "inherit" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{s.label}</div>
                <div className="row-note">{s.detail}</div>
              </div>
              <span className="onboarding-stage-status">{s.done ? "✓ done" : "next"}</span>
            </Link>
          ))}
        </div>
        <div className="row-note" style={{ marginTop: 12 }}>
          Optional: <Link href={`/${companyId}/onboarding/sources`}>EDGAR or additional CSV sources</Link>
          {" · "}
          <Link href={`/${companyId}/onboarding/facilities`}>map facilities</Link>
        </div>
      </Card>

      {(company.onboardingStatus === "ACTIVE" || company.onboardingStatus === "ACTIVE_WITH_LIMITATIONS") && (
        <Card>
          <div className="card-title">Workspace is live</div>
          <div className="row-note">
            The dashboard can evaluate legacy-engine figures from promoted Permissions and financials. That is not Phase 3
            CERTIFIED rulebook capacity and not Phase 4E-certified answers
            {status.ns4ApprovedSnapshots > 0 ? ` · ${status.ns4ApprovedSnapshots} NS-4 APPROVED financial snapshot(s) on file` : ""}.
          </div>
          <div className="button-row" style={{ marginTop: 10 }}>
            <Link href={`/${companyId}`} className="button button-primary" style={{ textDecoration: "none" }}>
              Open overview
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
