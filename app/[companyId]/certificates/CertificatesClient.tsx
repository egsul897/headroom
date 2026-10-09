"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveCertificateAction,
  appendHistoricalUsageAction,
  seedSyntheticCertificateAction,
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
  const [usageAmount, setUsageAmount] = useState("10000000");
  const [usageRule, setUsageRule] = useState("rule-general-investments-basket");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await seedSyntheticCertificateAction(companyId);
              setMessage(r.ok ? `${r.label} · ${r.snapshotId} (${r.status})` : `Failed: ${(r.issues ?? []).join("; ")}`);
              router.refresh();
            })
          }
        >
          Seed synthetic certificate (DRAFT)
        </button>
      </div>
      <div className="row-note">
        Synthetic fixtures are for engineering until an authentic completed customer certificate is available. They are
        never auto-approved. Facts go to the North-Star store — never legacy FinancialSnapshot.
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
                Proposing a restatement immediately SUPERSEDES this APPROVED snapshot (fail-closed). Capacity stays
                withheld until the restatement DRAFT is attributable-approved.
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
                      {f.note ? ` · ${f.note.slice(0, 120)}` : ""}
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
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const usageId = `manual-${companyId}-${Date.now()}`;
                const r = await appendHistoricalUsageAction(companyId, {
                  usageId,
                  amount: usageAmount,
                  currency: "USD",
                  ruleId: usageRule,
                  effectiveAsOf: "2026-05-01",
                  instrumentKey: "synthetic-term-loan-a",
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
