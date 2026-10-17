"use client";

import { useState } from "react";

const THREADS = [
  { id: "refusal", title: "Ask isn’t available on this deal yet" },
  { id: "sample", title: "Which clause limits secured debt?" },
];

const PASSAGE = {
  agreement: "Sample credit agreement",
  section: "Section 6.04",
  page: "Illustrative page 84",
  excerpt:
    "The Company may incur secured debt only to the extent the sample leverage test permits. This passage is sample text for the layout. It is not a capacity conclusion.",
};

/** SAMPLE DATA layout. The refusal thread stays in the history. The passage is labeled sample. */
export function SampleAsk() {
  const [thread, setThread] = useState("sample");
  const [question, setQuestion] = useState("");
  const refusal = thread === "refusal";

  return (
    <div className="ask-harvey">
      <aside className="ask-threads">
        <p className="home-eyebrow">Threads</p>
        <ul>
          {THREADS.map((item) => (
            <li key={item.id}>
              <button type="button" className={item.id === thread ? "is-active" : ""} onClick={() => setThread(item.id)}>
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="ask-stage">
        <header className="ask-intro">
          <h1>Ask Headroom</h1>
          <p>Sample layout. A refusal stays visible. This illustration does not answer a deal.</p>
        </header>
        <section className={`ask-document ${refusal ? "is-refusal" : ""}`}>
          <h2 className="home-headline">{refusal ? "Ask isn’t available on this deal yet" : "Sample answer, not a deal conclusion"}</h2>
          <p className="ask-prose">
            {refusal
              ? "Ask did not run. No answer, path, or figure is available."
              : "The sample agreement points at one secured-debt clause. Headroom is not treating this illustration as permission."}
            {refusal ? null : (
              <button type="button" className="cite-mark">
                1
              </button>
            )}
          </p>
          {refusal ? <p className="home-detail">Unknown stays on the page. Nothing was invented to fill it.</p> : null}
        </section>
        <form className="ask-composer" onSubmit={(event) => event.preventDefault()}>
          <label className="home-eyebrow" htmlFor="sample-ask">
            Question
          </label>
          <textarea id="sample-ask" value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} placeholder="Ask about a clause" />
          <button type="submit" className="button" disabled={!question.trim()}>
            Analyze transaction
          </button>
        </form>
        <div className="ask-suggestions">
          {["Can we incur secured debt, and which clause limits it?", "What is still unknown on this sample?"].map((query) => (
            <button key={query} type="button" onClick={() => setQuestion(query)}>
              {query}
            </button>
          ))}
        </div>
      </div>
      <aside className="ask-source">
        <p className="home-eyebrow">Source</p>
        {refusal ? (
          <p className="ask-passage">No cited passage yet. A refusal does not invent a source.</p>
        ) : (
          <>
            <h2>{PASSAGE.agreement}</h2>
            <p className="ask-clause">
              {PASSAGE.section} · {PASSAGE.page}
            </p>
            <p className="ask-passage">“{PASSAGE.excerpt}”</p>
            <p className="ebitda-caption">Sample text. Page label is illustrative.</p>
          </>
        )}
      </aside>
    </div>
  );
}
