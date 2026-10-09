import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { OutcomeBadge } from "@/components/product/OutcomeBadge";
import { fmtM } from "@/lib/format";
import { loadPositionView } from "@/lib/product/unified-customer";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { runPackageLegalPath } from "@/lib/product/legal-intelligence/run-package-path";

export const metadata = { title: "Headroom — Position" };
export const dynamic = "force-dynamic";

/**
 * Position — debt / covenant capacity workspace.
 * Reads the shared verified engine via loadPositionView. Never hardcodes issuer arithmetic.
 */
export default async function PositionPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;

  if (isConmed) {
    const path = await runPackageLegalPath(CONMED_DEMO_COMPANY_ID);
    const blockers = path.challenges.filter((c) => c.severity === "BLOCKER");
    const facts = path.conclusions.filter((c) => c.kind === "PACKAGE_FACT");

    return (
      <div className="stack">
        <Card>
          <div className="card-title">Position</div>
          <div className="card-subtitle">
            CONMED authentic package — integrated legal path + autonomous challenge. Capacity is{" "}
            <strong>not determinable</strong>.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <Chip tone="tight">NOT DETERMINABLE</Chip>
            </div>
          </div>
          <div className="row">
            <div className="row-label">Executable conclusions surviving challenge</div>
            <div className="row-value">{path.survivingExecutableConclusions}</div>
          </div>
          <div className="row">
            <div className="row-label">Path</div>
            <div className="row-value" style={{ fontSize: 12 }}>
              {path.pathExecuted.join(" → ")}
            </div>
          </div>
          <div className="row">
            <div className="row-label">Covenant rows examined</div>
            <div className="row-value">
              {path.metrics.covenantRowsExamined} · unresolved {path.metrics.unresolved}
            </div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Utilized capacity</div>
            <div className="row-value">
              <Chip tone="tight">UNKNOWN</Chip> — not defaulted to zero
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/covenants`}>
              Explore covenants
            </Link>
            <Link className="button" href={`/${companyId}/simulate`}>
              Open simulate
            </Link>
            <Link className="button" href={`/${companyId}/ask`}>
              Ask
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-title">Challenge findings (blockers)</div>
          {blockers.slice(0, 8).map((b) => (
            <div className="row" key={b.id}>
              <div>
                <div className="row-label">{b.category}</div>
                <div className="row-note">{b.statement}</div>
              </div>
              <Chip tone="tight">BLOCKER</Chip>
            </div>
          ))}
        </Card>

        <Card>
          <div className="card-title">Package facts (source-backed)</div>
          {facts.slice(0, 6).map((f) => (
            <div className="row" key={f.id}>
              <div className="row-note">{f.statement}</div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const view = await loadPositionView(companyId);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Position</div>
        <div className="card-subtitle">
          Shared verified engine · as-of {view.asOfDateIso} · {view.readinessHeadline}
        </div>
        <OutcomeBadge kind={view.outcome.kind} rationale={view.outcome.rationale} />
        <div className="row" style={{ marginTop: 10 }}>
          <div className="row-label">Authority</div>
          <div className="row-value" style={{ fontSize: 12 }}>
            {view.authority.capacityAuthority}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">State fingerprint</div>
          <div className="row-value mono" style={{ fontSize: 12 }}>
            {view.stateFingerprint}
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask
          </Link>
          <Link className="button" href={`/${companyId}/dashboard`}>
            Full dashboard
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Financial dates & evidence inputs</div>
        <div className="row">
          <div className="row-label">As-of date</div>
          <div className="row-value mono">{view.financialDates.asOfDateIso}</div>
        </div>
        <div className="row">
          <div className="row-label">Financial snapshot</div>
          <div className="row-value">
            {view.financialDates.hasFinancialSnapshot ? (
              <Chip tone="pass">Present</Chip>
            ) : (
              <Chip tone="tight">Missing</Chip>
            )}
          </div>
        </div>
        <div className="row">
          <div className="row-label">NS-4 APPROVED snapshots</div>
          <div className="row-value">{view.financialDates.ns4ApprovedSnapshotCount}</div>
        </div>
        <div className="row">
          <div className="row-label">EBITDA</div>
          <div className="row-value">
            {view.financialDates.ebitdaMillions != null ? (
              fmtM(view.financialDates.ebitdaMillions)
            ) : (
              <Chip tone="idle">Not available</Chip>
            )}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Total debt</div>
          <div className="row-value">
            {view.financialDates.totalDebtMillions != null ? (
              fmtM(view.financialDates.totalDebtMillions)
            ) : (
              <Chip tone="idle">Not available</Chip>
            )}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Cash</div>
          <div className="row-value">
            {view.financialDates.cashMillions != null ? (
              fmtM(view.financialDates.cashMillions)
            ) : (
              <Chip tone="idle">Not available</Chip>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Ratios</div>
        {view.ratios.map((r) => (
          <div className="row" key={r.key}>
            <div className="row-label">{r.label}</div>
            <div className="row-value mono">
              {r.value ?? <Chip tone="idle">Not available</Chip>}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Covenant thresholds</div>
        {view.covenantThresholds.length === 0 && (
          <div className="row-note">No ratio-threshold provisions modeled for this workspace.</div>
        )}
        {view.covenantThresholds.map((r) => (
          <div className="row" key={r.key}>
            <div>
              <div className="row-label">{r.label}</div>
              <div className="row-note">
                {r.documentName} · §{r.sectionRef}
                {r.threshold ? ` · threshold ${r.threshold}` : ""}
              </div>
            </div>
            <div className="row-value mono">{r.value ?? "—"}</div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Basket limits</div>
        {view.baskets.length === 0 && (
          <div className="row-note">No basket provisions modeled for this workspace.</div>
        )}
        {view.baskets.slice(0, 24).map((b) => (
          <div className="row" key={`${b.documentId}:${b.code}`}>
            <div>
              <div className="row-label">{b.basketName}</div>
              <div className="row-note">
                {b.documentName} · §{b.sectionRef} · {b.code}
                {b.utilizationNote ? ` — ${b.utilizationNote}` : ""}
              </div>
            </div>
            <div className="row-value">
              {b.capacityMillions != null ? (
                <span className="mono">{fmtM(b.capacityMillions)}</span>
              ) : (
                <Chip tone="idle">{b.status}</Chip>
              )}
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Utilization & remaining capacity</div>
        <div className="row">
          <div className="row-label">Secured remaining</div>
          <div className="row-value">
            {view.remainingCapacity.secured != null ? (
              fmtM(view.remainingCapacity.secured)
            ) : (
              <Chip tone="tight">Not determinable</Chip>
            )}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Unsecured remaining</div>
          <div className="row-value">
            {view.remainingCapacity.unsecured != null ? (
              fmtM(view.remainingCapacity.unsecured)
            ) : (
              <Chip tone="tight">Not determinable</Chip>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Shared / binding constraints</div>
        {view.sharedConstraints.length === 0 && (
          <div className="row-note">No binding constraint identified at amount=0.</div>
        )}
        {view.sharedConstraints.map((c, i) => (
          <div className="row" key={`${c.documentId}-${c.sectionRef}-${i}`}>
            <div>
              <div className="row-label">{c.documentName}</div>
              <div className="row-note">
                §{c.sectionRef}
                {c.basketName ? ` · ${c.basketName}` : ""}
                {c.note ? ` — ${c.note}` : ""}
              </div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Evidence (document · section)</div>
        {view.evidence.slice(0, 30).map((e, i) => (
          <div className="row" key={`${e.documentId}-${e.sectionRef}-${i}`}>
            <div>
              <div className="row-label">{e.documentName}</div>
              <div className="row-note">
                §{e.sectionRef}
                {e.provisionCode ? ` · ${e.provisionCode}` : ""}
                {e.note ? ` — ${e.note}` : ""}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
