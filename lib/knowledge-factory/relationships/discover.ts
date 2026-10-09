/**
 * Document / provision relationship discovery.
 * Differentiates DISCOVERED vs INFERRED. Does not infer legal effectiveness
 * merely from filing chronology.
 */

import { createHash } from "node:crypto";
import type { DebtDocumentClass, KnowledgeRelationshipRecord, KnowledgeSourceRecord } from "../types";

export function discoverDocumentRelationships(sources: KnowledgeSourceRecord[]): KnowledgeRelationshipRecord[] {
  const byIssuer = new Map<string, KnowledgeSourceRecord[]>();
  for (const s of sources) {
    const list = byIssuer.get(s.issuerCik) ?? [];
    list.push(s);
    byIssuer.set(s.issuerCik, list);
  }

  const out: KnowledgeRelationshipRecord[] = [];
  for (const group of byIssuer.values()) {
    const bases = group.filter((s) => isBaseAgreement(s.documentClass));
    const amendments = group.filter((s) => s.documentClass === "AMENDMENT" || s.documentClass === "RESTATEMENT");
    const supplements = group.filter((s) => s.documentClass === "SUPPLEMENTAL_INDENTURE");
    const indentures = group.filter((s) => s.documentClass === "INDENTURE");
    const waivers = group.filter((s) => s.documentClass === "WAIVER");
    const consents = group.filter((s) => s.documentClass === "CONSENT");
    const sideLetters = group.filter((s) => s.documentClass === "SIDE_LETTER");
    const intercreditors = group.filter((s) => s.documentClass === "INTERCREDITOR_AGREEMENT");

    for (const amendment of amendments) {
      const target = pickRelatedBase(amendment, bases);
      if (!target) continue;
      const kind = amendment.documentClass === "RESTATEMENT" ? "AGREEMENT_RESTATEMENT" : "AGREEMENT_AMENDMENT";
      // Title/metadata linkage = DISCOVERED; chronology-only would be INFERRED and is refused here.
      const evidenceStatus = titlesLikelyRelated(amendment, target) ? "DISCOVERED" : "DISCOVERED";
      if (!titlesLikelyRelated(amendment, target) && !sameInstrumentHint(amendment, target)) {
        // Refuse chronology-only inference.
        continue;
      }
      out.push(rel(amendment.sourceId, target.sourceId, kind, evidenceStatus, "Title/metadata indicates amendment/restatement of base agreement — not a determination of legal effectiveness."));
    }

    for (const sup of supplements) {
      const target = pickRelatedBase(sup, indentures);
      if (!target || !titlesLikelyRelated(sup, target)) continue;
      out.push(rel(sup.sourceId, target.sourceId, "INDENTURE_SUPPLEMENTAL", "DISCOVERED", "Supplemental indenture metadata references indenture family."));
    }

    for (const w of waivers) {
      const target = pickRelatedBase(w, bases);
      if (!target || !titlesLikelyRelated(w, target)) continue;
      out.push(rel(w.sourceId, target.sourceId, "AGREEMENT_WAIVER", "DISCOVERED", "Waiver title references related agreement."));
    }
    for (const c of consents) {
      const target = pickRelatedBase(c, bases);
      if (!target || !titlesLikelyRelated(c, target)) continue;
      out.push(rel(c.sourceId, target.sourceId, "AGREEMENT_CONSENT", "DISCOVERED", "Consent title references related agreement."));
    }
    for (const s of sideLetters) {
      const target = pickRelatedBase(s, bases);
      if (!target || !titlesLikelyRelated(s, target)) continue;
      out.push(rel(s.sourceId, target.sourceId, "AGREEMENT_SIDE_LETTER", "DISCOVERED", "Side letter title references related agreement."));
    }
    for (const ic of intercreditors) {
      const target = pickRelatedBase(ic, bases);
      if (!target) continue;
      // Intercreditor often names facilities; allow weaker metadata link as DISCOVERED only when titles share tokens.
      if (!titlesLikelyRelated(ic, target)) continue;
      out.push(rel(ic.sourceId, target.sourceId, "AGREEMENT_INTERCREDITOR", "DISCOVERED", "Intercreditor metadata references related agreement family."));
    }
  }
  return out;
}

function isBaseAgreement(c: DebtDocumentClass): boolean {
  return (
    c === "CREDIT_AGREEMENT" ||
    c === "REVOLVING_CREDIT_AGREEMENT" ||
    c === "TERM_LOAN_AGREEMENT" ||
    c === "ABL_AGREEMENT" ||
    c === "INDENTURE" ||
    c === "RESTATEMENT"
  );
}

function pickRelatedBase(doc: KnowledgeSourceRecord, bases: KnowledgeSourceRecord[]): KnowledgeSourceRecord | null {
  if (bases.length === 0) return null;
  const scored = bases
    .map((b) => ({ b, score: titleOverlap(doc.documentTitle, b.documentTitle) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]!.score > 0 ? scored[0]!.b : null;
}

function titlesLikelyRelated(a: KnowledgeSourceRecord, b: KnowledgeSourceRecord): boolean {
  return titleOverlap(a.documentTitle, b.documentTitle) >= 2 || sameInstrumentHint(a, b);
}

function sameInstrumentHint(a: KnowledgeSourceRecord, b: KnowledgeSourceRecord): boolean {
  if (a.instrumentIdentity && b.instrumentIdentity && a.instrumentIdentity === b.instrumentIdentity) return true;
  return /\b(?:Credit Agreement|Indenture|Facility)\b/i.test(a.documentTitle) && /\b(?:Credit Agreement|Indenture|Facility)\b/i.test(b.documentTitle);
}

function titleOverlap(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3 && !["agreement", "dated", "among", "between", "amendment"].includes(t)),
    );
  const A = tokens(a);
  const B = tokens(b);
  let n = 0;
  for (const t of A) if (B.has(t)) n += 1;
  return n;
}

function rel(
  sourceId: string,
  targetId: string,
  kind: KnowledgeRelationshipRecord["kind"],
  evidenceStatus: KnowledgeRelationshipRecord["evidenceStatus"],
  rationale: string,
): KnowledgeRelationshipRecord {
  const id = createHash("sha256").update(`${kind}|${sourceId}|${targetId}`).digest("hex").slice(0, 20);
  return { id, sourceId, targetId, kind, evidenceStatus, rationale, confidence: evidenceStatus === "DISCOVERED" ? 0.7 : 0.4 };
}
