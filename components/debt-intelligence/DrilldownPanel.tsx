"use client";

import Link from "next/link";
import { Chip } from "@/components/ui";
import type { DashboardDrilldown } from "@/lib/product/customer-intelligence/debt-intelligence";

export function DrilldownPanel({ d }: { d: DashboardDrilldown }) {
  return (
    <div
      id={d.metricId}
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 6,
        background: "var(--surface-2, #fafafa)",
      }}
    >
      <div className="row">
        <div className="row-label">{d.title}</div>
        <div className="row-value">
          <Chip tone="navy">{d.module}</Chip>
        </div>
      </div>
      {d.governingAgreement ? <div className="row-note">Governing agreement: {d.governingAgreement}</div> : null}
      {d.sectionCitation ? <div className="row-note">Citation: {d.sectionCitation}</div> : null}
      {d.contractualFormula ? <div className="row-note">Formula / capacity language: {d.contractualFormula}</div> : null}
      {d.aiInterpretation ? (
        <div className="row-note" style={{ marginTop: 6 }}>
          AI interpretation: {d.aiInterpretation}
        </div>
      ) : null}
      {d.alternatives.slice(0, 3).map((a, i) => (
        <div key={`alt${i}`} className="row-note">
          Alternative: {a}
        </div>
      ))}
      {d.assumptions.slice(0, 3).map((a, i) => (
        <div key={`as${i}`} className="row-note">
          Assumption: {a}
        </div>
      ))}
      {d.definitions.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <div className="row-note">Definitions</div>
          {d.definitions.map((def, i) => (
            <div key={i} className="row-note">
              · {def.term}
              {def.excerpt ? ` — “${def.excerpt}”` : ""}
            </div>
          ))}
        </div>
      ) : null}
      {d.financialInputs.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <div className="row-note">Financial inputs</div>
          {d.financialInputs.map((inp, i) => (
            <div key={i} className="row-note">
              · {inp.label}: {inp.value ?? (inp.required ? "REQUIRED — not supplied" : "—")}
            </div>
          ))}
        </div>
      ) : null}
      {d.conditions.slice(0, 4).map((c, i) => (
        <div key={`c${i}`} className="row-note">
          Condition: {c}
        </div>
      ))}
      {d.exceptions.slice(0, 4).map((c, i) => (
        <div key={`e${i}`} className="row-note">
          Exception: {c}
        </div>
      ))}
      {d.relatedCovenants.slice(0, 4).map((c, i) => (
        <div key={`r${i}`} className="row-note">
          Related: {c}
        </div>
      ))}
      {d.historicalUtilization.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <div className="row-note">Historical utilization (ledger)</div>
          {d.historicalUtilization.slice(0, 6).map((u, i) => (
            <div key={i} className="row-note">
              · {u.date} · {u.basket} · {u.amount} — {u.description}
            </div>
          ))}
        </div>
      ) : null}
      {d.reviewerCorrections.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <div className="row-note">Reviewer corrections</div>
          {d.reviewerCorrections.map((r, i) => (
            <div key={i} className="row-note">
              · {r.decision} {r.at}
              {r.note ? ` — ${r.note}` : ""}
              {r.plainEnglish ? ` — “${r.plainEnglish.slice(0, 160)}”` : ""}
            </div>
          ))}
        </div>
      ) : null}
      {d.calculationHistory.map((h, i) => (
        <div key={`h${i}`} className="row-note">
          Calc: {h}
        </div>
      ))}
      {d.missingInputs.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          <Chip tone="tight">Missing inputs</Chip>
          {d.missingInputs.map((m, i) => (
            <div key={i} className="row-note">
              · {m}
            </div>
          ))}
        </div>
      ) : null}
      <div className="button-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        {d.hrefs.map((h) => (
          <Link key={h.href} className="button" href={h.href}>
            {h.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
