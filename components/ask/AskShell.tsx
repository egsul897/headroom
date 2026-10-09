"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskShellResult } from "@/lib/ask/shell-runner";

/**
 * Ask page — submits questions to a server action for workspace-isolated retrieval.
 */
export function AskShell({
  companyId,
  initial,
}: {
  companyId: string;
  initial: AskShellResult;
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskShellResult>(initial);
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
      </section>

      <form
        className="home-card ask-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            const res = await fetch("/api/ask", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ companyId, question }),
            });
            const data = (await res.json()) as AskShellResult;
            setResult(data);
          } catch {
            setResult({
              kind: "refused",
              caseId: "REFUSE_NOT_INVENT",
              headline: "Ask failed",
              detail: "The retrieval request failed. No invented answer was produced.",
            });
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="home-eyebrow" htmlFor="ask-question">
          Question about this workspace’s financing documents
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          disabled={pending}
          placeholder='e.g. Can the borrower incur an additional $100 million of secured debt?'
        />
        <button type="submit" className="button" disabled={pending || !question.trim()}>
          {pending ? "Retrieving…" : "Submit question"}
        </button>
        <p className="home-detail" style={{ marginTop: 8 }}>
          Answers cite uploaded package text only.{" "}
          <Link href={`/${companyId}/documents`}>Documents</Link>
          {" · "}
          <Link href="/research/ask">Research corpus Ask</Link> for issuer-disjoint precedents
          (never governing for this deal).
        </p>
      </form>
    </div>
  );
}
