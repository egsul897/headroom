/**
 * Foundation Audit (Section 19) - Part 1: Systematic Fault Injection,
 * discovery layer (lib/contract-model/compiler/discovery/*). Verifies
 * Phase 2F.2's per-section fault isolation still holds post-3F.1.2's
 * nodeId migration, and that Pass B's tolerant-boundary role/family
 * normalization handles a genuinely out-of-vocabulary AI response without
 * crashing the section (invariant 36).
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { runDiscoveryPipeline } from "../../lib/contract-model/compiler/discovery/pipeline";
import { runPassBSemanticClassification } from "../../lib/contract-model/compiler/discovery/pass-b-semantic";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";

const DOC = "audit-g-discovery-doc";
const TEXT =
  "ARTICLE 6 NEGATIVE COVENANTS General provisions. " +
  "Section 6.01. Indebtedness. The Company shall not incur Indebtedness, except: (a) the Senior Obligations not to exceed $5,000,000; (b) other Indebtedness. " +
  "Section 6.02. Liens. The Company shall not grant Liens, except Permitted Liens not to exceed $1,000,000. " +
  "Section 6.03. Restricted Payments. The Company shall not make Restricted Payments in excess of 10% of Consolidated EBITDA.";

function buildFakeCaller(behavior: (stage: string, userContent: string) => unknown): StageCaller {
  return {
    providerName: "audit-fake",
    model: "audit-fake-v1",
    isSynthetic: false,
    async call<T>(schema: ZodType<T>, stage: string, _system: string, userContent: string): Promise<T> {
      const raw = behavior(stage, userContent);
      if (raw instanceof Error) throw raw;
      return schema.parse(raw);
    },
    lastTelemetry: () => null,
  };
}

describe("Fault: discovery section crash (Phase 2F.2 fault isolation, re-verified post-3F.1.2 nodeId migration)", () => {
  it("one section's Pass B call throwing does not abort the other sections - failure is recorded, other sections still produce candidates", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC, label: "CA", text: TEXT });
    const index = buildStructuralIndex(new Map([[DOC, { text: TEXT, nodes }]]), [], []);

    const caller = buildFakeCaller((_stage, userContent) => {
      if (userContent.includes("Section: 6.02")) {
        throw new Error("audit-injected: simulated provider outage for section 6.02");
      }
      // Non-6.02 sections return one plausible rule each so we can confirm they were NOT aborted.
      return { rules: [{ relativeRef: "", families: [], role: "GENERAL_PROHIBITION", description: "audit fixture rule", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.8, needsReview: false }] };
    });

    const result = await runDiscoveryPipeline(caller, DOC, index);
    expect(result.summary.sectionsAttempted).toBeGreaterThanOrEqual(2); // 6.01 and 6.02 both have Pass-A signals ($ amounts / prohibitions)
    expect(result.summary.sectionFailures).toHaveLength(1);
    expect(result.summary.sectionFailures[0]!.sectionRef).toBe("6.02");
    expect(result.summary.sectionFailures[0]!.errorMessage).toContain("audit-injected");
    // A section other than 6.02 must still have produced a candidate - proof the failure was isolated, not global.
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.sectionRef !== "6.02" || false)).toBe(true);
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_PARTIAL"); // some, not all, sections failed
  });

  it("EVERY attempted section failing correctly downgrades health to DISCOVERY_FAILED (not silently HEALTHY)", async () => {
    const nodes = parseDocumentStructure({ documentId: DOC, label: "CA", text: TEXT });
    const index = buildStructuralIndex(new Map([[DOC, { text: TEXT, nodes }]]), [], []);
    const caller = buildFakeCaller(() => new Error("audit-injected: total provider outage"));
    const result = await runDiscoveryPipeline(caller, DOC, index);
    expect(result.summary.sectionFailures.length).toBe(result.summary.sectionsAttempted);
    expect(result.summary.documentDiscoveryHealth).toBe("DISCOVERY_FAILED");
    expect(result.candidates).toHaveLength(0); // fails closed: zero fabricated candidates when discovery entirely failed.
  });
});

describe("Fault: malformed AI output - role/family enum value outside known vocabulary (Pass B normalization boundary)", () => {
  it("a genuinely unknown role string is tolerated (schema-level, task's tolerant wire schema) and normalized to a safe fallback with needsReview forced true - never an uncaught schema-validation crash", async () => {
    const caller = buildFakeCaller(() => ({
      rules: [
        {
          relativeRef: "(z)",
          families: ["NOT_A_REAL_COVENANT_FAMILY_AUDIT_INJECTED"],
          role: "TOTALLY_MADE_UP_ROLE_AUDIT_INJECTED",
          description: "audit-injected out-of-vocabulary AI output",
          multipleRulesLikely: false,
          definedTermDependencyLikely: false,
          confidence: 0.5,
          needsReview: false, // model itself claims no review needed - normalization must override this.
        },
      ],
    }));
    const result = await runPassBSemanticClassification(caller, { documentId: DOC, sectionNodeKey: `${DOC}::6.01`, sectionNodeId: "n1", sectionRef: "6.01", heading: "Indebtedness", text: "irrelevant", passAHints: [] });
    expect(result.rules).toHaveLength(1);
    const rule = result.rules[0]!;
    expect(rule.roleNormalizationStatus === "FALLBACK_REVIEW_REQUIRED" || rule.roleNormalizationStatus === "INVALID_UNUSABLE").toBe(true);
    expect(rule.needsReview).toBe(true); // task §9's own override held: the model's own needsReview:false is overridden by the normalization boundary.
    expect(rule.familiesNormalizationStatus === "FALLBACK_REVIEW_REQUIRED" || rule.familiesNormalizationStatus === "INVALID_UNUSABLE" || rule.families.length === 0).toBe(true);
    // Confirms invariant 36 (a degraded parsing boundary degrades to an honest "unknown" plus a review flag, never crashes) holds for THIS specific boundary post-3F.1.2.
  });

  it("a raw AI response with role/families of the WRONG TYPE (e.g. role as a number) fails the schema and propagates as an error - confirms z.string() on `role` is still a hard type boundary, not fully tolerant", async () => {
    const caller = buildFakeCaller(() => ({
      rules: [{ relativeRef: "(a)", families: [], role: 12345, description: "audit-injected wrong-typed role", multipleRulesLikely: false, definedTermDependencyLikely: false, confidence: 0.5, needsReview: false }],
    }));
    await expect(runPassBSemanticClassification(caller, { documentId: DOC, sectionNodeKey: `${DOC}::6.01`, sectionNodeId: "n1", sectionRef: "6.01", heading: "Indebtedness", text: "irrelevant", passAHints: [] })).rejects.toThrow();
    // This IS caught one layer up by discovery/pipeline.ts's per-section try/catch (see the section-crash test above) - so in the real
    // pipeline this degrades to a recorded DiscoverySectionFailure, not a document-wide crash. Documented here as the boundary between
    // "tolerant string boundary" (role as any string) and "still a hard type failure" (role as a non-string).
  });
});
