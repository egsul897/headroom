/**
 * Phase 2F.2 §14 (16 required synthetic scenarios) + §15 (bounded,
 * deterministic formatting-robustness checks). Exercises the real
 * production tolerant-boundary/normalization/fault-isolation code added
 * by this task - normalization.ts, pass-b-semantic.ts's wire schema +
 * normalizeWireItem, and pipeline.ts's per-section fault isolation - never
 * a mock of the normalization logic itself. All fixture text is invented
 * (generic legal-drafting phrasing modeled on the real Document B evidence
 * shapes recorded in tests/fixtures/unseen-packages/phase-2f-freeze/
 * phase-2f2/baseline-diagnostic.json, never CONMED-specific verbatim text).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { normalizeDiscoveryRole, normalizeDiscoveryFamily, normalizeDiscoveryFamilies } from "../../lib/contract-model/compiler/discovery/normalization";
import { SemanticSectionResultSchema, runPassBSemanticClassification, type SectionBatchInput } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import { runPassCNeighborhoodExpansion } from "../../lib/contract-model/compiler/discovery/pass-c-neighborhood";
import { runPassDReconciliation } from "../../lib/contract-model/compiler/discovery/pass-d-reconcile";
import { runDiscoveryPipeline, classifyDiscoveryHealth } from "../../lib/contract-model/compiler/discovery/pipeline";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../../lib/contract-model/analyzer/telemetry";

/** Test-only mock StageCaller - lets pipeline-level tests control exactly which section calls succeed/fail/return what, without a real LLM call. Implements the real StageCaller interface, not a partial stand-in. */
class ScriptedStageCaller implements StageCaller {
  providerName = "test-scripted";
  model = "test-v1";
  isSynthetic = true;
  private callIndex = 0;
  constructor(private scripts: Array<(content: string) => unknown>) {}
  async call<T>(schema: ZodType<T>, _stage: string, _systemPrompt: string, content: string): Promise<T> {
    const script = this.scripts[this.callIndex];
    this.callIndex++;
    if (!script) throw new Error("ScriptedStageCaller: no script left for this call");
    const result = script(content);
    if (result instanceof Error) throw result;
    return schema.parse(result);
  }
  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

function indexFor(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const nodesByDocument = new Map([[documentId, { text, nodes }]]);
  return buildStructuralIndex(nodesByDocument, [], []);
}

describe("Phase 2F.2 §14 - 16 required discovery schema-robustness scenarios", () => {
  it("1. exact canonical enum value normalizes as VALID_CANONICAL with no change", () => {
    const result = normalizeDiscoveryRole("BASKET");
    expect(result).toEqual({ canonical: "BASKET", status: "VALID_CANONICAL", rawValue: "BASKET", reason: expect.any(String) });
  });

  it("2. lowercase variant of a canonical value normalizes to the same canonical role", () => {
    const result = normalizeDiscoveryRole("basket");
    expect(result.canonical).toBe("BASKET");
    expect(result.status).toBe("NORMALIZED_CANONICAL");
  });

  it("3. punctuation/spacing variant of a canonical value normalizes correctly", () => {
    const result = normalizeDiscoveryRole("General-Prohibition");
    expect(result.canonical).toBe("GENERAL_PROHIBITION");
    expect(result.status).toBe("NORMALIZED_CANONICAL");
  });

  it("4. a documented short-word alias ('grants') normalizes to SECURITY_GRANT", () => {
    const result = normalizeDiscoveryRole("grants");
    expect(result.canonical).toBe("SECURITY_GRANT");
    expect(result.status).toBe("NORMALIZED_CANONICAL");
  });

  it("5. unknown-but-relevant family value does not crash - dropped from canonical families, preserved for review", () => {
    const result = normalizeDiscoveryFamily("Guarantee And Collateral Matters");
    expect(result.canonical).toBeNull();
    expect(result.status).toBe("FALLBACK_REVIEW_REQUIRED");
    expect(result.rawValue).toBe("Guarantee And Collateral Matters");
  });

  it("6. unknown role expressed as a full descriptive sentence (the real Document B failure shape) normalizes via keyword classification, not a crash", () => {
    const result = normalizeDiscoveryRole("imposes an unconditional, irrevocable joint and several guarantee of payment and performance of Primary Obligations");
    expect(result.canonical).toBe("GUARANTEE_OBLIGATION");
    expect(result.status).toBe("NORMALIZED_CANONICAL");
  });

  it("7. one invalid candidate among valid siblings in the same batch - none of the batch is lost", async () => {
    const caller = new ScriptedStageCaller([
      () => ({
        rules: [
          { relativeRef: "(a)", families: [], role: "BASKET", description: "valid sibling one", confidence: 0.9 },
          { relativeRef: "(b)", families: [], role: "this is not a recognizable role at all zzz", description: "the invalid one", confidence: 0.9 },
          { relativeRef: "(c)", families: [], role: "EXCEPTION", description: "valid sibling two", confidence: 0.9 },
        ],
      }),
    ]);
    const batch: SectionBatchInput = { documentId: "d1", sectionNodeKey: "d1::6.01", sectionRef: "6.01", heading: "Indebtedness", text: "text", passAHints: [] };
    const result = await runPassBSemanticClassification(caller, batch);
    expect(result.rules).toHaveLength(3);
    expect(result.rules[0]!.role).toBe("BASKET");
    expect(result.rules[0]!.roleNormalizationStatus).toBe("VALID_CANONICAL");
    expect(result.rules[1]!.role).toBe("OTHER_RELEVANT_RULE");
    expect(result.rules[1]!.roleNormalizationStatus).toBe("FALLBACK_REVIEW_REQUIRED");
    expect(result.rules[2]!.role).toBe("EXCEPTION");
    expect(result.rules[2]!.roleNormalizationStatus).toBe("VALID_CANONICAL");
  });

  it("8. a batch with multiple different aliases all normalize correctly within the same call", async () => {
    const caller = new ScriptedStageCaller([
      () => ({
        rules: [
          { relativeRef: "", role: "excepts", description: "r1", confidence: 0.8 },
          { relativeRef: "", role: "grants", description: "r2", confidence: 0.8 },
          { relativeRef: "", role: "permits", description: "r3", confidence: 0.8 },
        ],
      }),
    ]);
    const batch: SectionBatchInput = { documentId: "d1", sectionNodeKey: "d1::3", sectionRef: "3", heading: "Grant of Security Interest", text: "text", passAHints: [] };
    const result = await runPassBSemanticClassification(caller, batch);
    expect(result.rules.map((r) => r.role)).toEqual(["EXCEPTION", "SECURITY_GRANT", "PERMISSION"]);
    expect(result.rules.every((r) => r.roleNormalizationStatus === "NORMALIZED_CANONICAL")).toBe(true);
  });

  it("9. the exact raw model string is preserved verbatim regardless of normalization outcome", () => {
    const raw = "Excepts.";
    const result = normalizeDiscoveryRole(raw);
    expect(result.rawValue).toBe(raw);
  });

  it("10. normalization status/raw value provenance persists all the way through Pass B -> Pass C -> Pass D into the final DiscoveredCandidate", () => {
    const index = indexFor("d1", "Section 3. Grant of Security Interest. The Grantor hereby grants a security interest in the Collateral.");
    const section = index.getNodeByRef("d1", "3")!;
    const items = [
      {
        relativeRef: "",
        families: [],
        role: "SECURITY_GRANT" as const,
        roleRaw: "grants",
        roleNormalizationStatus: "NORMALIZED_CANONICAL" as const,
        familiesRaw: [],
        familiesNormalizationStatus: "VALID_CANONICAL" as const,
        description: "grants a security interest",
        multipleRulesLikely: false,
        definedTermDependencyLikely: false,
        confidence: 0.8,
        needsReview: false,
      },
    ];
    const { candidates: expanded, discoveryId } = runPassCNeighborhoodExpansion(index, "d1", section.nodeKey, "3", items, "v1");
    const { candidates } = runPassDReconciliation({ documentId: "d1", discoveryRunVersion: "v1", expanded, discoveryId, deterministicByNodeKey: new Map() });
    const found = candidates.find((c) => c.role === "SECURITY_GRANT")!;
    expect(found).toBeDefined();
    expect(found.roleRaw).toBe("grants");
    expect(found.roleNormalizationStatus).toBe("NORMALIZED_CANONICAL");
  });

  it("11. a FALLBACK_REVIEW_REQUIRED normalization forces needsReview=true even when the model itself said needsReview:false", async () => {
    const caller = new ScriptedStageCaller([
      () => ({ rules: [{ relativeRef: "", role: "an entirely novel unclassifiable characterization", description: "r1", confidence: 0.9, needsReview: false }] }),
    ]);
    const batch: SectionBatchInput = { documentId: "d1", sectionNodeKey: "d1::1", sectionRef: "1", heading: "H", text: "text", passAHints: [] };
    const result = await runPassBSemanticClassification(caller, batch);
    expect(result.rules[0]!.roleNormalizationStatus).toBe("FALLBACK_REVIEW_REQUIRED");
    expect(result.rules[0]!.needsReview).toBe(true);
  });

  it("12. a malformed non-string field is still rejected by the wire schema - tolerance is scoped to role/families only, not a blanket loosening", () => {
    const parsed = SemanticSectionResultSchema.safeParse({ rules: [{ relativeRef: "", role: 12345, description: "x", confidence: 0.5 }] });
    expect(parsed.success).toBe(false);
  });

  it("13. genuinely unusable (empty/whitespace-only) raw role remains explicitly INVALID_UNUSABLE, not silently treated as a normal fallback", () => {
    const result = normalizeDiscoveryRole("   ");
    expect(result.status).toBe("INVALID_UNUSABLE");
    expect(result.canonical).toBe("OTHER_RELEVANT_RULE");
  });

  it("14. an empty candidate response (zero rules) is handled without error and without fabricating a candidate", async () => {
    const caller = new ScriptedStageCaller([() => ({ rules: [] })]);
    const batch: SectionBatchInput = { documentId: "d1", sectionNodeKey: "d1::1", sectionRef: "1", heading: "H", text: "text", passAHints: [] };
    const result = await runPassBSemanticClassification(caller, batch);
    expect(result.rules).toEqual([]);
  });

  it("15. a role value containing stray JSON-like/quoted text around the real characterization still normalizes deterministically without crashing", () => {
    const raw = 'Note: {"suggested":"BASKET"} but this section actually waives notice and presentment requirements';
    const result = normalizeDiscoveryRole(raw);
    expect(result.rawValue).toBe(raw);
    expect(result.canonical).toBe("WAIVER");
    expect(result.status).toBe("NORMALIZED_CANONICAL");
  });

  it("16. one section's Pass B call throwing does not abort the rest of the document - the other sections' candidates survive and the failure is recorded, not silently swallowed", async () => {
    const text = [
      "Section 1. Guarantee. The Guarantor hereby guarantees payment of the Obligations.",
      "Section 2. Waiver. Notwithstanding any other provision, the Guarantor waives notice, presentment, and protest.",
      "Section 3. Representations. Each Guarantor represents that it has full power and authority, provided that such representation is made only as of the Closing Date.",
    ].join(" ");
    const index = indexFor("d1", text);
    const caller = new ScriptedStageCaller([
      () => ({ rules: [{ relativeRef: "", role: "GUARANTEE_OBLIGATION", description: "guarantees payment", confidence: 0.9 }] }),
      () => new Error("simulated unrecoverable Pass B failure for section 2"),
      () => ({ rules: [{ relativeRef: "", role: "REPRESENTATION", description: "represents authority", confidence: 0.9 }] }),
    ]);
    const result = await runDiscoveryPipeline(caller, "d1", index);
    expect(result.summary.sectionFailures).toHaveLength(1);
    expect(result.summary.sectionFailures[0]!.sectionRef).toBe("2");
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_PARTIAL");
    expect(result.candidates.some((c) => c.role === "GUARANTEE_OBLIGATION")).toBe(true);
    expect(result.candidates.some((c) => c.role === "REPRESENTATION")).toBe(true);
  });
});

describe("Phase 2F.2 §15 - bounded, deterministic formatting-robustness (never arbitrary fuzzy mapping)", () => {
  const canonicalSamples: Array<[string]> = [["BASKET"], ["GENERAL_PROHIBITION"], ["RATIO_BASED_PERMISSION"], ["DEFINITIONAL_DEPENDENCY_CANDIDATE"], ["SECURITY_GRANT"]];
  const transforms: Array<(s: string) => string> = [
    (s) => s.toLowerCase(),
    (s) => s.replace(/_/g, " "),
    (s) => s.replace(/_/g, "-"),
    (s) => s.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" "),
    (s) => `  ${s}  `,
  ];

  for (const [canonical] of canonicalSamples) {
    for (const transform of transforms) {
      const variant = transform(canonical);
      it(`"${variant}" normalizes deterministically to ${canonical}`, () => {
        const result = normalizeDiscoveryRole(variant);
        expect(result.canonical).toBe(canonical);
        expect(["VALID_CANONICAL", "NORMALIZED_CANONICAL"]).toContain(result.status);
      });
    }
  }

  it("repeated calls with the identical raw input always produce the identical result - deterministic, not randomized", () => {
    const raw = "Excepts";
    const results = Array.from({ length: 5 }, () => normalizeDiscoveryRole(raw));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it("normalizeDiscoveryFamilies aggregates status correctly across a mix of valid/normalized/dropped values", () => {
    const result = normalizeDiscoveryFamilies(["GUARANTEES", "collateral_security", "totally-unknown-concept"]);
    expect(result.canonical).toEqual(expect.arrayContaining(["GUARANTEES", "COLLATERAL_SECURITY"]));
    expect(result.droppedRawValues).toEqual(["totally-unknown-concept"]);
    expect(result.status).toBe("FALLBACK_REVIEW_REQUIRED");
  });

  it("classifyDiscoveryHealth: zero attempted or zero failures is HEALTHY, partial failures is PARTIAL, total failure is FAILED", () => {
    expect(classifyDiscoveryHealth(0, [])).toBe("DISCOVERY_HEALTHY");
    expect(classifyDiscoveryHealth(3, [])).toBe("DISCOVERY_HEALTHY");
    expect(classifyDiscoveryHealth(3, [{ sectionNodeKey: "k", sectionRef: "1", stage: "PASS_B_SEMANTIC_CLASSIFICATION", errorMessage: "x" }])).toBe("DISCOVERY_PARTIAL");
    expect(
      classifyDiscoveryHealth(2, [
        { sectionNodeKey: "k1", sectionRef: "1", stage: "PASS_B_SEMANTIC_CLASSIFICATION", errorMessage: "x" },
        { sectionNodeKey: "k2", sectionRef: "2", stage: "PASS_B_SEMANTIC_CLASSIFICATION", errorMessage: "x" },
      ])
    ).toBe("DISCOVERY_FAILED");
  });
});
