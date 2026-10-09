import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { answerFromCorpus } from "@/lib/product/covenant-intelligence/ask-retrieve";
import { ResearchAskForm } from "@/components/ask/ResearchAskForm";

export const metadata = { title: "Headroom — Ask the corpus" };

export default async function ResearchAskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sourceId?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const sourceId = sp.sourceId?.trim();
  const answer = q
    ? await answerFromCorpus({ question: q, sourceId, researchOnly: true, limit: 8 })
    : null;

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">Ask the research corpus</div>
        <div className="card-subtitle">
          Source-backed covenant analysis over public financing precedents. Precedents are not governing authority for
          any customer agreement. Headroom will not invent permissions or capacity figures.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/research/corpus">
            Corpus
          </Link>
          <Link className="button" href="/research/compare">
            Compare
          </Link>
        </div>
      </Card>

      <Card>
        <ResearchAskForm defaultQuestion={q} defaultSourceId={sourceId} />
        <div className="row-note" style={{ marginTop: 8 }}>
          Try: secured debt · restricted payment baskets · unrestricted subsidiary investments · incremental facility
          conditions · asset sales · debt secured under another provision · financial inputs for capacity
        </div>
      </Card>

      {answer && (
        <Card>
          <div className="card-title">{answer.headline}</div>
          <div className="row" style={{ marginBottom: 8 }}>
            <Chip tone={answer.kind === "answered" ? "navy" : "tight"}>{answer.kind}</Chip>{" "}
            <Chip tone="idle">promotedToLegalTruth=0</Chip>
          </div>
          <div className="row-note" style={{ whiteSpace: "pre-wrap" }}>
            {answer.detail}
          </div>
          {(answer.restrictions?.length ?? 0) > 0 && (
            <>
              <div className="row-label" style={{ marginTop: 12 }}>
                Restrictions
              </div>
              {answer.restrictions!.map((r, i) => (
                <div key={i} className="row-note">
                  • {r}
                </div>
              ))}
            </>
          )}
          {(answer.permissions?.length ?? 0) > 0 && (
            <>
              <div className="row-label" style={{ marginTop: 12 }}>
                Permissions / baskets (not capacity)
              </div>
              {answer.permissions!.map((p, i) => (
                <div key={i} className="row-note">
                  • {p}
                </div>
              ))}
            </>
          )}
          {(answer.unresolved?.length ?? 0) > 0 && (
            <>
              <div className="row-label" style={{ marginTop: 12 }}>
                Unresolved
              </div>
              {answer.unresolved!.map((u, i) => (
                <div key={i} className="row-note">
                  • {u}
                </div>
              ))}
            </>
          )}
          {answer.citations.length > 0 && (
            <>
              <div className="row-label" style={{ marginTop: 12 }}>
                Citations
              </div>
              {answer.citations.map((c, i) => (
                <div key={`${c.sourceId}-${c.sectionRef}-${i}`} className="row-note" style={{ marginTop: 6 }}>
                  <strong>
                    {c.governingAgreement} — §{c.sectionRef}
                    {c.posture ? ` [${c.posture}]` : ""}
                  </strong>
                  <div>“{c.excerpt}”</div>
                  <div style={{ opacity: 0.8 }}>
                    [{c.sourceId}] · {c.epistemicStatus}
                  </div>
                </div>
              ))}
            </>
          )}
          {answer.limitations.length > 0 && (
            <div className="row-note" style={{ marginTop: 12 }}>
              Limitations: {answer.limitations.join(" · ")}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
