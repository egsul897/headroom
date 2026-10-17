import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { CompanyOverview } from "@/components/home/Overview";
import { AppShell } from "@/components/shell/AppShell";
import { BrandMark } from "@/components/home/icons";
import { Card } from "@/components/ui";
import "../../home-shell.css";
import "./rails.css";
import "./brands.css";
import "./palettes.css";
import { CountUp } from "@/components/motion/CountUp";
import { SampleClauses } from "./clauses";
import { SampleDashboard } from "./dashboard";
import { SAMPLE_BANNER, SAMPLE_COMPANY, SAMPLE_TICKER } from "./fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Headroom — sample data" };

/**
 * Development illustration. Production builds take notFound().
 * This module does not import Prisma, Neon, or the dashboard service.
 */
export default function SamplePreview({ searchParams }: { searchParams: { screen?: string; rail?: string; brand?: string; teal?: string; light?: string; palette?: string; detail?: string } }) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") notFound();
  const screen = searchParams.screen ?? "overview";
  const brand = searchParams.brand === "navy" || searchParams.brand === "olive" || searchParams.brand === "teal" ? searchParams.brand : undefined;
  const teal = searchParams.teal === "1" || searchParams.teal === "2" || searchParams.teal === "3" ? searchParams.teal : undefined;
  const light = searchParams.light === "a" || searchParams.light === "b" || searchParams.light === "c" ? searchParams.light : undefined;
  const palette = searchParams.palette === "1" || searchParams.palette === "2" || searchParams.palette === "3" || searchParams.palette === "4" ? searchParams.palette : undefined;

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

  const path = screen === "covenants" ? "/sample/covenants" : screen === "capacity" ? "/sample/capacity" : "/sample";
  const rail = searchParams.rail === "deep" || searchParams.rail === "mid" || searchParams.rail === "soft" ? searchParams.rail : undefined;

  return (
    <div data-rail={rail} data-brand={brand} data-teal={teal} data-light={light} data-palette={palette}>
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
        ) : (
          <SampleDashboard initialDetail={searchParams.detail === "1"} />
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
          <p className="page-answer">Counsel starts at the clause and the redline. This text is sample language, not an agreement.</p>
        </div>
        <Link className="button button-quiet" href={sampleHref("overview", brand)}>
          Back to sample summary
        </Link>
      </header>
      <Card>
        <div className="card-title">Redline</div>
        <div className="card-subtitle">Base beside amendment. Sample discovery — not counsel approval.</div>
        <article className="clause">
          <div className="clause-head">
            <div className="clause-sec">§6.04</div>
            <StatusBadge status="DISCOVERED" />
          </div>
          <div className="redline">
            <div className="redline-col redline-base">
              <span className="redline-label">Base document</span>
              <div>The sample borrower shall not incur additional debt except as this sample section permits.</div>
            </div>
            <div className="redline-col redline-amend">
              <span className="redline-label">Amendment</span>
              <div>The sample borrower may incur incremental debt under a sample basket, subject to a sample ratio test.</div>
            </div>
          </div>
        </article>
      </Card>
      <Card>
        <div className="card-title">Indebtedness</div>
        <div className="card-subtitle">Two sample provisions. Open one without leaving the page.</div>
        <SampleClauses initialDetail={initialDetail} />
      </Card>
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
          <p className="page-answer">A treasurer or lender reads the authority before the figure. This figure is an illustration.</p>
        </div>
      </header>
      <div className="home-split">
        <SampleKpi label="Secured, sample" value="$40 million" caption="Illustrative remaining. Not a certified path." />
        <SampleKpi label="Unsecured, sample" value="Not evaluated" caption="No sample path. Not zero and not unlimited." />
      </div>
      <Card>
        <div className="card-title">Provenance</div>
        <div className="card-subtitle">What the illustration pretends to rest on, so the real screen’s shape is visible.</div>
        <div className="row">
          <div className="row-label">Authority</div>
          <div className="row-value">
            <StatusBadge status="LEGACY_ENGINE" />
          </div>
        </div>
        <div className="row">
          <div className="row-label">Snapshot</div>
          <div className="row-value">sample-snapshot-001 · March 31, 2024</div>
        </div>
        <div className="row">
          <div className="row-label">Ledger</div>
          <div className="row-value">3 sample usages</div>
        </div>
        <div className="row">
          <div className="row-label">Binding citation</div>
          <div className="row-value">Sample secured notes §4.09</div>
        </div>
        <div className="row-note">A production number appears only when an executable path returns one. This row does not.</div>
      </Card>
    </div>
  );
}

function SampleKpi({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <section className="home-card">
      <h2 className="home-eyebrow">{label}</h2>
      <p className="sample-figure">
        <CountUp text={value} />
      </p>
      <p className="sample-caption">{caption}</p>
    </section>
  );
}

const PORTFOLIO = [
  { name: "Sample Holdings", ticker: "SMPL", role: "Sponsor portfolio", coverage: "Active" },
  { name: "Northwind Sample", ticker: "NWND", role: "Borrower", coverage: "Active — limited coverage" },
  { name: "Harbor Sample", ticker: "HBRS", role: "Lender watch", coverage: "Onboarding" },
  { name: "Ridge Sample", ticker: "RDGE", role: "Portfolio ops", coverage: "Active" },
] as const;
