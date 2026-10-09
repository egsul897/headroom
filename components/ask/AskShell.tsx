"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskShellResult } from "@/lib/ask/shell-runner";

/**
 * Ask page — submits questions to a server action for corpus retrieval.
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
          <h1 className="home-greeting">Ask</h1>
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
          Question
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          disabled={pending}
        />
        <button type="submit" className="button" disabled={pending || !question.trim()}>
          {pending ? "Retrieving…" : "Submit question"}
        </button>
        <p className="home-detail" style={{ marginTop: 8 }}>
          Or use the{" "}
          <Link href="/research/ask">research corpus Ask</Link> for issuer-disjoint precedents.
        </p>
      </form>
    </div>
  );
}
