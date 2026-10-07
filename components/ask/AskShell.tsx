"use client";

import { useState } from "react";
import Link from "next/link";
import type { AskShellResult } from "@/lib/ask/shell-runner";
import { refuseAsk } from "@/lib/ask/shell-runner";

/**
 * Ask interrogation shell. The initial state is the unrunnable empty case.
 * Submitting a question refuses without inventing an answer.
 */
export function AskShell({ companyId, initial }: { companyId: string; initial: AskShellResult }) {
  const [question, setQuestion] = useState("");
  const [refusal, setRefusal] = useState<AskShellResult | null>(null);

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Ask</h1>
          <p className="home-greeting-sub">Interrogation for this company. Secondary to the overview.</p>
        </div>
        <Link className="home-export home-export-link" href={`/${companyId}`}>
          Back to overview
        </Link>
      </header>

      <section className="home-card ask-card" data-ask-case={initial.caseId}>
        <h2 className="home-headline">{initial.headline}</h2>
        <p className="home-detail">{initial.detail}</p>
      </section>

      <form
        className="home-card ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          setRefusal(refuseAsk({ companyId, question }));
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
        />
        <p className="home-detail">Submitting a question does not run Ask.</p>
        <button type="submit" className="button">
          Submit question
        </button>
      </form>

      {refusal ? (
        <section className="home-card ask-card" data-ask-case={refusal.caseId}>
          <h2 className="home-headline">{refusal.headline}</h2>
          <p className="home-detail">{refusal.detail}</p>
        </section>
      ) : null}
    </div>
  );
}
