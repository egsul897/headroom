/**
 * HEADROOM-3 Scope C — package-document role vocabulary for amendment
 * precedence. Maps Phase 2C DocumentType / relationship evidence onto a
 * small set of authority roles. A newer document does NOT automatically
 * replace every provision in an older document; role + explicit provision
 * targeting + effective dating must combine before operative replacement.
 *
 * This module is pure classification over already-computed package-graph
 * outputs. It does not invent edges, run LLM calls, or mutate persistence.
 */
import type { DocumentType } from "@prisma/client";
import type { DocumentClassification, DocumentIdentity, RelationshipCandidate } from "./types";

/** Package-level authority role of a document inside a debt package. */
export type PackageDocumentRole =
  | "ORIGINAL_AGREEMENT"
  | "AMENDMENT"
  | "RESTATEMENT"
  | "SUPPLEMENTAL_INDENTURE"
  | "WAIVER"
  | "SIDE_LETTER"
  | "JOINDER"
  | "CROSS_CUTTING"
  | "UNKNOWN";

export type PackageDocumentRoleConfidence = "CONFIRMED" | "PROVISIONAL" | "AMBIGUOUS" | "REJECTED";

export interface PackageDocumentRoleAssignment {
  documentId: string;
  role: PackageDocumentRole;
  confidence: PackageDocumentRoleConfidence;
  /** ISO date when known — never invented. */
  effectiveDate: string | null;
  executionDate: string | null;
  /** Relationship evidence that justified the role (citations only). */
  evidenceCitations: string[];
  reason: string;
}

const CROSS_CUTTING_TYPES = new Set<DocumentType>([
  "INTERCREDITOR_AGREEMENT",
  "GUARANTEE",
  "SECURITY_AGREEMENT",
  "GUARANTEE_AND_SECURITY_AGREEMENT",
  "COMPLIANCE_CERTIFICATE",
  "FINANCIAL_STATEMENT",
  "FEE_LETTER",
]);

function roleFromType(type: DocumentType): PackageDocumentRole | null {
  switch (type) {
    case "CREDIT_AGREEMENT":
    case "INDENTURE":
    case "OTHER_DEBT_DOCUMENT":
      return "ORIGINAL_AGREEMENT";
    case "AMENDMENT":
      return "AMENDMENT";
    case "AMENDED_AND_RESTATED_AGREEMENT":
      return "RESTATEMENT";
    case "SUPPLEMENTAL_INDENTURE":
      return "SUPPLEMENTAL_INDENTURE";
    case "SIDE_LETTER":
      return "SIDE_LETTER";
    case "JOINDER":
      return "JOINDER";
    default:
      return null;
  }
}

/**
 * Assign package-document roles. Waiver is detected from relationship/
 * classification signals (SIDE_LETTER typed documents that only waive, or
 * an AMENDS edge whose citation clearly says "waiver") — never guessed from
 * recency. Conflicting type vs relationship evidence → AMBIGUOUS.
 */
export function assignPackageDocumentRoles(
  classifications: DocumentClassification[],
  identities: DocumentIdentity[],
  relationshipCandidates: RelationshipCandidate[],
): PackageDocumentRoleAssignment[] {
  const identityById = new Map(identities.map((i) => [i.documentId, i] as const));
  const outgoing = new Map<string, RelationshipCandidate[]>();
  for (const rel of relationshipCandidates) {
    const list = outgoing.get(rel.sourceDocumentId) ?? [];
    list.push(rel);
    outgoing.set(rel.sourceDocumentId, list);
  }

  return classifications.map((c) => {
    const identity = identityById.get(c.documentId);
    const rels = outgoing.get(c.documentId) ?? [];
    const evidenceCitations = rels.map((r) => r.sourceCitation).filter(Boolean);

    if (CROSS_CUTTING_TYPES.has(c.type)) {
      return {
        documentId: c.documentId,
        role: "CROSS_CUTTING",
        confidence: c.confidence >= 0.7 ? "CONFIRMED" : "PROVISIONAL",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: `Cross-cutting document type ${c.type} — associated via GOVERNS/GUARANTEES/SECURES edges, never instrument membership.`,
      };
    }

    // Rejected / negative evidence: document claims to amend but evidence says no.
    const negative = rels.some((r) => r.evidenceClass === "NEGATIVE_EVIDENCE");
    if (negative) {
      return {
        documentId: c.documentId,
        role: roleFromType(c.type) ?? "UNKNOWN",
        confidence: "REJECTED",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Negative evidence on a modification relationship — role recorded but relationship rejected for membership/operative authority.",
      };
    }

    const typeRole = roleFromType(c.type);
    const restates = rels.some((r) => r.relationshipType === "RESTATES" && r.status === "RESOLVED");
    const amends = rels.some((r) => r.relationshipType === "AMENDS" && (r.status === "RESOLVED" || r.status === "REVIEW_REQUIRED"));
    const supplements = rels.some((r) => r.relationshipType === "SUPPLEMENTS" && r.status === "RESOLVED");
    const waiverish = evidenceCitations.some((cit) => /\bwaiv(e|er|es|ing)\b/i.test(cit));

    if (waiverish && (c.type === "SIDE_LETTER" || c.type === "AMENDMENT" || c.type === "OTHER" || c.type === "UNKNOWN")) {
      return {
        documentId: c.documentId,
        role: "WAIVER",
        confidence: amends && rels.every((r) => r.status !== "RESOLVED") ? "PROVISIONAL" : "CONFIRMED",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Waiver language in relationship citation; provision-level only — never whole-document supersession.",
      };
    }

    if (restates || typeRole === "RESTATEMENT") {
      if (typeRole && typeRole !== "RESTATEMENT" && typeRole !== "ORIGINAL_AGREEMENT" && typeRole !== "AMENDMENT") {
        return {
          documentId: c.documentId,
          role: "RESTATEMENT",
          confidence: "AMBIGUOUS",
          effectiveDate: identity?.effectiveDate ?? null,
          executionDate: identity?.executionDate ?? null,
          evidenceCitations,
          reason: `Type ${c.type} conflicts with RESOLVED RESTATES edge — REVIEW_REQUIRED before operative consolidation.`,
        };
      }
      return {
        documentId: c.documentId,
        role: "RESTATEMENT",
        confidence: restates ? "CONFIRMED" : "PROVISIONAL",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: restates
          ? "RESOLVED RESTATES edge — restatement may supersede the whole prior agreement only when operative-document resolution is RESOLVED."
          : "Classified as amended-and-restated without a RESOLVED RESTATES edge.",
      };
    }

    if (supplements || typeRole === "SUPPLEMENTAL_INDENTURE") {
      return {
        documentId: c.documentId,
        role: "SUPPLEMENTAL_INDENTURE",
        confidence: supplements ? "CONFIRMED" : typeRole === "SUPPLEMENTAL_INDENTURE" ? "CONFIRMED" : "PROVISIONAL",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Supplemental indenture — affects only provisions it expressly modifies.",
      };
    }

    if (typeRole === "SIDE_LETTER") {
      return {
        documentId: c.documentId,
        role: "SIDE_LETTER",
        confidence: "CONFIRMED",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Side letter — never auto-supersedes base agreement provisions without explicit targeted effects.",
      };
    }

    if (amends || typeRole === "AMENDMENT") {
      const allReview = amends && rels.filter((r) => r.relationshipType === "AMENDS").every((r) => r.status === "REVIEW_REQUIRED");
      return {
        documentId: c.documentId,
        role: "AMENDMENT",
        confidence: allReview ? "PROVISIONAL" : amends ? "CONFIRMED" : "PROVISIONAL",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: allReview
          ? "AMENDS edge is REVIEW_REQUIRED — provisional association only; no canonical membership or operative consolidation."
          : "Amendment — replaces only provisions it explicitly targets with adequate authority.",
      };
    }

    if (typeRole === "JOINDER") {
      return {
        documentId: c.documentId,
        role: "JOINDER",
        confidence: "CONFIRMED",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Joinder — party accession; does not rewrite covenant text unless it also carries explicit modification effects.",
      };
    }

    if (typeRole === "ORIGINAL_AGREEMENT") {
      return {
        documentId: c.documentId,
        role: "ORIGINAL_AGREEMENT",
        confidence: c.confidence >= 0.7 ? "CONFIRMED" : "PROVISIONAL",
        effectiveDate: identity?.effectiveDate ?? null,
        executionDate: identity?.executionDate ?? null,
        evidenceCitations,
        reason: "Base agreement candidate for instrument grouping.",
      };
    }

    return {
      documentId: c.documentId,
      role: "UNKNOWN",
      confidence: "AMBIGUOUS",
      effectiveDate: identity?.effectiveDate ?? null,
      executionDate: identity?.executionDate ?? null,
      evidenceCitations,
      reason: `No confident package role for type ${c.type}.`,
    };
  });
}
