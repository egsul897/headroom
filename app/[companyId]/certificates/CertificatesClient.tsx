"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveCertificateAction,
  appendHistoricalUsageAction,
  seedSyntheticCertificateAction,
} from "./actions";

export function CertificatesClient({
  companyId,
  snapshots,
}: {
  companyId: string;
  snapshots: Array<{
    snapshotId: string;
    status: string;
    reportingPeriod: string | null;
    asOf: string | null;
    approvalRef: string | null;
    factCount: number;
  }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reviewedBy, setReviewedBy] = useState("workspace-counsel");
  const [usageAmount, setUsageAmount] = useState("10000000");
  const [usageRule, setUsageRule] = useState("rule-general-investments-basket");

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
        never auto-approved.
      </div>

      {snapshots.map((s) => (
        <div key={s.snapshotId} className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div>
            <div className="row-label">{s.snapshotId}</div>
            <div className="row-note">
              status={s.status} · period={s.reportingPeriod ?? "—"} · asOf={s.asOf ?? "—"} · facts={s.factCount}
              {s.approvalRef ? ` · ${s.approvalRef}` : ""}
            </div>
          </div>
          {s.status !== "APPROVED" && (
            <div className="button-row" style={{ alignItems: "center", gap: 8 }}>
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
            </div>
          )}
        </div>
      ))}

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
                const usageId = `usage-${companyId}-${Date.now()}`;
                const r = await appendHistoricalUsageAction(companyId, {
                  usageId,
                  amount: usageAmount,
                  currency: "USD",
                  ruleId: usageRule,
                  effectiveAsOf: new Date().toISOString().slice(0, 10),
                  instrumentKey: "company",
                });
                setMessage(r.ok ? `Recorded ${usageId}` : `Usage failed: ${(r.issues ?? []).join("; ")}`);
                router.refresh();
              })
            }
          >
            Record usage
          </button>
        </div>
      </div>

      {message && <div className="row-note">{message}</div>}
    </div>
  );
}
