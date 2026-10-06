/**
 * Pass-A gap-call localRef reliability (Phase 3 reliability gate).
 *
 * Live §7.5(j) lost both gap re-inventory payloads because Zod rejected localRef/parentRef
 * longer than 6 chars (provider structured outputs do not constrain maxLength). This suite
 * proves the offline remediation: certified bound 24, prompt states it, over-long handles
 * coerce to a stable digest so parentRef still resolves, and a scripted gap call with
 * section-shaped refs longer than 6 is accepted end-to-end.
 *
 * Zero provider calls. Algorithm version stays semantic-accountability.v8.
 */
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import { runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { CERTIFIED_INVENTORY_EXECUTION_POLICY, CERTIFIED_INVENTORY_WIRE_BOUNDS } from "../../../lib/contract-model/compiler/semantic-accountability/inventory-policy";
import { buildInventorySystemPrompt } from "../../../lib/contract-model/compiler/semantic-accountability/prompt";
import {
  INVENTORY_WIRE_SCHEMA_VERSION,
  WireInventoryItemSchema,
  buildSubmitSemanticInventorySchema,
  coerceInventoryLocalRef,
} from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { StageCallOptions, StageCaller } from "../../../lib/contract-model/compiler/llm-caller";

const POLICY = CERTIFIED_INVENTORY_EXECUTION_POLICY;
const B = CERTIFIED_INVENTORY_WIRE_BOUNDS;

function unit() {
  // Same structural shape as pass-a-bounds: a numbered exception clause under SECTION 7.01.
  const text = [
    "CREDIT AGREEMENT dated as of January 1, 2026.",
    "",
    "ARTICLE VII NEGATIVE COVENANTS",
    "",
    "SECTION 7.01 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:",
    "",
    "(a) Indebtedness under the Loan Documents;",
    "",
    "(b) any Disposition of Property or business which yields net proceeds to the Borrower in an aggregate amount not to exceed $25,000,000; provided that no Default has occurred and is continuing;",
    "",
    "SECTION 7.02 Liens . The Borrower shall not create any Lien.",
    "",
  ].join("\n");
  const index = buildTestIndex([{ documentId: "d", label: "D", text }]);
  const r = index.resolveUniqueNodeByRef("d", "7.01(b)");
  if (r.status !== "UNIQUE") throw new Error(`7.01(b): ${r.status}`);
  const op = index.getNodeText(r.node.nodeId, "DESCENDANTS");
  const sc = resolveSourceContext({
    index,
    documentId: "d",
    operativeSourceText: op,
    anchorNodeId: r.node.nodeId,
    operativeCharStart: r.node.charStart,
    documentText: text,
  });
  // Accountability inventory runs over OPERATIVE regions only for this synthetic unit.
  const accountability = { ...sc, regions: sc.regions.filter((x) => x.kind === "OPERATIVE") };
  return { index, sc: accountability, op };
}

interface Captured { stage: string; schema: ZodType<unknown>; system: string; user: string; options: StageCallOptions | undefined }

function scriptedGapFriendly(): StageCaller & { captured: Captured[] } {
  const captured: Captured[] = [];
  return {
    providerName: "scripted",
    model: "scripted-localref",
    isSynthetic: false,
    captured,
    async call(schema, stage, system, user, options) {
      captured.push({ stage, schema: schema as ZodType<unknown>, system, user, options });
      // First pass: cover only a short lead-in so coverage leaves residue and triggers a gap call.
      // Gap pass: return items with section-shaped localRef/parentRef LONGER than the old 6-char ceiling
      // (the live failure mode) but within the new 24-char bound.
      if (stage === "semantic_inventory_gap") {
        const longParent = "r7_05j_parent"; // 13 chars
        const longChild = "r7_05j_child1"; // 13 chars
        return schema.parse({
          items: [
            {
              localRef: longParent,
              excerpt: "any Disposition of Property or business which yields net proceeds to the Borrower in an aggregate amount not to exceed $25,000,000",
              semanticRole: "PERMISSION",
              proposition: "disposition permission",
              materiality: "CRITICAL",
              operative: "OPERATIVE",
              parentRef: null,
              relatedRefs: [],
              quantitativeValues: [],
              referencedTerms: [],
              referencedSections: [],
            },
            {
              localRef: longChild,
              excerpt: "provided that no Default has occurred and is continuing",
              semanticRole: "CONDITION",
              proposition: "net proceeds condition",
              materiality: "MATERIAL",
              operative: "OPERATIVE",
              parentRef: longParent,
              relatedRefs: [longParent],
              quantitativeValues: [],
              referencedTerms: [],
              referencedSections: [],
            },
          ],
        });
      }
      // First pass: return nothing so deterministic coverage leaves residue and triggers the gap call.
      return schema.parse({ items: [] });
    },
    lastTelemetry: () => null,
  };
}

describe("Pass A localRef reliability (gap-call wire bound)", () => {
  it("certified localRefChars is 24 and wire schema version is v3; algorithm stays v8", () => {
    expect(B.localRefChars).toBe(24);
    expect(INVENTORY_WIRE_SCHEMA_VERSION).toBe("semantic-inventory-wire.v3");
    expect(SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION).toBe("semantic-accountability.v8");
    expect(SEMANTIC_INVENTORY_PROMPT_VERSION).toBe("semantic-inventory-prompt.v7");
  });

  it("the system prompt states localRef and the char bound", () => {
    const sys = buildInventorySystemPrompt(POLICY);
    expect(sys).toMatch(/localRef/);
    expect(sys).toContain(`localRef/parentRef/relatedRefs <= ${B.localRefChars} chars`);
  });

  it("schema accepts section-shaped refs up to 24 chars (the live gap-call failure shape)", () => {
    const ok = WireInventoryItemSchema.parse({
      localRef: "r7_05j_gap_item", // 16
      excerpt: "any Disposition of Property or business which yields net proceeds to the Borrower in an aggregate amount not to exceed $25,000,000",
      parentRef: "r7_05j_parent_ref", // 17
      relatedRefs: ["r7_05j_parent_ref"],
    });
    expect(ok.localRef).toBe("r7_05j_gap_item");
    expect(ok.parentRef).toBe("r7_05j_parent_ref");
  });

  it("over-long localRef/parentRef coerce to the same digest so within-call cross-refs still resolve", () => {
    const long = "section_7_05_j_disposition_permission_handle"; // > 24
    expect(long.length).toBeGreaterThan(B.localRefChars);
    const expected = createHash("sha256").update(long, "utf8").digest("hex").slice(0, B.localRefChars);
    expect(coerceInventoryLocalRef(long, B.localRefChars)).toBe(expected);

    const parsed = WireInventoryItemSchema.parse({
      localRef: long,
      excerpt: "x",
      parentRef: long,
      relatedRefs: [long],
    });
    expect(parsed.localRef).toBe(expected);
    expect(parsed.parentRef).toBe(expected);
    expect(parsed.relatedRefs).toEqual([expected]);
  });

  it("exact-bound and short refs are untouched; empty parentRef stays null", () => {
    const exact = "a".repeat(B.localRefChars);
    const parsed = WireInventoryItemSchema.parse({ localRef: exact, excerpt: "x", parentRef: null });
    expect(parsed.localRef).toBe(exact);
    expect(parsed.parentRef).toBeNull();
  });

  it("a scripted gap call with >6-char localRef/parentRef is accepted (no schemaOk failure)", async () => {
    const { index, sc } = unit();
    const caller = scriptedGapFriendly();
    const inv = await runSemanticInventory({
      candidateRef: "cand:localref",
      documentId: "d",
      sourceContext: sc,
      structuralIndex: index,
      caller,
      policy: POLICY,
    });
    const gaps = caller.captured.filter((c) => c.stage === "semantic_inventory_gap");
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      // schema used on the wire accepts the long refs (parse inside scripted caller would throw otherwise)
      expect(() =>
        g.schema.parse({
          items: [
            { localRef: "r7_05j_parent", excerpt: "any Disposition of Property or business which yields net proceeds to the Borrower in an aggregate amount not to exceed $25,000,000", parentRef: null },
            { localRef: "r7_05j_child1", excerpt: "provided that no Default has occurred and is continuing", parentRef: "r7_05j_parent" },
          ],
        }),
      ).not.toThrow();
    }
    const gapRecs = (inv.calls ?? []).filter((c) => c.stage === "semantic_inventory_gap");
    expect(gapRecs.length).toBeGreaterThan(0);
    for (const rec of gapRecs) {
      expect(rec.schemaOk).toBe(true);
      expect(rec.error).toBeNull();
      expect(rec.itemsReturned).toBeGreaterThan(0);
    }
    // parentRef resolution: gap items that cited each other via long localRefs should have linked parentItemId
    expect(inv.gapReinventory?.attempted).toBe(true);
    expect(inv.gapReinventory?.itemsAdded ?? 0).toBeGreaterThan(0);
  });

  it("buildSubmitSemanticInventorySchema still refuses over-ceiling item counts", () => {
    const schema = buildSubmitSemanticInventorySchema(B, 2);
    expect(() => schema.parse({ items: Array.from({ length: 3 }, (_, k) => ({ localRef: `r7_05j_${k}`, excerpt: "x" })) })).toThrow();
  });
});
