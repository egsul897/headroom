import Link from "next/link";
import { notFound } from "next/navigation";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getDocumentStorageProvider } from "@/lib/document-storage";
import { CONMED_DEMO_DOCUMENTS } from "@/lib/product/conmed-demo/package";

export const metadata = { title: "Headroom — Document source" };

async function loadSourceText(documentId: string, storageRef: string | null, notes: string | null): Promise<{
  text: string;
  origin: string;
  truncated: boolean;
}> {
  // Prefer curated excerpt for readable covenant navigation when available.
  const curatedMatch = notes?.match(/^curated=(.+)$/m);
  if (curatedMatch?.[1]) {
    const abs = path.join(process.cwd(), curatedMatch[1]);
    if (existsSync(abs)) {
      const text = readFileSync(abs, "utf8");
      return { text, origin: `curated excerpt (${curatedMatch[1]})`, truncated: false };
    }
  }

  if (storageRef) {
    try {
      const provider = getDocumentStorageProvider();
      const buf = await provider.retrieve(storageRef);
      const raw = buf.toString("utf8");
      const max = 120_000;
      if (raw.length > max) {
        return {
          text: raw.slice(0, max) + "\n\n… [truncated for display — full bytes remain in storage] …",
          origin: `stored object (${storageRef})`,
          truncated: true,
        };
      }
      return { text: raw, origin: `stored object (${storageRef})`, truncated: false };
    } catch {
      // fall through to fixture path
    }
  }

  const spec = CONMED_DEMO_DOCUMENTS.find((d) => d.id === documentId);
  if (spec) {
    const abs = path.join(process.cwd(), spec.rawRelativePath);
    if (existsSync(abs)) {
      const raw = readFileSync(abs, "utf8");
      const max = 120_000;
      if (raw.length > max) {
        return {
          text: raw.slice(0, max) + "\n\n… [truncated for display] …",
          origin: `repository fixture (${spec.rawRelativePath})`,
          truncated: true,
        };
      }
      return { text: raw, origin: `repository fixture (${spec.rawRelativePath})`, truncated: false };
    }
  }

  return { text: "", origin: "unavailable", truncated: false };
}

export default async function DocumentSourcePage({
  params,
}: {
  params: Promise<{ companyId: string; documentId: string }>;
}) {
  const { companyId, documentId } = await params;
  const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
  if (!doc) notFound();

  const source = await loadSourceText(doc.id, doc.storageRef, doc.notes);
  const sourceUrl = doc.notes?.match(/^sourceUrl=(.+)$/m)?.[1];
  const unresolved = doc.notes?.match(/^unresolved=(.+)$/m)?.[1];
  const accession = doc.notes?.match(/^accession=(.+)$/m)?.[1];

  return (
    <div className="stack">
      <Card>
        <div className="button-row" style={{ marginBottom: 8 }}>
          <Link className="button" href={`/${companyId}/documents`}>
            ← Documents
          </Link>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenants
          </Link>
        </div>
        <div className="card-title">{doc.name}</div>
        <div className="card-subtitle">{doc.type}{doc.governs ? ` — ${doc.governs}` : ""}</div>
        <div className="row">
          <div className="row-label">Source origin</div>
          <div className="row-value">{source.origin}</div>
        </div>
        {accession && (
          <div className="row">
            <div className="row-label">Accession</div>
            <div className="row-value">{accession}</div>
          </div>
        )}
        {sourceUrl && (
          <div className="row">
            <div className="row-label">SEC URL</div>
            <div className="row-value">
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {sourceUrl}
              </a>
            </div>
          </div>
        )}
        {unresolved && (
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Unresolved</div>
            <div className="row-value">
              <Chip tone="tight">OUT OF PACKAGE</Chip> {unresolved}
            </div>
          </div>
        )}
        {source.truncated && (
          <div className="row-note" style={{ marginTop: 8 }}>
            Display truncated. Full authentic HTML remains available via storage/fixture path.
          </div>
        )}
      </Card>

      <Card>
        <div className="card-title">Source text</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 12,
            lineHeight: 1.45,
            maxHeight: "70vh",
            overflow: "auto",
            margin: 0,
          }}
        >
          {source.text || "Source text unavailable."}
        </pre>
      </Card>
    </div>
  );
}
