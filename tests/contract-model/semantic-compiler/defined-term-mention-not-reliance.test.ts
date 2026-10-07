/**
 * A capitalized act name retrieved as a context definition is a mention.
 * normalizeSubmission does not invent a DEFINED_TERM_REFERENCE for it.
 * A compiled term node is reliance: the source contract then closes over
 * that definition's DEPENDS_ON_DEFINITION edges. A node the wire already
 * submitted is kept.
 *
 * The fixture names are synthetic. They are not a section special case.
 */
import { describe, expect, it } from "vitest";
import { collectDefinedTermReferences } from "../../../lib/contract-model/covenant-map/assemble";
import type { ContextItem, DependencyEdge } from "../../../lib/contract-model/compiler/context-retrieval/types";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import type { SubmitCompilationInput, WireRule } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { computeSemanticSourceContract } from "../../../lib/contract-model/phase3-certification/semantic-source-contract";
import type { IRRule } from "../../../lib/contract-model/ir/types";
import { emptyContextBundle, TEST_DOCUMENT_ID, testCompilerInput } from "./test-helpers";

const OPERATIVE = "the Conveyance of surplus or damaged equipment in the ordinary course of business";
const OPERATIVE_ID = "item-operative";
const CONVEYANCE_ID = "item-conveyance";
const ASSET_ID = "item-asset";

function item(partial: Pick<ContextItem, "itemId" | "type" | "normalizedRef" | "excerptText">): ContextItem {
  return {
    documentId: TEST_DOCUMENT_ID,
    structuralNodeKey: null,
    structuralNodeId: null,
    sourceCitation: partial.normalizedRef,
    reason: "fixture",
    retrievalDepth: 0,
    retrievalPath: [],
    retrievalMethod: "DEFINITION_INDEX",
    confidence: 1,
    ...partial,
  };
}

function bundle() {
  const items = [
    item({ itemId: OPERATIVE_ID, type: "OPERATIVE_SOURCE", normalizedRef: "9.07(a)", excerptText: OPERATIVE }),
    item({ itemId: CONVEYANCE_ID, type: "DEFINITION", normalizedRef: "Conveyance", excerptText: "\"Conveyance\" means any sale or transfer of an Asset." }),
    item({ itemId: ASSET_ID, type: "DEFINITION_DEPENDENCY", normalizedRef: "Asset", excerptText: "\"Asset\" means any property." }),
  ];
  const edges: DependencyEdge[] = [
    { fromItemId: OPERATIVE_ID, toItemId: CONVEYANCE_ID, edgeType: "DEPENDS_ON_DEFINITION", reason: "Directly used defined term." },
    { fromItemId: CONVEYANCE_ID, toItemId: ASSET_ID, edgeType: "DEPENDS_ON_DEFINITION", reason: "Transitive definition dependency." },
  ];
  return emptyContextBundle({ items, edges, normalizedSourceRef: "9.07(a)" });
}

function rule(partial: Partial<WireRule> = {}): WireRule {
  return {
    localRef: "r1",
    sourceSectionRef: "9.07(a)",
    covenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS",
    ruleType: "EXCEPTION",
    posture: "PERMISSION",
    action: "SELL_ASSET",
    entityScope: [],
    entityScopeExcluded: [],
    capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: null },
    conditions: [{
      conditionType: "ORDINARY_COURSE_OF_BUSINESS",
      expression: null,
      referencesDefinitionId: null,
      description: "The exception for the transfer of surplus or damaged equipment applies only if the transfer occurs in the ordinary course of business",
      citation: "§9.07(a)",
      excerpt: "in the ordinary course of business",
    }],
    exceptions: [],
    dependsOn: [],
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    citation: "§9.07(a)",
    excerpt: OPERATIVE,
    ...partial,
  } as WireRule;
}

function compile(wire: WireRule) {
  const submission: SubmitCompilationInput = { rules: [wire], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [] };
  const contextBundle = bundle();
  return {
    contextBundle,
    normalized: normalizeSubmission(submission, testCompilerInput({ operativeSourceText: OPERATIVE, sourceSectionRef: "9.07(a)", contextBundle })),
  };
}

function termNames(ruleOut: IRRule): string[] {
  return collectDefinedTermReferences({
    capacityExpression: ruleOut.capacityExpression,
    conditions: ruleOut.conditions,
    exceptions: ruleOut.exceptions,
    transactionScope: ruleOut.transactionScope,
  }).map((term) => term.termName);
}

function reliedDefinitionRefs(ruleOut: IRRule, contextBundle: ReturnType<typeof bundle>) {
  const contract = computeSemanticSourceContract({
    operativeSourceVersion: "probe",
    operativeIdentityStrength: "STRONG",
    candidateSectionRef: "9.07(a)",
    bundle: contextBundle,
    units: { rules: [ruleOut], definitions: [], sharedCapacities: [] },
    toolCallLog: [],
    operativeLineage: null,
    appliedEffectIds: [],
    asOfDate: null,
  });
  return {
    definedTerms: contract.reliedUpon.definedTerms,
    refs: contract.reliedUpon.contextItems
      .filter((entry) => entry.type === "DEFINITION" || entry.type === "DEFINITION_DEPENDENCY")
      .map((entry) => `${entry.type}:${entry.normalizedRef}`)
      .sort(),
  };
}

describe("defined-term mention is not synthesized into reliance", () => {
  it("leaves a capitalized act name unreferenced when the wire did not emit a term node", () => {
    const { normalized, contextBundle } = compile(rule());
    const out = normalized.rules[0]!;
    expect(normalized.definitions).toEqual([]);
    expect(termNames(out)).toEqual([]);
    expect(out.conditions.every((condition) => condition.expression === null)).toBe(true);
    expect(out.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
    expect(reliedDefinitionRefs(out, contextBundle)).toEqual({ definedTerms: [], refs: [] });
  });

  it("keeps a DEFINED_TERM_REFERENCE the wire already submitted, and that node is reliance", () => {
    const { normalized, contextBundle } = compile(rule({
      capacityExpression: {
        kind: "UNLIMITED_CAPACITY",
        gatedBy: { kind: "DEFINED_TERM_REFERENCE", termName: "Conveyance" },
      },
      conditions: [],
    }));
    const out = normalized.rules[0]!;
    expect(termNames(out)).toEqual(["Conveyance"]);
    expect(reliedDefinitionRefs(out, contextBundle)).toEqual({
      definedTerms: ["conveyance"],
      refs: ["DEFINITION:Conveyance", "DEFINITION_DEPENDENCY:Asset"],
    });
  });
});
