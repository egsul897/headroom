/**
 * Deterministic, fixture-driven ContractExtractionProvider - zero network
 * calls (docs/document-onboarding-pipeline-foundation.md). This is what
 * this repo's own tests (tests/extraction/**) use, and what a later phase's
 * "synthetic company" acceptance test is expected to build on.
 *
 * Company-agnostic by construction: every proposal below is derived purely
 * from generic textual patterns already present in the ChunkRefs handed to
 * it (Article/Section markers, `"Term" means ...` sentences, dollar-figure
 * mentions, Lien/Indebtedness keywords) - never from companyId/documentId
 * branching. Extending its recognized patterns ("design its fixtures to be
 * easily extended later") means adding another regex/heuristic method here,
 * not a per-company special case.
 *
 * thresholdValue/confidence note: a KNOWN_NOT_MODELED or no-dollar-figure
 * PERMISSION proposal below still needs SOME number for the schema's
 * required `thresholdValue` field (it mirrors Permission.thresholdValue,
 * a non-nullable Decimal), so it uses 0 with reduced/absent `confidence`
 * and an explicit rationale - never treated as a real "$0 capacity" because
 * nothing in this pipeline promotes a candidate without human review, and
 * `modelingStatus: "KNOWN_NOT_MODELED"` / `reviewStatus: REVIEW_REQUIRED`
 * (set by lib/extraction/run-stage.ts for COVERAGE output) makes that
 * explicit for a reviewer.
 */

import type {
  ContractExtractionProvider,
  CoverageGapInput,
  CoverageGapResult,
  DefinitionExtractionInput,
  DefinitionExtractionResult,
  FinancialInputExtractionInput,
  FinancialInputExtractionResult,
  PermissionExtractionInput,
  PermissionExtractionResult,
  RelationshipExtractionInput,
  RelationshipExtractionResult,
  StructureExtractionInput,
  StructureExtractionResult,
} from "./provider";
import type { DefinedTermProposal, DocumentRelationshipProposal, ExternalInputRequirementProposal, PermissionProposal, RelationshipProposal } from "./schemas";

const DOLLAR_RE = /\$([\d,]+(?:\.\d+)?)\s*(million|billion)?/i;
const DEFINITION_RE = /^"([^"]{2,80})"\s+means\b/;

/** Parses a dollar figure, in the $-millions convention this codebase's own fixtures use elsewhere (e.g. tests/solver/gate0-security-scope.test.ts's FIN.ebitda). Returns null (never a fabricated number) when no figure is present. */
function parseDollarAmount(text: string): number | null {
  const match = DOLLAR_RE.exec(text);
  if (!match?.[1]) return null;
  const raw = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(raw)) return null;
  return match[2]?.toLowerCase() === "billion" ? raw * 1000 : raw;
}

export class SyntheticExtractionProvider implements ContractExtractionProvider {
  async extractDocumentStructure(input: StructureExtractionInput): Promise<StructureExtractionResult> {
    if (input.chunks.length === 0) return { candidates: [] };

    const allText = input.chunks.map((c) => c.text).join("\n");
    const documentType = /INDENTURE/i.test(allText) ? "INDENTURE" : /CREDIT AGREEMENT/i.test(allText) ? "CREDIT_AGREEMENT" : "OTHER";

    const seen = new Set<string>();
    const articleOutline: DocumentRelationshipProposal["proposedValue"]["articleOutline"] = [];
    for (const chunk of input.chunks) {
      if (!chunk.heading) continue;
      const key = `${chunk.articleRef ?? ""}|${chunk.sectionRef ?? ""}|${chunk.heading}`;
      if (seen.has(key)) continue;
      seen.add(key);
      articleOutline.push({ articleRef: chunk.articleRef ?? undefined, sectionRef: chunk.sectionRef ?? undefined, heading: chunk.heading });
    }

    const candidate: DocumentRelationshipProposal = {
      kind: "DOCUMENT_RELATIONSHIP",
      sourceChunkIds: [input.chunks[0]!.id],
      confidence: documentType === "OTHER" ? 0.3 : 0.9,
      rationale: `Document type inferred from the presence of "${documentType === "INDENTURE" ? "Indenture" : documentType === "CREDIT_AGREEMENT" ? "Credit Agreement" : "no recognized title"}" in the extracted text.`,
      proposedValue: { documentType, articleOutline },
    };
    return { candidates: [candidate] };
  }

  async extractDefinitions(input: DefinitionExtractionInput): Promise<DefinitionExtractionResult> {
    const candidates: DefinedTermProposal[] = [];
    for (const chunk of input.chunks) {
      for (const line of chunk.text.split("\n")) {
        const match = DEFINITION_RE.exec(line.trim());
        if (!match?.[1]) continue;
        candidates.push({
          kind: "DEFINED_TERM",
          sourceChunkIds: [chunk.id],
          sourcePage: chunk.page ?? undefined,
          sourceSectionRef: chunk.sectionRef ?? undefined,
          sourceExcerpt: line.trim().slice(0, 300),
          confidence: 0.9,
          rationale: 'Matched the standard \'"Term" means\' defined-term pattern.',
          proposedValue: { termName: match[1], sectionRef: chunk.sectionRef ?? "unknown", fullText: line.trim() },
        });
      }
    }
    return { candidates };
  }

  async extractPermissions(input: PermissionExtractionInput): Promise<PermissionExtractionResult> {
    const candidates: PermissionProposal[] = [];
    for (const chunk of input.chunks) {
      if (!chunk.sectionRef) continue;
      const isLien = /\blien\b/i.test(chunk.text);
      const isIndebtedness = /\bindebtedness\b/i.test(chunk.text);
      if (!isLien && !isIndebtedness) continue;
      const amount = parseDollarAmount(chunk.text);
      candidates.push({
        kind: "PERMISSION",
        sourceChunkIds: [chunk.id],
        sourcePage: chunk.page ?? undefined,
        sourceSectionRef: chunk.sectionRef,
        sourceExcerpt: chunk.text.slice(0, 300),
        confidence: amount !== null ? 0.8 : 0.4,
        rationale: amount !== null ? `Found a dollar-denominated basket in Section ${chunk.sectionRef}.` : `Section ${chunk.sectionRef} references ${isLien ? "Lien" : "Indebtedness"} but no dollar figure was found - flagged with reduced confidence.`,
        proposedValue: {
          permissionRef: chunk.sectionRef,
          action: isLien ? "secure Indebtedness with a Lien" : "incur Indebtedness",
          grantType: isLien ? "LIEN" : "DEBT_INCURRENCE",
          amountKind: "FIXED",
          entityScope: [],
          formulaType: "FLAT_AMOUNT",
          thresholdValue: amount ?? 0,
          measurementBasis: "CUMULATIVE_INCURRED",
          sectionRef: chunk.sectionRef,
          definedTermRefs: [],
          modelingStatus: "MODELED",
        },
      });
    }
    return { candidates };
  }

  async extractRelationships(input: RelationshipExtractionInput): Promise<RelationshipExtractionResult> {
    const candidates: RelationshipProposal[] = [];
    const liens = input.permissions.filter((p) => p.proposedValue.grantType === "LIEN");
    const debtPermissions = input.permissions.filter((p) => p.proposedValue.grantType === "DEBT_INCURRENCE");
    const lien = liens[0];
    const debtPermission = debtPermissions[0];
    if (lien && debtPermission) {
      candidates.push({
        kind: "RELATIONSHIP",
        sourceChunkIds: lien.sourceChunkIds,
        sourceSectionRef: lien.sourceSectionRef,
        confidence: 0.5,
        rationale: "A Lien basket and a Debt Incurrence basket both present in this run are presumed to secure the same underlying Indebtedness pending review.",
        proposedValue: {
          relationshipType: "AUTOMATIC_LINKED_PERMISSION",
          fromPermissionRef: debtPermission.proposedValue.permissionRef,
          toPermissionRef: lien.proposedValue.permissionRef,
          sourceSectionRef: lien.sourceSectionRef ?? lien.proposedValue.sectionRef,
        },
      });
    }
    return { candidates };
  }

  async extractCoverageGaps(input: CoverageGapInput): Promise<CoverageGapResult> {
    const modeledSections = new Set(input.companyCandidateSummaries.filter((c) => c.kind === "PERMISSION" && c.sectionRef).map((c) => c.sectionRef as string));
    const candidates: PermissionProposal[] = [];
    for (const chunk of input.chunks) {
      if (!chunk.sectionRef || modeledSections.has(chunk.sectionRef)) continue;
      if (!/\bindebtedness\b|\blien\b/i.test(chunk.text)) continue;
      candidates.push({
        kind: "PERMISSION",
        sourceChunkIds: [chunk.id],
        sourcePage: chunk.page ?? undefined,
        sourceSectionRef: chunk.sectionRef,
        sourceExcerpt: chunk.text.slice(0, 300),
        rationale: `Section ${chunk.sectionRef} references Indebtedness/Lien but no PERMISSION candidate covers it yet - flagged as a coverage gap, not modeled.`,
        proposedValue: {
          permissionRef: `${chunk.sectionRef}-gap`,
          action: "unmodeled provision - requires manual review",
          grantType: /\blien\b/i.test(chunk.text) ? "LIEN" : "DEBT_INCURRENCE",
          amountKind: "FIXED",
          entityScope: [],
          formulaType: "FLAT_AMOUNT",
          thresholdValue: 0,
          measurementBasis: "CUMULATIVE_INCURRED",
          sectionRef: chunk.sectionRef,
          definedTermRefs: [],
          modelingStatus: "KNOWN_NOT_MODELED",
        },
      });
    }
    return { candidates };
  }

  async extractFinancialInputs(input: FinancialInputExtractionInput): Promise<FinancialInputExtractionResult> {
    const candidates: ExternalInputRequirementProposal[] = [];
    for (const term of input.definitions) {
      if (!/ebitda/i.test(term.proposedValue.termName)) continue;
      candidates.push({
        kind: "EXTERNAL_INPUT_REQUIREMENT",
        sourceChunkIds: term.sourceChunkIds,
        sourceSectionRef: term.proposedValue.sectionRef,
        confidence: 0.7,
        rationale: `"${term.proposedValue.termName}" is a defined term this document's formulas depend on and must be sourced as a certified or reconstructed input.`,
        proposedValue: {
          kind: "CERTIFIED_EXTERNAL_INPUT",
          name: term.proposedValue.termName,
          description: `Value required to evaluate baskets that reference "${term.proposedValue.termName}".`,
          sourceRef: term.proposedValue.sectionRef,
        },
      });
    }
    return { candidates };
  }
}
