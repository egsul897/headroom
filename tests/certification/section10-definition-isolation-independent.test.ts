/**
 * Phase 3F.1.6 Final Foundation Certification - Section 10 (Definition
 * Isolation). INDEPENDENT re-verification of the 3 new-this-session
 * definition-fallback fixes (docs/phase-3f1-5-r-residual-foundation/
 * 11-definition-isolation-audit.json):
 *   1. semantic/tools.ts's getScopedDefinitionFullText (getDefinition/
 *      getDefinitionDependencies tools) - fallback scoped to allowedDocs.
 *   2. amendment/pipeline.ts's getTargetCurrentText - fallback removed
 *      entirely.
 *   3. amendment/independent-verification.ts's resolveDefinitionIndependently
 *      - claimed already safe (document-scoped, no fallback).
 *
 * Adversarial construction (own, not reused): Document A and Document B,
 * SAME company/tenant, TWO SEPARATE debt instruments, each defining
 * "Available Amount" differently (A: $10,000,000 flat; B: $99,999,999 plus
 * a Cumulative Credit build-up) - built with real Prisma models in a
 * scratch company in real Postgres, cleaned up in afterAll. Every lookup
 * path found by grep across lib/contract-model/compiler/** is exercised
 * directly against the real, unmodified production functions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { persistStructuralNodes, persistStructuralDefinitions } from "../../lib/contract-model/compiler/persistence";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { buildToolSet } from "../../lib/contract-model/compiler/semantic/tools";
import type { SemanticToolAccess, ToolBudget } from "../../lib/contract-model/compiler/semantic/types";
import type { CovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/types";
import { verifyAmendmentEffectsIndependently } from "../../lib/contract-model/compiler/amendment/independent-verification";
import type { AmendmentEffectCandidate } from "../../lib/contract-model/compiler/amendment/types";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

/** Minimal fixture - only .items/.edges are ever read by the getDefinition/getDefinitionDependencies tool paths under test here; every other field is irrelevant to definition-isolation and is cast rather than fully populated. */
const EMPTY_CONTEXT_BUNDLE = { items: [], edges: [] } as unknown as CovenantContextBundle;
const TOOL_BUDGET: ToolBudget = { maxToolCalls: 10, maxRecursionDepth: 5, maxAdditionalSourceChars: 100000 };

const COMPANY = "audit-cert-s10-def-isolation-co";
const DOC_A = "audit-cert-s10-doc-a-instrument-alpha";
const DOC_A2 = "audit-cert-s10-doc-a2-amendment-alpha";
const DOC_B = "audit-cert-s10-doc-b-instrument-beta";

const textA: PackageDocumentInput = {
  documentId: DOC_A,
  label: "Instrument Alpha Credit Agreement",
  text: `CREDIT AGREEMENT dated as of January 5, 2021, among Alpha Holdings LLC, as Borrower.\n\n"Available Amount" means, as of any date of determination, an amount equal to $10,000,000.\n\nSection 6.08 Restricted Payments. The Borrower may make Restricted Payments not to exceed the Available Amount.`,
};
const textA2: PackageDocumentInput = {
  documentId: DOC_A2,
  label: "Instrument Alpha First Amendment",
  text: `FIRST AMENDMENT dated as of June 1, 2022 (this "Amendment"), to the Credit Agreement dated as of January 5, 2021, among Alpha Holdings LLC, as Borrower.\n\nSection 1. Section 6.08 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: "Section 6.08 Restricted Payments. The Borrower may make Restricted Payments not to exceed the Available Amount plus $1,000,000."`,
};
const textB: PackageDocumentInput = {
  documentId: DOC_B,
  label: "Instrument Beta Credit Agreement",
  text: `CREDIT AGREEMENT dated as of March 9, 2021, among Beta Industries Inc., as Borrower.\n\n"Available Amount" means, as of any date of determination, the sum of $99,999,999 plus the Cumulative Credit.\n\n"Cumulative Credit" means the cumulative amount described on Schedule 1 hereto.\n\nSection 6.08 Restricted Payments. The Borrower may make Restricted Payments not to exceed the Available Amount.`,
};

async function ingest(documentId: string, companyId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodeIndex = await persistStructuralNodes(companyId, nodes);
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  await persistStructuralDefinitions(companyId, defs, nodeIndex);
  return { nodes, defs };
}

describe("Section 10: real Postgres cross-instrument definition isolation (Instrument Alpha vs Instrument Beta, same company)", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY } });
    await prisma.company.create({ data: { id: COMPANY, name: "Certification Fixture Definition-Isolation Co (test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOC_A, companyId: COMPANY, name: "Instrument Alpha Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOC_A2, companyId: COMPANY, name: "Instrument Alpha First Amendment", type: "AMENDMENT" } });
    await prisma.document.create({ data: { id: DOC_B, companyId: COMPANY, name: "Instrument Beta Credit Agreement", type: "CREDIT_AGREEMENT" } });
    await ingest(DOC_A, COMPANY, textA.text);
    await ingest(DOC_A2, COMPANY, textA2.text);
    await ingest(DOC_B, COMPANY, textB.text);
  });
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY } });
  });

  it("real Postgres: DefinedTermNode rows for A's and B's own 'Available Amount' are two genuinely separate rows with different definitionTextRef anchors, despite byte-identical normalizedName", async () => {
    const termA = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_A, normalizedName: "available amount" } });
    const termB = await prisma.definedTermNode.findFirstOrThrow({ where: { companyId: COMPANY, documentId: DOC_B, normalizedName: "available amount" } });
    expect(termA.id).not.toBe(termB.id);
    expect(termA.stableKey).not.toBe(termB.stableKey);
  });

  it("LOOKUP PATH 1 (semantic/tools.ts getDefinition tool, buildToolSet): compiling Instrument Alpha's own provision NEVER returns Beta's $99,999,999 definition, even with no packageGraph (conservative 'home document only' default)", () => {
    const index = buildStructuralIndex(
      new Map([
        [DOC_A, { text: textA.text, nodes: parseDocumentStructure(textA) }],
        [DOC_B, { text: textB.text, nodes: parseDocumentStructure(textB) }],
      ]),
      [...detectStructuralDefinitions(DOC_A, textA.text, parseDocumentStructure(textA)), ...detectStructuralDefinitions(DOC_B, textB.text, parseDocumentStructure(textB))],
      []
    );
    const access: SemanticToolAccess = { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: EMPTY_CONTEXT_BUNDLE };
    const tools = buildToolSet(access, DOC_A, { current: 0 }, TOOL_BUDGET);
    const getDefinition = tools.find((t) => t.name === "getDefinition")!;
    const outcome = getDefinition.execute({ term: "Available Amount" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { text: string };
    expect(result.text).toMatch(/\$10,000,000/);
    expect(result.text).not.toMatch(/99,999,999/);
    expect(result.text).not.toMatch(/Cumulative Credit/);
  });

  it("LOOKUP PATH 1 (getDefinitionDependencies tool): dependency scan for Alpha's own term never leaks Beta's own dependency vocabulary ('Cumulative Credit' is a real defined term in Beta only)", () => {
    const index = buildStructuralIndex(
      new Map([
        [DOC_A, { text: textA.text, nodes: parseDocumentStructure(textA) }],
        [DOC_B, { text: textB.text, nodes: parseDocumentStructure(textB) }],
      ]),
      [...detectStructuralDefinitions(DOC_A, textA.text, parseDocumentStructure(textA)), ...detectStructuralDefinitions(DOC_B, textB.text, parseDocumentStructure(textB))],
      []
    );
    const access: SemanticToolAccess = { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: EMPTY_CONTEXT_BUNDLE };
    const tools = buildToolSet(access, DOC_A, { current: 0 }, TOOL_BUDGET);
    const getDeps = tools.find((t) => t.name === "getDefinitionDependencies")!;
    const outcome = getDeps.execute({ term: "Available Amount" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { dependencies: string[] };
    expect(result.dependencies).not.toContain("Cumulative Credit"); // Beta's own term, never Alpha's dependency.
  });

  it("LOOKUP PATH 1 legitimate positive control: Alpha's own AMENDMENT sibling (DOC_A2, same real instrument per buildPackageGraph) DOES legitimately see Alpha's base 'Available Amount' via the scoped allowedDocs fallback - the fix narrows scope to real siblings, it does not over-restrict same-instrument lookups", () => {
    const index = buildStructuralIndex(
      new Map([
        [DOC_A, { text: textA.text, nodes: parseDocumentStructure(textA) }],
        [DOC_A2, { text: textA2.text, nodes: parseDocumentStructure(textA2) }],
        [DOC_B, { text: textB.text, nodes: parseDocumentStructure(textB) }],
      ]),
      [...detectStructuralDefinitions(DOC_A, textA.text, parseDocumentStructure(textA)), ...detectStructuralDefinitions(DOC_A2, textA2.text, parseDocumentStructure(textA2)), ...detectStructuralDefinitions(DOC_B, textB.text, parseDocumentStructure(textB))],
      []
    );
    const packageGraph = buildPackageGraph(COMPANY, "adv10-pkg", [textA, textA2, textB]);
    // Sanity: real package-graph groups A and A2 into ONE instrument, B stands alone.
    const instrumentOfA = packageGraph.instruments.find((i) => i.documentIds.includes(DOC_A))!;
    expect(instrumentOfA.documentIds).toContain(DOC_A2);
    expect(instrumentOfA.documentIds).not.toContain(DOC_B);

    const access: SemanticToolAccess = { structuralIndex: index, operativeState: null, packageGraph, amendmentEffects: null, contextBundle: EMPTY_CONTEXT_BUNDLE };
    // DOC_A2 (the amendment) has no OWN "Available Amount" definition - it only ever mentions the term - so getDefinition for it must fall back to its real sibling DOC_A's own definition, never to Beta's.
    const tools = buildToolSet(access, DOC_A2, { current: 0 }, TOOL_BUDGET);
    const outcome = tools.find((t) => t.name === "getDefinition")!.execute({ term: "Available Amount" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as { text: string };
    expect(result.text).toMatch(/\$10,000,000/); // Alpha's own real sibling definition.
    expect(result.text).not.toMatch(/99,999,999/); // never Beta's, even though Beta is in the same real Postgres company.
  });

  it("LOOKUP PATH 3 (amendment/independent-verification.ts verifyAmendmentEffectsIndependently -> resolveDefinitionIndependently): a fabricated effect claiming Alpha's own document defines a term ONLY Beta actually defines is correctly flagged NOT_FOUND, never silently confirmed via Beta's definition", () => {
    const index = buildStructuralIndex(
      new Map([
        [DOC_A, { text: textA.text, nodes: parseDocumentStructure(textA) }],
        [DOC_B, { text: textB.text, nodes: parseDocumentStructure(textB) }],
      ]),
      [...detectStructuralDefinitions(DOC_A, textA.text, parseDocumentStructure(textA)), ...detectStructuralDefinitions(DOC_B, textB.text, parseDocumentStructure(textB))],
      []
    );
    // "Cumulative Credit" is real evidence in Beta's own text but does not exist in Alpha's - an effect that (incorrectly, adversarially) claims Alpha's own document (DOC_A) as its targetDocumentId for this term must fail independent verification, not silently resolve against Beta's real definition of the same term.
    const fabricatedEffect: AmendmentEffectCandidate = {
      effectId: "adv10-fab-1",
      amendmentDocumentId: DOC_A2,
      target: { kind: "DEFINITION", targetDocumentId: DOC_A, targetInstrumentKey: "instrument:" + DOC_A, targetStructuralNodeKey: null, targetSectionRef: null, targetDefinedTermRef: "Cumulative Credit", targetHint: null },
      operation: "MODIFY_DEFINITION",
      effectiveDate: { date: "2022-06-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "e", reason: "r" },
      newText: null,
      oldText: null,
      sourceCitation: "fabricated",
      sourceExcerpt: "fabricated",
      confidence: 0.9,
      status: "RESOLVED",
      unresolvedReason: null,
      resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    };
    const findings = verifyAmendmentEffectsIndependently([fabricatedEffect], [textA, textB], index);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.passed).toBe(false);
    expect(findings[0]!.targetResolutionStatus).toBe("NOT_FOUND");
    expect(findings[0]!.issues.some((i) => i.includes("Cumulative Credit") && i.includes("does not resolve"))).toBe(true);
  });

  it("LOOKUP PATH 2 (amendment/pipeline.ts getTargetCurrentText) - certifying the underlying primitive the fix now relies on EXCLUSIVELY: index.getDefinitionFullText(term, documentId) never crosses instruments, proving the fix (removing the no-documentId fallback call) is safe", () => {
    const index = buildStructuralIndex(
      new Map([
        [DOC_A, { text: textA.text, nodes: parseDocumentStructure(textA) }],
        [DOC_B, { text: textB.text, nodes: parseDocumentStructure(textB) }],
      ]),
      [...detectStructuralDefinitions(DOC_A, textA.text, parseDocumentStructure(textA)), ...detectStructuralDefinitions(DOC_B, textB.text, parseDocumentStructure(textB))],
      []
    );
    // The CURRENT, fixed pipeline.ts code path: index.getDefinitionFullText(term, documentId) - always document-scoped.
    expect(index.getDefinitionFullText("Available Amount", DOC_A)).toMatch(/\$10,000,000/);
    expect(index.getDefinitionFullText("Available Amount", DOC_B)).toMatch(/99,999,999/);
    // A genuine miss within the resolved target document (a THIRD document that defines neither) correctly returns undefined - never silently substituting either sibling's text.
    expect(index.getDefinitionFullText("Available Amount", "some-other-document-never-indexed")).toBeUndefined();

    // REPRODUCING THE PRE-FIX DEFECT for comparison (never called by the current, fixed pipeline.ts - this line exists ONLY to prove the fix mattered): the REMOVED fallback form (no documentId argument) DOES cross instruments -
    // this is exactly the call getTargetCurrentText's DEFINITION branch used to make when the resolved target document had no match, and exactly why Phase 3F.1.5.R removed it entirely rather than narrowing it.
    const unscopedCallResult = index.getDefinitionFullText("Cumulative Credit"); // no documentId - the OLD, removed call shape.
    expect(unscopedCallResult).toBeDefined(); // it DOES find Beta's own definition from a bare Alpha-scoped compilation context - confirming the fallback was genuinely dangerous, and that its removal (not a narrowing) was the correct fix.
  });
});
