import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getChunkContext } from "@/lib/onboarding/review";

export const metadata = { title: "Headroom — Source excerpt" };
export const dynamic = "force-dynamic";

/** The "click through to view the excerpt in context" requirement - the full DocumentChunk text a candidate's sourceChunkIds points at, not just the trimmed sourceExcerpt. */
export default async function ChunkContextPage({ params }: { params: Promise<{ companyId: string; chunkId: string }> }) {
  const { companyId, chunkId } = await params;
  const chunk = await getChunkContext(chunkId).catch(() => null);
  if (!chunk) notFound();

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Source excerpt in context</div>
        <div className="card-subtitle">
          {chunk.articleRef ? `${chunk.articleRef} — ` : ""}
          {chunk.sectionRef ? `§${chunk.sectionRef}` : "no section reference"}
          {chunk.heading ? ` — ${chunk.heading}` : ""}
          {chunk.page != null ? ` — p.${chunk.page}` : ""}
        </div>
        <div className="candidate-excerpt" style={{ maxHeight: 500, overflowY: "auto" }}>
          {chunk.text}
        </div>
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link href={`/${companyId}/onboarding/review`} className="button">
            Back to review
          </Link>
        </div>
      </Card>
    </div>
  );
}
