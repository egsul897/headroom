/**
 * Phase 3E §156 Layer C synthetic tests - ai-inventory.ts, using a scripted
 * fake StageCaller (no network, no real credential), mirroring
 * semantic-verification-reviewer.test.ts's own established fake-caller
 * pattern.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { runBoundedAiInventoryForRegion } from "../../lib/contract-model/compiler/semantic-coverage/ai-inventory";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { MaterialSemanticUnit, RoutedRegion } from "../../lib/contract-model/compiler/semantic-coverage/types";

function fakeCaller(response: () => unknown, opts: { throws?: boolean } = {}): StageCaller {
  return {
    providerName: "test-provider",
    model: "test-model",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>): Promise<T> {
      if (opts.throws) throw new Error("simulated provider failure");
      return schema.parse(response());
    },
    lastTelemetry: () => null,
  };
}

const REGION_TEXT = 'The Borrower shall not incur any Indebtedness, provided that the Borrower may incur Indebtedness in an amount equal to the Available Amount so long as no Default has occurred.';

const REGION: RoutedRegion = {
  regionId: "region-1",
  documentId: "doc-1",
  structuralNodeKey: "doc-1::6.01",
  sectionRef: "6.01",
  charStart: 0,
  charEnd: REGION_TEXT.length,
  excerptText: REGION_TEXT,
  detectedSignals: ["shall_not"],
  admissionReasons: ["INDEPENDENT_SIGNAL"],
  fromRawSourceFallback: false,
  routingAlgorithmVersion: "test",
  closureDepth: 0,
  closureSourceNodeKey: null,
};

const CTX = { companyId: "test-co", packageKey: "test-pkg", instrumentKey: null, operativeVersionRef: null, headingHint: "Section 6.01 Indebtedness" };

describe("Phase 3E Layer C - runBoundedAiInventoryForRegion", () => {
  it("accepts a proposed unit whose sourceQuote is a real verbatim substring of the region text", async () => {
    const caller = fakeCaller(() => ({
      proposedUnits: [
        {
          sourceQuote: "an amount equal to the Available Amount",
          postureSignal: "PERMISSION_SIGNAL",
          materiality: "CRITICAL",
          whyDeterministicLayerMightMiss: "no $ or % character - a prose-described formula basket",
          reasoning: "this permits Indebtedness up to a formula-based amount with no fixed dollar figure",
        },
      ],
      overallNotes: [],
    }));

    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.failed).toBe(false);
    expect(result.rejectedUnverifiableQuotes).toBe(0);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.excerptText).toContain("Available Amount");
    expect(result.units[0]!.postureSignal).toBe("PERMISSION_SIGNAL");
    expect(result.units[0]!.detectionMethod).toBe("BOUNDED_AI_INVENTORY");
  });

  it("rejects (does not fabricate a unit from) a quote that does not appear in the real source text - the anti-hallucination gate", async () => {
    const caller = fakeCaller(() => ({
      proposedUnits: [
        {
          sourceQuote: "a completely invented sentence never present in the source",
          postureSignal: "PERMISSION_SIGNAL",
          materiality: "CRITICAL",
          whyDeterministicLayerMightMiss: "hallucinated",
          reasoning: "hallucinated",
        },
      ],
      overallNotes: [],
    }));

    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.failed).toBe(false);
    expect(result.rejectedUnverifiableQuotes).toBe(1);
    expect(result.units).toHaveLength(0);
  });

  it("tolerates an out-of-vocabulary enum value via normalization rather than crashing", async () => {
    const caller = fakeCaller(() => ({
      proposedUnits: [{ sourceQuote: "no Default has occurred", postureSignal: "some new posture", materiality: "super important", whyDeterministicLayerMightMiss: "x", reasoning: "y" }],
      overallNotes: [],
    }));
    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.postureSignal).toBe("UNCLEAR_SIGNAL");
    expect(result.units[0]!.materiality).toBe("REVIEW_UNCERTAIN");
  });

  it("returns an empty, non-failed result when the model proposes nothing - a common, valid outcome", async () => {
    const caller = fakeCaller(() => ({ proposedUnits: [], overallNotes: ["deterministic pass already captured everything material"] }));
    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.failed).toBe(false);
    expect(result.units).toHaveLength(0);
  });

  it("surfaces a provider failure as failed:true rather than throwing", async () => {
    const caller = fakeCaller(() => ({}), { throws: true });
    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.failed).toBe(true);
    expect(result.failureDetail).toBeTruthy();
    expect(result.units).toHaveLength(0);
  });

  it("classifies the accepted unit's family via the supplied headingHint", async () => {
    const caller = fakeCaller(() => ({
      proposedUnits: [{ sourceQuote: "no Default has occurred", postureSignal: "CONDITION_ONLY_SIGNAL", materiality: "MATERIAL", whyDeterministicLayerMightMiss: "x", reasoning: "y" }],
      overallNotes: [],
    }));
    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, [], CTX, caller);
    expect(result.units[0]!.family).toBe("INDEBTEDNESS");
  });

  it("FAULT INJECTION: drops a proposed unit that restates an already-found unit despite the prompt's own instruction not to - the model ignoring that instruction must not double-count the same source text as two units", async () => {
    const alreadyFound: MaterialSemanticUnit[] = [
      {
        semanticUnitId: "existing-1",
        companyId: "test-co",
        packageKey: "test-pkg",
        instrumentKey: null,
        operativeVersionRef: null,
        granularity: "SEMANTIC_UNIT",
        anchors: [],
        family: "INDEBTEDNESS",
        familyEvidence: null,
        postureSignal: "PROHIBITION_SIGNAL",
        materiality: "MATERIAL",
        materialityReasoning: "test",
    contextuallyElevated: false,
        excerptText: "The Borrower shall not incur any Indebtedness",
        detectedSignals: ["shall_not"],
        fromRawSourceFallback: false,
        detectionMethod: "STRUCTURAL_HYPOTHESIS",
        aiInventoryPromptVersion: null,
        confidence: "HIGH",
        uncertaintyReasons: [],
        inventoryAlgorithmVersion: "test",
        provenance: "test",
      },
    ];
    const caller = fakeCaller(() => ({
      proposedUnits: [
        { sourceQuote: "The Borrower shall not incur any Indebtedness", postureSignal: "PROHIBITION_SIGNAL", materiality: "MATERIAL", whyDeterministicLayerMightMiss: "restated despite instruction", reasoning: "duplicate" },
        { sourceQuote: "an amount equal to the Available Amount", postureSignal: "PERMISSION_SIGNAL", materiality: "CRITICAL", whyDeterministicLayerMightMiss: "genuinely new", reasoning: "genuinely new unit" },
      ],
      overallNotes: [],
    }));
    const result = await runBoundedAiInventoryForRegion(REGION, REGION_TEXT, alreadyFound, CTX, caller);
    expect(result.rejectedDuplicatesOfAlreadyFound).toBe(1);
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.excerptText).toContain("Available Amount");
  });
});
