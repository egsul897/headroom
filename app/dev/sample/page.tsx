import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyOverview } from "@/components/home/Overview";
import { AppShell } from "@/components/shell/AppShell";
import { BrandMark } from "@/components/home/icons";
import { Card } from "@/components/ui";
import "../../home-shell.css";
import "./rails.css";
import "./brands.css";
import "./palettes.css";
import "./viz.css";
import { CountUp } from "@/components/motion/CountUp";
import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "@/components/motion/provenance-copy";
import { SampleClauses } from "./clauses";
import { SampleDashboard } from "./dashboard";
import { SampleSimulate } from "./simulate";
import { SampleAsk } from "./ask-preview";
import { SAMPLE_BANNER, SAMPLE_COMPANY, SAMPLE_TICKER } from "./fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Headroom — sample data" };

/**
 * Development illustration. Production builds take notFound().
 * This module does not import Prisma, Neon, or the dashboard service.
 */
export default function SamplePreview({ searchParams }: { searchParams: { screen?: string; rail?: string; brand?: string; teal?: string; light?: string; palette?: string; viz?: string; detail?: string; ebitda?: string; amt?: string; inc?: string; gen?: string; ratio?: string } }) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") notFound();
  const screen = searchParams.screen ?? "overview";
  const brand = searchParams.brand === "navy" || searchParams.brand === "olive" || searchParams.brand === "teal" ? searchParams.brand : undefined;
  const teal = searchParams.teal === "1" || searchParams.teal === "2" || searchParams.teal === "3" ? searchParams.teal : undefined;
  const light = searchParams.light === "a" || searchParams.light === "b" || searchParams.light === "c" ? searchParams.light : undefined;
  const palette = searchParams.palette === "1" || searchParams.palette === "2" || searchParams.palette === "3" || searchParams.palette === "4" ? searchParams.palette : undefined;
  const viz = searchParams.viz === "A" || searchParams.viz === "B" || searchParams.viz === "C" || searchParams.viz === "D" || searchParams.viz === "E" || searchParams.viz === "F" ? searchParams.viz : undefined;

  if (screen === "portfolio") {
    return (
      <div className="app-shell sample-portfolio" data-brand={brand}>
        <aside className="app-sidebar" aria-label="Sample brand">
          <div className="app-brand">
            <BrandMark />
            <span className="app-brand-word">Headroom</span>
          </div>
          <p className="app-tagline">Clarity. Control. Confidence.</p>
        </aside>
        <div className="app-main">
          <div className="app-content">
            <div className="chooser">
              <SampleBanner />
              <header className="page-head">
                <div>
                  <p className="page-kicker">Sample portfolio</p>
                  <h1 className="page-question">Which company are you opening?</h1>
                  <p className="page-answer">
                    A sponsor or lender scans coverage here. Headroom is not on this list, because a list of made-up capacity would be a false portfolio.
                  </p>
                </div>
              </header>
              <Card>
                <div className="card-title">Sample portfolio</div>
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th scope="col">Company</th>
                      <th scope="col">Ticker</th>
                      <th scope="col">Watch role</th>
                      <th scope="col">Coverage</th>
                      <th scope="col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {PORTFOLIO.map((row) => (
                      <tr key={row.name}>
                        <td className="portfolio-name">{row.name}</td>
                        <td>{row.ticker}</td>
                        <td>{row.role}</td>
                        <td>{row.coverage}</td>
                        <td>
                          <div className="portfolio-actions">
                            <Link className="button button-primary" href={sampleHref("overview", brand)}>
                              Open sample
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "empty") {
    return (
      <div data-brand={brand}>
        <AppShell companyId="unloaded" companyName="No company loaded" ticker={null} onboardingStatus="ACTIVE" pathnameOverride="/unloaded">
          <p className="sample-banner" role="note">
            Product empty state. No company is connected. Figures stay unknown.
          </p>
          <CompanyOverview companyId="unloaded" identityName={null} />
        </AppShell>
      </div>
    );
  }

  const path = screen === "covenants" ? "/sample/covenants" : screen === "capacity" ? "/sample/capacity" : screen === "simulate" ? "/sample/simulate" : screen === "ask" ? "/sample/ask" : "/sample";
  const incremental = numberOr(searchParams.inc, 100);
  const general = numberOr(searchParams.gen, 80);
  const ratio = numberOr(searchParams.ratio, 60);
  const rail = searchParams.rail === "deep" || searchParams.rail === "mid" || searchParams.rail === "soft" ? searchParams.rail : undefined;

  return (
    <div data-rail={rail} data-brand={brand} data-teal={teal} data-light={light} data-palette={palette} data-viz={viz}>
      <AppShell
        companyId="sample"
        companyName={SAMPLE_COMPANY}
        ticker={SAMPLE_TICKER}
        onboardingStatus="ACTIVE"
        pathnameOverride={path}
        user={{ name: "Sample reviewer", role: "Illustration only" }}
      >
        <SampleBanner />
        {screen === "covenants" ? (
          <CovenantsSample brand={brand} initialDetail={searchParams.detail === "1"} />
        ) : screen === "capacity" ? (
          <CapacitySample />
        ) : screen === "simulate" ? (
          <SampleSimulate incremental={incremental} general={general} ratio={ratio} />
        ) : screen === "ask" ? (
          <SampleAsk />
        ) : (
          <SampleDashboard
            viz={viz}
            initialDetail={searchParams.detail === "1"}
            initialEbitda={searchParams.ebitda === "1" || searchParams.ebitda === "failed" ? "list" : searchParams.ebitda === "error" ? "a" : searchParams.ebitda ?? null}
            failedReason={searchParams.ebitda === "failed" ? "SEC companyfacts 503" : null}
            staleSince={searchParams.ebitda === "failed" ? "2026-10-16T18:00:00.000Z" : null}
          />
        )}
      </AppShell>
    </div>
  );
}

function sampleHref(screen: string, brand?: string) {
  const params = new URLSearchParams();
  if (screen !== "overview") params.set("screen", screen);
  if (brand) params.set("brand", brand);
  const query = params.toString();
  return query ? `/dev/sample?${query}` : "/dev/sample";
}

function SampleBanner() {
  return (
    <p className="sample-banner" role="note">
      <strong>SAMPLE DATA</strong>
      <span>{SAMPLE_BANNER.replace(/^SAMPLE DATA — /, "")}</span>
    </p>
  );
}

function CovenantsSample({ brand, initialDetail = false }: { brand?: string; initialDetail?: boolean }) {
  return (
    <div className="page-frame">
      <header className="page-head">
        <div>
          <p className="page-kicker">Covenants</p>
          <h1 className="page-question">What do the documents restrict?</h1>
          <p className="page-answer">The clause is the answer. The redline opens beside it. This is sample language, not an agreement.</p>
        </div>
        <Link className="button button-quiet" href={sampleHref("overview", brand)}>
          Back to sample summary
        </Link>
      </header>
      <SampleClauses initialDetail={initialDetail} />
    </div>
  );
}

function CapacitySample() {
  return (
    <div className="page-frame">
      <header className="page-head">
        <div>
          <p className="page-kicker">Capacity</p>
          <h1 className="page-question">How much capacity can we rely on?</h1>
          <p className="page-answer">The figure is only as good as its authority. This one is an illustration.</p>
        </div>
      </header>
      <div className="home-answer">
        <div className="home-hero">
          <SampleKpi
            label="Secured, sample"
            value="$40 million"
            caption="Illustrative remaining. Not a certified path."
            detail={{
              title: "Secured, sample",
              source: "Sample secured notes. No source document is attached.",
              clause: "Sample section 4.09. Sample language, not an operative clause.",
              history: "Sample date March 31, 2024. Not a loaded history.",
            }}
          />
        </div>
        <div className="home-facts">
          <SampleKpi
            label="Unsecured, sample"
            value="Not evaluated"
            caption="No sample path. Not zero and not unlimited."
            detail={{ title: "Unsecured, sample", source: UNLOADED_SOURCE, clause: UNLOADED_CLAUSE, history: UNLOADED_HISTORY }}
          />
          <SampleKpi
            label="Authority"
            value="Legacy engine"
            caption="A production number appears only when an executable path returns one."
            detail={{
              title: "Authority",
              source: UNLOADED_SOURCE,
              clause: UNLOADED_CLAUSE,
              history: UNLOADED_HISTORY,
            }}
          />
          <SampleKpi
            label="Citation"
            value="§4.09"
            caption="Sample secured notes. Snapshot sample-snapshot-001, March 31, 2024."
            detail={{
              title: "Citation",
              source: "Sample secured notes. No source document is attached.",
              clause: "Sample section 4.09. Sample language, not an operative clause.",
              history: "Sample date March 31, 2024. Not a loaded history.",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SampleKpi({
  label,
  value,
  caption,
  detail,
}: {
  label: string;
  value: string;
  caption: string;
  detail: { title: string; source: string; clause: string; history: string };
}) {
  return (
    <section className="home-card">
      <h2 className="home-eyebrow">{label}</h2>
      <p className="sample-figure">
        <CountUp text={value} />
      </p>
      <p className="sample-caption">{caption}</p>
      <OpenProvenanceButton title={detail.title} source={detail.source} clause={detail.clause} history={detail.history}>
        Open detail
      </OpenProvenanceButton>
    </section>
  );
}

function numberOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const PORTFOLIO = [
  { name: "Sample Holdings", ticker: "SMPL", role: "Sponsor portfolio", coverage: "Active" },
  { name: "Northwind Sample", ticker: "NWND", role: "Borrower", coverage: "Active — limited coverage" },
  { name: "Harbor Sample", ticker: "HBRS", role: "Lender watch", coverage: "Onboarding" },
  { name: "Ridge Sample", ticker: "RDGE", role: "Portfolio ops", coverage: "Active" },
] as const;
