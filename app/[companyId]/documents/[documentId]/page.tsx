import Link from "next/link";
import { notFound } from "next/navigation";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getDocumentStorageProvider } from "@/lib/document-storage";
import { CONMED_DEMO_DOCUMENTS } from "@/lib/product/conmed-demo/package";
import { getCustomerDocumentIntelligence } from "@/lib/product/customer-intelligence/load";
import { authorizeCompanyAccess } from "@/lib/auth/tenant-boundary";

export const metadata = { title: "Headroom — Document source" };

async function loadSourceText(documentId: string, storageRef: string | null, notes: string | null): Promise<{
  text: string;
  origin: string;
  truncated: boolean;
}> {
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
      // fall through
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
  // Tenant boundary: stored document bytes are customer data; deny before any read, 404 either way.
  const access = await authorizeCompanyAccess(companyId);
  if (!access.allowed) notFound();
  const doc = await prisma.document.findFirst({ where: { id: documentId, companyId } });
  if (!doc) notFound();

  const source = await loadSourceText(doc.id, doc.storageRef, doc.notes);
  const intel = await getCustomerDocumentIntelligence(companyId, documentId);
  const sourceUrl = doc.notes?.match(/^sourceUrl=(.+)$/m)?.[1];
  const unresolved = doc.notes?.match(/^unresolved=(.+)$/m)?.[1];
  const accession = doc.notes?.match(/^accession=(.+)$/m)?.[1];
  const summaryItems = intel?.summary?.items ?? [];
  const categories = intel?.summary ? Object.entries(intel.summary.countsByCategory) : [];

  return (
    <div className="stack">
      <Card>
        <div className="button-row" style={{ marginBottom: 8 }}>
          <Link className="button" href={`/${companyId}/documents`}>
            ← Documents
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
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
        <div className="row">
          <div className="row-label">Intelligence status</div>
          <div className="row-value">
            {intel ? (
              <>
                <Chip tone={intel.analysisOk ? "pass" : "trip"}>
                  {intel.analysisOk ? "ANALYZED" : "FAILED"}
                </Chip>{" "}
                {intel.extractionStatus} · {intel.covenantItemCount} summaries
              </>
            ) : (
              <Chip tone="idle">Not analyzed</Chip>
            )}
          </div>
        </div>
        {intel?.analysisError && (
          <div className="row-note" style={{ color: "var(--color-danger, #b91c1c)" }}>
            Analysis failed: {intel.analysisError}. This document has not been successfully analyzed.
          </div>
        )}
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
            Display truncated. Full authentic bytes remain available via storage/fixture path.
          </div>
        )}
      </Card>

      {intel?.amendmentPackage && (
        <Card>
          <div className="card-title">Amendment-aware package context</div>
          <div className="row">
            <div className="row-label">Resolution</div>
            <div className="row-value">
              <Chip
                tone={
                  intel.amendmentPackage.operativeResolution === "UNRESOLVED_PRECEDENCE"
                    ? "tight"
                    : "idle"
                }
              >
                {intel.amendmentPackage.operativeResolution}
              </Chip>
            </div>
          </div>
          <div className="row-note">{intel.amendmentPackage.askGuidance}</div>
          {intel.amendmentPackage.unresolvedReasons.map((r, i) => (
            <div key={i} className="row-note">
              {r}
            </div>
          ))}
        </Card>
      )}

      {categories.length > 0 && (
        <Card>
          <div className="card-title">Covenant categories</div>
          <div className="card-subtitle">
            Discovered from extracted structure — not verified legal conclusions.
          </div>
          <div className="button-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {categories.map(([cat, count]) => (
              <Chip key={cat} tone="navy">
                {cat.replace(/_/g, " ")}: {count}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      {summaryItems.length > 0 && (
        <Card>
          <div className="card-title">Covenant summaries</div>
          <div className="card-subtitle">
            Plain-English substance with citations. DISCOVERED ≠ VERIFIED.
          </div>
          {summaryItems.slice(0, 40).map((item, idx) => (
            <div
              key={`${item.sectionRef}-${idx}`}
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid var(--border, #e5e7eb)",
              }}
            >
              <div className="row">
                <div className="row-label">{item.categoryLabel}</div>
                <div className="row-value">
                  <Chip tone="idle">{item.sectionRef}</Chip>{" "}
                  {item.posture && <Chip tone="navy">{item.posture}</Chip>}{" "}
                  <Chip tone="idle">{item.epistemicStatus}</Chip>
                </div>
              </div>
              <div className="card-subtitle" style={{ marginTop: 4 }}>
                {item.heading}
              </div>
              <p className="row-note" style={{ whiteSpace: "pre-wrap" }}>
                {item.plainEnglish}
              </p>
              {item.restriction && (
                <div className="row-note">Restriction: {item.restriction}</div>
              )}
              {(item.permissions?.length ?? 0) > 0 && (
                <div className="row-note">
                  Permissions / exceptions: {item.permissions!.slice(0, 4).join(" · ")}
                </div>
              )}
              {(item.coveredEntities?.length ?? 0) > 0 && (
                <div className="row-note">Covered entities: {item.coveredEntities!.join(", ")}</div>
              )}
              {item.entityScope?.notes?.length > 0 && (
                <div className="row-note">Scope notes: {item.entityScope.notes.join(" ")}</div>
              )}
              {item.materialBasketsThresholds?.length > 0 && (
                <div className="row-note">
                  Baskets / thresholds: {item.materialBasketsThresholds.join(" · ")}
                </div>
              )}
              {(item.conditions?.length ?? 0) > 0 && (
                <div className="row-note">Conditions: {item.conditions!.slice(0, 3).join(" · ")}</div>
              )}
              {item.dependencies?.length > 0 && (
                <div className="row-note">Dependencies: {item.dependencies.join(" · ")}</div>
              )}
              {item.applicableDefinitions?.length > 0 && (
                <div className="row-note">
                  Definitions:{" "}
                  {item.applicableDefinitions.map((d) => d.term).join(", ")}
                </div>
              )}
              {item.crossReferences?.length > 0 && (
                <div className="row-note">
                  Cross-refs: {item.crossReferences.join(", ")}
                </div>
              )}
              <blockquote
                style={{
                  margin: "8px 0 0",
                  padding: "8px 12px",
                  borderLeft: "3px solid var(--color-navy, #1e3a5f)",
                  fontSize: 12,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.operativeLanguageExcerpt}
              </blockquote>
              <div className="row-note" style={{ marginTop: 4 }}>
                Citation:{" "}
                <Link href={`#source-text`}>{item.sourceCitation}</Link>
              </div>
              {item.unresolvedQuestions?.length > 0 && (
                <div className="row-note" style={{ marginTop: 4 }}>
                  Unresolved: {item.unresolvedQuestions.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {intel && intel.analysisOk === false && summaryItems.length === 0 && (
        <Card>
          <div className="card-title">No covenant summaries</div>
          <div className="card-subtitle">
            Extraction did not produce usable covenant candidates. Re-upload a supported PDF/HTML/DOCX
            financing document, or re-run analysis after fixing parse errors.
          </div>
        </Card>
      )}

      <div id="source-text">
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
    </div>
  );
}
