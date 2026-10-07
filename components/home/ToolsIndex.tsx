import Link from "next/link";
import type { OnboardingStatus } from "@prisma/client";
import { LEGACY_TOOLS } from "@/lib/home/nav";

/** Door to the legacy workspace pages. Simulate stays a scenario tool. */
export function ToolsIndex({ companyId, onboardingStatus }: { companyId: string; onboardingStatus: OnboardingStatus }) {
  const showOnboarding = onboardingStatus === "ONBOARDING" || onboardingStatus === "ACTIVE_WITH_LIMITATIONS";

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Deal setup & tools</h1>
          <p className="home-greeting-sub">Legacy workspace pages for this company.</p>
        </div>
      </header>
      <div className="tools-list">
        {showOnboarding ? (
          <Link className="tools-link" href={`/${companyId}/onboarding`}>
            <span>
              <span className="tools-link-label">Onboarding</span>
              <span className="tools-link-note">Company setup still in progress.</span>
            </span>
            <span className="tools-link-go" aria-hidden="true">
              →
            </span>
          </Link>
        ) : null}
        {LEGACY_TOOLS.map((tool) => (
          <Link key={tool.segment} className="tools-link" href={`/${companyId}/${tool.segment}`}>
            <span>
              <span className="tools-link-label">{tool.label}</span>
              <span className="tools-link-note">{tool.note}</span>
            </span>
            <span className="tools-link-go" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
