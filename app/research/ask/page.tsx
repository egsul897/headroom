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
          Answers are retrieved contractual excerpts with citations. Headroom will not invent
          permissions or capacity figures.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/research/corpus">
            Corpus
          </Link>
        </div>
      </Card>

      <Card>
        <ResearchAskForm defaultQuestion={q} defaultSourceId={sourceId} />
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
