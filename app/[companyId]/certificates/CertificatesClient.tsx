"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveCertificateAction,
  appendHistoricalUsageAction,
  proposeUploadedCertificateTextAction,
  restateCertificateAction,
} from "./actions";

export type CertificateFactView = {
  factId: string;
  key: string;
  valueType: string | null;
  currency: string | null;
  displayName: string | null;
  note: string | null;
  locator: Record<string, unknown> | undefined;
};

export function CertificatesClient({
  companyId,
  snapshots,
  factsBySnapshot,
}: {
  companyId: string;
  snapshots: Array<{
    snapshotId: string;
    status: string;
    reportingPeriod: string | null;
    asOf: string | null;
    approvalRef: string | null;
    factCount: number;
    supersedesSnapshotId: string | null;
  }>;
  factsBySnapshot: Record<string, CertificateFactView[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState("workspace-counsel");
  const [usageAmount, setUsageAmount] = useState("");
  const [usageRule, setUsageRule] = useState("");
  // Rule 106: instrument key + effective date were hardcoded
  // ("synthetic-term-loan-a" / 2026-05-01) — invented ledger
  // data. They are now required inputs with no default.
  const [usageInstrumentKey, setUsageInstrumentKey] = useState("");
  const [usageEffectiveAsOf, setUsageEffectiveAsOf] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certificateText, setCertificateText] = useState("");
  const [statementText, setStatementText] = useState("");

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-note">
        FCE proposals extract from certificate text into NS-4 as DRAFT / REVIEW_REQUIRED only. Never auto-approved.
        Attributable Approve is required before Dashboard IR leverage uses the snapshot.
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="card-title">Upload / paste certificate evidence</div>
        <textarea
          className="input"
          rows={6}
          value={certificateText}
          onChange={(e) => setCertificateText(e.target.value)}
          placeholder="Paste compliance certificate text (required)"
          style={{ width: "100%", fontFamily: "inherit" }}
        />
        <textarea
          className="input"
          rows={4}
          value={statementText}
          onChange={(e) => setStatementText(e.target.value)}
          placeholder="Optional financial statement text for reconciliation"
          style={{ width: "100%", fontFamily: "inherit" }}
        />
        <button
          type="button"
          className="button button-primary"
          disabled={pending || !certificateText.trim()}
          onClick={() =>
            start(async () => {
              const r = await proposeUploadedCertificateTextAction(companyId, {
                certificateText,
                statementText: statementText.trim() || undefined,
              });
              setMessage(
                r.ok
                  ? `${r.label} · ${r.snapshotId} (${r.status}) · facts ${r.factKeys.join(", ")}`
                  : `Failed: ${r.issues.join("; ")}`,
              );
              router.refresh();
            })
          }
        >
          Propose from pasted text (FCE → DRAFT)
        </button>
      </div>

      {snapshots.map((s) => {
        const facts = factsBySnapshot[s.snapshotId] ?? [];
        const open = expanded === s.snapshotId;
        return (
          <div key={s.snapshotId} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div>
              <div className="row-label">{s.snapshotId}</div>
              <div className="row-note">
                status={s.status} · period={s.reportingPeriod ?? "—"} · asOf={s.asOf ?? "—"} · facts={s.factCount}
                {s.approvalRef ? ` · ${s.approvalRef}` : ""}
                {s.supersedesSnapshotId ? ` · supersedes ${s.supersedesSnapshotId}` : ""}
              </div>
            </div>
            <div className="button-row" style={{ alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="button" onClick={() => setExpanded(open ? null : s.snapshotId)}>
                {open ? "Hide facts" : "Inspect facts / locators"}
              </button>
              {s.status !== "APPROVED" && (
                <>
                  <input
                    className="input"
                    value={reviewedBy}
                    onChange={(e) => setReviewedBy(e.target.value)}
                    placeholder="Reviewed by"
                    style={{ maxWidth: 220 }}
                  />
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await approveCertificateAction(
                          companyId,
                          s.snapshotId,
                          reviewedBy,
                          `apr-${s.snapshotId}`,
                        );
                        setMessage(r.ok ? `APPROVED ${r.snapshotId}` : `Approve failed: ${(r.issues ?? []).join("; ")}`);
                        router.refresh();
                      })
                    }
                  >
                    Approve (attributable)
                  </button>
                </>
              )}
              {s.status === "APPROVED" && (
                <button
                  type="button"
                  className="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await restateCertificateAction(companyId, s.snapshotId);
                      setMessage(r.ok ? r.label : `Restatement failed: ${(r.issues ?? []).join("; ")}`);
                      router.refresh();
                    })
                  }
                >
                  Propose restatement (supersede)
                </button>
              )}
            </div>
            {s.status === "APPROVED" && (
              <div className="row-note">
                Propose a restatement DRAFT that names this snapshot via supersedesSnapshotId. Authoritative APPROVED
                reporting stays live until that DRAFT is attributable-approved; only then is this row SUPERSEDED
                (append-only history preserved).
              </div>
            )}

            {open && (
              <div className="stack" style={{ gap: 6, padding: 8, border: "1px solid var(--line, #ddd)" }}>
                {facts.length === 0 ? (
                  <div className="muted">No materialized facts for this snapshot.</div>
                ) : (
                  facts.map((f) => (
                    <div key={f.factId} className="row-note">
                      <strong>{f.displayName ?? f.key}</strong> · {f.valueType ?? "—"}
                      {f.currency ? ` ${f.currency}` : ""}
                      {f.locator
                        ? ` · loc p${String(f.locator.page ?? "—")}/${String(f.locator.section ?? "—")}/${String(f.locator.table ?? "—")}/${String(f.locator.row ?? "—")}`
                        : " · locator stub"}
                      {f.note ? ` · ${f.note.slice(0, 120)}${f.note.length > 120 ? "…" : ""}` : ""}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        <div className="card-title">Historical basket usage (contract ledger)</div>
        <div className="row-note">Append-only Phase 4C usage — never hard-deletes history.</div>
        <div className="button-row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            className="input"
            value={usageAmount}
            onChange={(e) => setUsageAmount(e.target.value)}
            placeholder="Amount"
            style={{ maxWidth: 160 }}
          />
          <input
            className="input"
            value={usageRule}
            onChange={(e) => setUsageRule(e.target.value)}
            placeholder="Rule id"
            style={{ maxWidth: 280 }}
          />
          <input
            className="input"
            value={usageInstrumentKey}
            onChange={(e) => setUsageInstrumentKey(e.target.value)}
            placeholder="Instrument key (e.g. term-loan-b)"
            style={{ maxWidth: 280 }}
          />
          <input
            className="input"
            type="date"
            value={usageEffectiveAsOf}
            onChange={(e) => setUsageEffectiveAsOf(e.target.value)}
            style={{ maxWidth: 180 }}
          />
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!usageAmount || !usageRule || !usageInstrumentKey || !usageEffectiveAsOf) {
                  setMessage("Enter amount, rule id, instrument key, and effective date — none are defaulted.");
                  return;
                }
                const usageId = `manual-${companyId}-${Date.now()}`;
                const r = await appendHistoricalUsageAction(companyId, {
                  usageId,
                  amount: usageAmount,
                  currency: "USD",
                  ruleId: usageRule,
                  effectiveAsOf: usageEffectiveAsOf,
                  instrumentKey: usageInstrumentKey,
                });
                setMessage(r.ok ? `Appended ${usageId}` : `Append failed: ${(r.issues ?? []).join("; ")}`);
                router.refresh();
              })
            }
          >
            Append usage
          </button>
        </div>
      </div>

      {message && <div className="row-note">{message}</div>}
    </div>
  );
}
