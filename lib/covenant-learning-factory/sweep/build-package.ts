import { stripHtmlPreserveStructure } from "../../contract-model/compiler/deterministic-extraction/html-text";
/**
 * Build a ComputationPackage from Neon precedent rows (bytes + candidates).
 * Never invents operative text — uses document bytes or concatenated candidate excerpts.
 */

import { createHash } from "node:crypto";
import { extractBasketClauses } from "../../contract-model/covenant-computation/extract-baskets";
import type { ComputationPackage, PackageDocument } from "../../contract-model/covenant-computation/types";
import type { LearnedRuleSet } from "../learned-rules/types";

export interface PrecedentSourceRow {
  sourceId: string;
  companyId?: string | null;
  issuerCik?: string | null;
  ticker?: string | null;
  title?: string | null;
  storageRef?: string | null;
  contentSha256?: string | null;
}

export interface CandidateRow {
  candidateId: string;
  sourceId: string;
  family?: string | null;
  sectionRef?: string | null;
  excerpt?: string | null;
}

export function buildComputationPackage(args: {
  source: PrecedentSourceRow;
  /** Full document text when available from document_byte_objects. */
  documentText: string | null;
  candidates: CandidateRow[];
  rules?: LearnedRuleSet;
  asOf?: string;
}): ComputationPackage {
  const packageKey = `clf-sweep:${args.source.sourceId}`;
  const companyId = args.source.companyId || args.source.issuerCik || args.source.sourceId;
  let text = args.documentText?.trim() ?? "";
  // Raw SEC filings are HTML; compute over the visible text, never markup.
  if (/<(html|body|div|p|font|table|span)\b/i.test(text.slice(0, 20000))) text = stripHtmlPreserveStructure(text).trim();
  if (text.length < 80) {
    // Fall back to candidate excerpts only — marked as precedent composite, not invented
    const parts = args.candidates
      .map((c) => c.excerpt?.trim())
      .filter((e): e is string => Boolean(e && e.length >= 24));
    text = parts.join("\n\n");
  }
  const documentId = args.source.sourceId;
  const documents: PackageDocument[] = text
    ? [{ documentId, text, role: "INDENTURE" as const }]
    : [];

  const baskets =
    text.length >= 80
      ? extractBasketClauses({ documentId, text, rules: args.rules })
      : args.candidates
          .filter((c) => c.excerpt && c.excerpt.length >= 24)
          .map((c) => ({
            stableKey: `cand-${c.candidateId}`,
            sectionRef: c.sectionRef || c.family || "precedent-candidate",
            covenantFamily: c.family || "OTHER",
            documentId,
            operativeText: c.excerpt!,
            role: "PERMISSION" as const,
          }));

  // Ensure operative text is subset of document for citation binding
  const docText = documents[0]?.text ?? "";
  const boundBaskets = baskets.filter((b) => {
    if (!docText) return false;
    return docText.includes(b.operativeText) || normalizeIncludes(docText, b.operativeText);
  });

  return {
    packageKey,
    companyId,
    instrumentKey: args.source.ticker || args.source.sourceId,
    asOf: args.asOf ?? "1970-01-01",
    documents,
    baskets: boundBaskets,
    omissions:
      boundBaskets.length === 0 && args.candidates.length > 0
        ? [
            {
              stableKey: `omit-${shortHash(args.source.sourceId)}`,
              sectionRef: "precedent",
              covenantFamily: "OTHER",
              reason: "NEEDS_INPUT: no operative text bound for computation",
            },
          ]
        : [],
  };
}

function normalizeIncludes(haystack: string, needle: string): boolean {
  const h = haystack.replace(/\s+/g, " ");
  const n = needle.replace(/\s+/g, " ").trim();
  return n.length >= 24 && h.includes(n);
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 10);
}
