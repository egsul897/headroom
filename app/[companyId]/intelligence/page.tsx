import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { loadDebtIntelligenceDashboard } from "@/lib/product/customer-intelligence/debt-intelligence";
import { fmtM } from "@/lib/format";
import { MetricRow } from "@/components/debt-intelligence/MetricRow";

export const metadata = { title: "Headroom — Debt intelligence" };
export const dynamic = "force-dynamic";

function toneFor(status: string): "pass" | "tight" | "navy" | "idle" {
  if (status === "COMPUTED") return "pass";
  if (status === "MISSING_FINANCIALS" || status === "MISSING_RULEBOOK") return "tight";
  if (status === "AI_SURFACED" || status === "CONDITIONAL") return "navy";
  return "idle";
}

export default async function DebtIntelligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ metric?: string }>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const openMetric = sp.metric?.trim() || null;
  const d = await loadDebtIntelligenceDashboard(companyId);
  const cs = d.capitalStructure;
  const agg = cs.aggregates;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Debt intelligence dashboard</div>
        <div className="card-subtitle">{d.headline}</div>
        <div className="row-note" style={{ marginTop: 8 }}>
          AI-populated from your financing package, financial snapshots, ledger and counsel review. External legal
          verification is not required before metrics appear. Remaining capacity is never invented.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Rulebook</div>
          <div className="row-value">
            <Chip tone={d.rulebookStage === "EXECUTABLE" ? "pass" : "tight"}>{d.rulebookStage}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Capacity path</div>
          <div className="row-value">
            <Chip tone="idle">{d.capacityStatus}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Amendments</div>
          <div className="row-value">{d.amendmentResolution}</div>
        </div>
        <div className="row-note">
          Docs {d.documentCount} · Interpreted {d.interpretedCount} · Counsel accepted/edited {d.acceptedCount} ·
          Generated {d.generatedAt.slice(0, 19)}Z
        </div>
        <div className="button-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
          <Link className="button" href={`/${companyId}`}>
            Overview
          </Link>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant review
          </Link>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Lawyer review
          </Link>
          <Link className="button button-primary" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/onboarding/financials`}>
            Financial inputs
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity
          </Link>
          <Link className="button" href={`/${companyId}/ledger`}>
            Ledger
          </Link>
        </div>
      </Card>

      {/* 1. Capital structure */}
      <Card>
        <div className="card-title">1. Debt capital structure</div>
        <div className="card-subtitle">
          {cs.asOfDate
            ? `Aggregates as of ${cs.asOfDate} · ${cs.numericStatus}`
            : "No financial snapshot — facility/instrument rows may still appear from the package."}
        </div>
        <div className="row">
          <div className="row-label">Total debt</div>
          <div className="row-value">{agg.totalDebt != null ? fmtM(agg.totalDebt) : "—"}</div>
        </div>
        <div className="row">
          <div className="row-label">Secured / unsecured</div>
          <div className="row-value">
            {agg.securedDebt != null ? fmtM(agg.securedDebt) : "—"} /{" "}
            {agg.unsecuredDebt != null ? fmtM(agg.unsecuredDebt) : "—"}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Cash / net debt</div>
          <div className="row-value">
            {agg.cash != null ? fmtM(agg.cash) : "—"} / {agg.netDebt != null ? fmtM(agg.netDebt) : "—"}
          </div>
        </div>
        <div className="row">
          <div className="row-label">EBITDA / interest</div>
          <div className="row-value">
            {agg.ebitda != null ? fmtM(agg.ebitda) : "—"} /{" "}
            {agg.interestExpense != null ? fmtM(agg.interestExpense) : "—"}
          </div>
        </div>
        {cs.notes ? <div className="row-note">{cs.notes}</div> : null}
        {cs.instruments.length === 0 ? (
          <div className="row-note" style={{ marginTop: 8 }}>
            No facilities or debt tranches yet. Add financials or facility records to populate instruments, rates and
            maturities.
          </div>
        ) : (
          cs.instruments.map((inst) => (
            <MetricRow
              key={inst.metricId}
              label={`${inst.name} (${inst.kind})`}
              value={
                inst.outstanding != null
                  ? `${fmtM(inst.outstanding)}${inst.available != null ? ` · avail ${fmtM(inst.available)}` : ""}`
                  : inst.commitment != null
                    ? `Commitment ${fmtM(inst.commitment)}`
                    : "Amounts not bound"
              }
              status={inst.secured == null ? null : inst.secured ? "SECURED" : "UNSECURED"}
              statusTone={inst.secured ? "navy" : "idle"}
              secondary={[inst.coupon, inst.maturity ? `Matures ${inst.maturity}` : null, inst.guarantors]
                .filter(Boolean)
                .join(" · ")}
              drilldown={inst.drilldown}
              defaultOpen={openMetric === inst.metricId}
            />
          ))
        )}
        {agg.totalDebt == null ? (
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/onboarding/financials`}>
              Supply financial inputs
            </Link>
          </div>
        ) : null}
      </Card>

      {/* 2. Ratios */}
      <Card>
        <div className="card-title">2. Financial covenant ratios</div>
        <div className="card-subtitle">
          Generic ratios compute from snapshot inputs when present; contractual thresholds come from AI-surfaced
          provisions. Map GAAP inputs to contract definitions before treating figures as covenant tests.
        </div>
        {d.ratios.map((r) => (
          <MetricRow
            key={r.metricId}
            label={r.name}
            value={r.currentValue ?? "NOT DETERMINABLE"}
            status={r.status}
            statusTone={toneFor(r.status)}
            secondary={[
              r.threshold ? `Threshold: ${r.threshold}` : null,
              r.cushion ? `Cushion: ${r.cushion}` : null,
              r.testingDate ? `As of ${r.testingDate}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            drilldown={r.drilldown}
            defaultOpen={openMetric === r.metricId}
          />
        ))}
      </Card>

      {/* 3. Baskets */}
      <Card>
        <div className="card-title">3. Covenant basket capacity</div>
        <div className="card-subtitle">
          Debt, lien, RP, investment, incremental, asset-sale and builder language from the package. Remaining
          availability is shown only when supported — never invented.
        </div>
        {d.baskets.length === 0 ? (
          <div className="row-note">No basket/threshold language surfaced yet.</div>
        ) : (
          d.baskets.map((b) => (
            <MetricRow
              key={b.metricId}
              label={`§${b.sectionRef} — ${b.heading}`}
              value={b.contractualCapacity}
              status={b.reviewDecision ?? b.status}
              statusTone={b.reviewDecision ? "pass" : toneFor(b.status)}
              secondary={[b.category, b.utilization ? `Utilization: ${b.utilization}` : "Utilization: not attributed", b.remaining ? `Remaining: ${b.remaining}` : "Remaining: NOT DETERMINABLE"]
                .filter(Boolean)
                .join(" · ")}
              drilldown={b.drilldown}
              defaultOpen={openMetric === b.metricId}
            />
          ))
        )}
      </Card>

      {/* 4. Monitoring */}
      <Card>
        <div className="card-title">4. Compliance monitoring</div>
        <div className="card-subtitle">
          Maintenance readiness, financials, amendments, maturities and analysis gaps — only when backed by persisted
          workspace state.
        </div>
        {d.monitoring.length === 0 ? (
          <div className="row-note">No monitoring alerts from current workspace state.</div>
        ) : (
          d.monitoring.map((a) => (
            <MetricRow
              key={a.metricId}
              label={a.title}
              value={a.kind}
              status={a.severity}
              statusTone={a.severity === "HIGH" ? "tight" : "idle"}
              secondary={a.detail}
              drilldown={a.drilldown}
              defaultOpen={openMetric === a.metricId}
            />
          ))
        )}
      </Card>

      {/* 5. Pro forma transaction effects */}
      <Card>
        <div className="card-title">5. Pro forma transaction effects</div>
        <div className="card-subtitle">
          Computed from financial snapshot and counsel-compiled baskets when available. Never invents remaining capacity.
        </div>
        {(d.proForma ?? []).length === 0 ? (
          <div className="row-note">Enter financials and accept/compile a debt basket to populate pro forma effects.</div>
        ) : (
          (d.proForma ?? []).map((p) => (
            <div key={p.metricId} style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <MetricRow
                label={p.scenario}
                value={p.proFormaTotalLeverage ?? p.status}
                status={p.status}
                statusTone={toneFor(p.status)}
                secondary={`PF secured lev ${p.proFormaSecuredLeverage ?? "—"} · basket after ${p.basketRemainingAfter ?? "—"} · engine ${p.engineCapacityRemaining ?? "—"}`}
                drilldown={p.drilldown}
                defaultOpen={openMetric === p.metricId}
              />
              {p.notes.slice(0, 4).map((n, i) => (
                <div key={i} className="row-note">
                  • {n}
                </div>
              ))}
            </div>
          ))
        )}
      </Card>

      {/* 6. Multi-path contractual pathways */}
      <Card>
        <div className="card-title">6. Multi-path transaction analysis</div>
        <div className="card-subtitle">
          Enumerates alternative contractual pathways. Stacking across debt/lien baskets is not assumed unless the
          agreement expressly shares capacity. Authority: LEGACY_ENGINE_MULTIPATH · NOT_CERTIFIED_4E (not Phase 4E).
        </div>
        {(d.multiPath ?? []).length === 0 ? (
          <div className="row-note">Analyze a financing package to enumerate pathways.</div>
        ) : (
          (d.multiPath ?? []).map((mp) => (
            <div key={mp.transaction.label} style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <div className="row-label">{mp.transaction.label}</div>
              <div className="row-note">{mp.narrative}</div>
              <div className="row-note" style={{ marginTop: 6 }}>
                Pathways: {mp.paths.length} · sufficient single: {mp.sufficientSinglePaths.length} · partial:{" "}
                {mp.partialPaths.length}
              </div>
              {mp.paths.slice(0, 8).map((p) => (
                <div key={p.pathId} className="row-note" style={{ marginTop: 4 }}>
                  • [{p.status}] §{p.sectionRef} {p.family}
                  {p.capacityMillions != null ? ` · $${p.capacityMillions}M` : ""}
                  {p.reviewDecision ? ` · counsel ${p.reviewDecision}` : " · AI-proposed"}
                  {p.formulaHint ? ` — ${p.formulaHint.slice(0, 120)}` : ""}
                </div>
              ))}
              <div className="row-note" style={{ marginTop: 6 }}>
                {mp.combination.note}
              </div>
            </div>
          ))
        )}
      </Card>

      {/* 7. Transactions */}
      <Card>
        <div className="card-title">7. Transaction intelligence</div>
        <div className="card-subtitle">
          Proposed exercises mapped to AI-matched provisions. Run Ask for reasoned analysis; Simulate when the engine
          path is ready. Pro forma ratios stay conditional without executable rules and inputs.
        </div>
        {d.transactions.map((t) => (
          <div key={t.metricId} style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}>
            <MetricRow
              label={t.scenario}
              value={t.status}
              status={t.status}
              statusTone={toneFor(t.status)}
              secondary={t.summary}
              drilldown={t.drilldown}
              defaultOpen={openMetric === t.metricId}
            />
            <div className="button-row" style={{ marginTop: 8, gap: 8 }}>
              <Link className="button button-primary" href={t.askHref}>
                Ask this scenario
              </Link>
              <Link className="button" href={t.simulateHref}>
                Open simulate
              </Link>
            </div>
          </div>
        ))}
      </Card>

      <div className="row-note">{d.note}</div>
    </div>
  );
}
