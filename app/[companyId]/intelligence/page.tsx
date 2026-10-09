import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { loadDebtIntelligenceDashboard } from "@/lib/product/customer-intelligence/debt-intelligence";
import { fmtM } from "@/lib/format";

export const metadata = { title: "Headroom — Debt intelligence" };
export const dynamic = "force-dynamic";

export default async function DebtIntelligencePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const d = await loadDebtIntelligenceDashboard(companyId);
  const cs = d.capitalStructure;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Debt intelligence</div>
        <div className="card-subtitle">{d.headline}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Rulebook</div>
          <div className="row-value">
            <Chip tone={d.rulebookStage === "EXECUTABLE" ? "pass" : "tight"}>{d.rulebookStage}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Capacity</div>
          <div className="row-value">
            <Chip tone="idle">{d.capacityStatus}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Amendments</div>
          <div className="row-value">{d.amendmentResolution}</div>
        </div>
        <div className="row-note">
          Docs {d.documentCount} · Interpreted {d.interpretedCount} · Counsel accepted/edited {d.acceptedCount}
        </div>
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant review
          </Link>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Lawyer review
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/onboarding/financials`}>
            Financial inputs
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Capital structure (financial snapshot)</div>
        <div className="card-subtitle">
          {cs.numericStatus === "SUPPORTED"
            ? `As of ${cs.asOfDate}`
            : "No financial snapshot — enter figures under Onboarding → Financials."}
        </div>
        {cs.numericStatus === "SUPPORTED" ? (
          <>
            <div className="row">
              <div className="row-label">Total debt</div>
              <div className="row-value">{fmtM(cs.totalDebt ?? 0)}</div>
            </div>
            <div className="row">
              <div className="row-label">Secured debt</div>
              <div className="row-value">{fmtM(cs.securedDebt ?? 0)}</div>
            </div>
            <div className="row">
              <div className="row-label">Cash</div>
              <div className="row-value">{fmtM(cs.cash ?? 0)}</div>
            </div>
            <div className="row">
              <div className="row-label">EBITDA</div>
              <div className="row-value">{fmtM(cs.ebitda ?? 0)}</div>
            </div>
            <div className="row">
              <div className="row-label">Interest expense</div>
              <div className="row-value">{fmtM(cs.interestExpense ?? 0)}</div>
            </div>
            {cs.notes && <div className="row-note">{cs.notes}</div>}
          </>
        ) : (
          <div className="row-note">Numeric capital-structure panel unavailable until financial inputs are saved.</div>
        )}
      </Card>

      <Card>
        <div className="card-title">Financial covenant ratios (AI-surfaced)</div>
        <div className="card-subtitle">
          Threshold language from analyzed provisions. Current ratio values stay NOT DETERMINABLE until executable formulas
          exist.
        </div>
        {d.ratios.map((r, i) => (
          <div key={i} style={{ marginTop: 10 }}>
            <div className="row">
              <div className="row-label">{r.name}</div>
              <div className="row-value">
                <Chip tone={r.status === "INPUTS_PRESENT" ? "navy" : "tight"}>{r.status}</Chip>
              </div>
            </div>
            <div className="row-note">{r.contractualSignal}</div>
            <div className="row-note">{r.currentValue}</div>
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Covenant basket capacity (discovery)</div>
        <div className="card-subtitle">
          Baskets and conditions extracted from the package. Remaining availability is not invented here.
        </div>
        {d.baskets.length === 0 ? (
          <div className="row-note">No basket/threshold language surfaced yet.</div>
        ) : (
          d.baskets.map((b, i) => (
            <div
              key={`${b.sectionRef}-${i}`}
              style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}
            >
              <div className="row">
                <div className="row-label">
                  §{b.sectionRef} — {b.heading}
                </div>
                <div className="row-value">
                  {b.reviewDecision ? <Chip tone="pass">{b.reviewDecision}</Chip> : <Chip tone="idle">AI</Chip>}
                </div>
              </div>
              <div className="row-note">{b.category}</div>
              {b.baskets.slice(0, 4).map((x, j) => (
                <div key={j} className="row-note">
                  · {x}
                </div>
              ))}
              {b.conditions.slice(0, 2).map((x, j) => (
                <div key={`c${j}`} className="row-note">
                  Condition: {x}
                </div>
              ))}
              <div className="row-note">{b.citation}</div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Compliance monitoring</div>
        {d.monitoring.length === 0 ? (
          <div className="row-note">No monitoring alerts from current workspace state.</div>
        ) : (
          d.monitoring.map((a, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <Chip tone={a.severity === "HIGH" ? "tight" : "idle"}>{a.severity}</Chip> {a.title}
              <div className="row-note">{a.detail}</div>
            </div>
          ))
        )}
      </Card>

      <div className="row-note">{d.note}</div>
    </div>
  );
}
