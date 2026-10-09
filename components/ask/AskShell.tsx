"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskShellResult } from "@/lib/ask/shell-runner";

type AskMode = "corpus" | "transaction";

/**
 * Ask page — corpus retrieval (/api/ask) or structured transaction analysis (/api/ask/transaction).
 */
export function AskShell({
  companyId,
  initial,
}: {
  companyId: string;
  initial: AskShellResult;
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<AskMode>("transaction");
  const [result, setResult] = useState<AskShellResult>(initial);
  const [txnJson, setTxnJson] = useState<string | null>(null);
  const [simulateHref, setSimulateHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Ask Headroom</h1>
        </div>
        <Link className="home-export home-export-link" href={`/${companyId}`}>
          Back to overview
        </Link>
      </header>

      <section className="home-card ask-card" data-ask-case={result.caseId}>
        <h2 className="home-headline">{result.headline}</h2>
        <p className="home-detail" style={{ whiteSpace: "pre-wrap" }}>
          {result.detail}
        </p>
        {result.restrictions && result.restrictions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="home-eyebrow">Restrictions</p>
            <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
              {result.restrictions.map((r, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.permissions && result.permissions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p className="home-eyebrow">Permissions / baskets (not capacity)</p>
            <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
              {result.permissions.map((p, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.unresolved && result.unresolved.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p className="home-eyebrow">Unresolved</p>
            <ul style={{ paddingLeft: 18, margin: "4px 0" }}>
              {result.unresolved.map((u, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  {u}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.citations && result.citations.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="home-eyebrow">Citations</p>
            <ul style={{ paddingLeft: 18, margin: "8px 0" }}>
              {result.citations.map((c, i) => (
                <li key={`${c.sourceId}-${c.sectionRef}-${i}`} style={{ marginBottom: 8 }}>
                  <strong>
                    {c.governingAgreement} — {c.sectionRef}
                    {c.posture ? ` [${c.posture}]` : ""}
                  </strong>
                  <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>
                    “{c.excerpt}”
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    [{c.sourceId}] · {c.epistemicStatus}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.limitations && result.limitations.length > 0 && (
          <p className="home-detail">Limitations: {result.limitations.join(" · ")}</p>
        )}
        {result.transactionWorkflow && (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <p className="home-detail">
              Cutoff: {result.transactionWorkflow.cutoffState ?? "—"}
              {result.transactionWorkflow.reportingPeriodKey
                ? ` · ${result.transactionWorkflow.reportingPeriodKey}`
                : ""}
              {result.transactionWorkflow.approvedSnapshotId
                ? ` · snapshot ${result.transactionWorkflow.approvedSnapshotId}`
                : ""}
            </p>
            <div className="button-row">
              {result.transactionWorkflow.nextActions.slice(0, 4).map((a) => (
                <Link key={a.href} className="button" href={a.href}>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        {simulateHref && (
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={simulateHref}>
              Open in Simulate (same LEGACY_ENGINE)
            </Link>
          </div>
        )}
      </section>

      {txnJson && (
        <section className="home-card" style={{ marginTop: 12 }}>
          <h2 className="home-headline">Transaction analysis (structured)</h2>
          <p className="home-detail" style={{ marginBottom: 8 }}>
            LEGACY_ENGINE figures use the same covenant-engine as Simulate. Certified path remains separately gated.
            Hypothetical results never post to the ledger.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, overflow: "auto" }}>{txnJson}</pre>
        </section>
      )}

      <form
        className="home-card ask-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setTxnJson(null);
          setSimulateHref(null);
          try {
            if (mode === "transaction") {
              const res = await fetch("/api/ask/transaction", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ companyId, question, confirmed: true }),
              });
              const data = (await res.json()) as {
                answer?: { kind: string; headline: string; detail: string; limitations?: string[] };
                draft?: { missingConfirmations?: string[] };
                authoritative?: { status: string; authority: string; missingInputs?: string[] };
                pathEnumeration?: { authority: string; note: string };
                simulateHref?: string | null;
                verifiedSummary?: { executable?: boolean; blockers?: string[] };
                executableOutcomes?: {
                  verifiedExecutable?: boolean;
                  verifiedBlockers?: string[];
                  legacyOverallStatus?: string | null;
                  completeness?: { verdict?: string; summary?: string } | null;
                };
                error?: string;
              };
              if (data.error) {
                setResult({
                  kind: "refused",
                  caseId: "REFUSE_NOT_INVENT",
                  headline: "Transaction analysis refused",
                  detail: data.error,
                });
              } else {
                setTxnJson(JSON.stringify(data, null, 2));
                setSimulateHref(data.simulateHref ?? null);
                const verifiedBlockers = data.executableOutcomes?.verifiedBlockers ?? data.verifiedSummary?.blockers ?? [];
                const completenessLine = data.executableOutcomes?.completeness
                  ? `Completeness: ${data.executableOutcomes.completeness.verdict ?? "—"} — ${data.executableOutcomes.completeness.summary ?? ""}`
                  : null;
                setResult({
                  kind:
                    data.answer?.kind === "certified"
                      ? "answered"
                      : data.answer?.kind === "needs_confirmation" || data.answer?.kind === "insufficient_evidence"
                        ? "insufficient_evidence"
                        : "answered",
                  caseId: "TRANSACTION_READINESS",
                  headline: data.answer?.headline ?? "Transaction analysis",
                  detail: [
                    data.answer?.detail ?? "",
                    data.executableOutcomes?.verifiedExecutable
                      ? "Verified path: EXECUTABLE (REQUIRE)."
                      : verifiedBlockers.length > 0
                        ? `Verified path refused: ${verifiedBlockers.join(", ")}`
                        : null,
                    completenessLine,
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                  limitations: data.answer?.limitations,
                  unresolved: [
                    ...(data.draft?.missingConfirmations ?? []),
                    ...(data.authoritative?.missingInputs ?? []),
                    ...(!data.executableOutcomes?.verifiedExecutable ? verifiedBlockers : []),
                  ],
                });
              }
            } else {
              const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ companyId, question }),
              });
              const data = (await res.json()) as AskShellResult;
              setResult(data);
            }
          } catch {
            setResult({
              kind: "refused",
              caseId: "REFUSE_NOT_INVENT",
              headline: "Ask failed",
              detail: "The request failed. No invented answer was produced.",
            });
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="home-eyebrow" htmlFor="ask-mode">
          Mode
        </label>
        <select
          id="ask-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as AskMode)}
          disabled={pending}
          className="input"
          style={{ maxWidth: 280, marginBottom: 8 }}
        >
          <option value="transaction">Transaction analysis (North Star gated)</option>
          <option value="corpus">Corpus research (citations only)</option>
        </select>
        <label className="home-eyebrow" htmlFor="ask-question">
          Question about this workspace’s financing documents
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          disabled={pending}
          placeholder='e.g. Can we incur $100 million of secured debt on 2026-08-01?'
        />
        <button type="submit" className="button" disabled={pending || !question.trim()}>
          {pending ? "Working…" : mode === "transaction" ? "Analyze transaction" : "Submit question"}
        </button>
        <p className="home-detail" style={{ marginTop: 8 }}>
          Transaction mode uses APPROVED NS-4 snapshots, cutoff resolution, and attributed ledger — never invents
          capacity. Certified 4E enumeration requires a VerifiedExecutionPackage.{" "}
          <Link href={`/${companyId}/certificates`}>Certificates</Link>
          {" · "}
          <Link href={`/${companyId}/documents`}>Documents</Link>
          {" · "}
          <Link href="/research/ask">Research corpus Ask</Link>
        </p>
      </form>
    </div>
  );
}
