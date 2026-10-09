"use client";

export function ResearchAskForm({
  defaultQuestion = "",
  defaultSourceId,
}: {
  defaultQuestion?: string;
  defaultSourceId?: string;
}) {
  return (
    <form method="get" action="/research/ask" className="stack" style={{ gap: 8 }}>
      {defaultSourceId ? (
        <input type="hidden" name="sourceId" value={defaultSourceId} />
      ) : null}
      <label className="home-eyebrow" htmlFor="research-ask-q">
        Question
      </label>
      <textarea
        id="research-ask-q"
        name="q"
        defaultValue={defaultQuestion}
        rows={4}
        placeholder="e.g. What restrictions apply to restricted payments?"
        style={{ width: "100%", padding: 10, border: "1px solid var(--border, #ccc)" }}
      />
      <button className="button button-primary" type="submit">
        Retrieve cited answer
      </button>
    </form>
  );
}
