/**
 * RED BASELINE for the candidate-span contract (mission §3).
 *
 * Records, from the CURRENT contract and before any production change, the three facts the
 * implementation must invert:
 *   A. a dual-key child's operativeSourceText carries parent-section text outside its anchor's span;
 *   B. the 7.2(k)/7.2(e) family spans are manufactured, not drafted;
 *   C. a material condition can live ONLY in the parent chapeau, so an anchor-only Gate-2 window
 *      would stop seeing it unless R3 also feeds it the PARENT_SCOPE excerpts.
 * Zero model calls.
 */
import fs from "node:fs";
import path from "node:path";
import { CONDITION_MARKERS } from "./condition-markers";
import { operativeTextFor } from "./pipeline";
import { prepare } from "./compile-run";
import { dedupExact } from "./dedup";
import { preChangeOperativeText } from "./pre-change-span";

const OUT = "docs/phase-3-candidate-span-remediation-implementation";
const FOCUS: Record<string, string> = {
  long_7_2_e: "discovery-candidate:62512247bce898548b6f9b63",
  long_7_2_k: "discovery-candidate:c9999a82a8a6c1c3a9648e22",
  k_i: "discovery-candidate:abc8af03ac51f922f06ded82",
  k_ii: "discovery-candidate:42316093889582e0874f69a6",
};

async function main() {
  const { stages, bundles, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => preChangeOperativeText(c, stages.index));

  const rows = keep.map((c) => {
    const ids = c.structuralNodeIds ?? [];
    const anchorText = operativeTextFor(c, stages.index);
    const currentText = preChangeOperativeText(c, stages.index);
    const outsideAnchor = currentText.startsWith(anchorText) ? currentText.slice(anchorText.length) : currentText;
    const bundle = bundles.get(c.discoveryId);
    const parentScope = (bundle?.items ?? []).filter((i) => i.type === "PARENT_SCOPE");
    // C: a condition marker that appears in the PARENT_SCOPE excerpts but NOT in the anchor's own text
    // is a condition an anchor-only Gate-2 window would stop seeing.
    const anchorLower = anchorText.toLowerCase();
    const parentOnlyConditionMarkers = [...new Set(parentScope.flatMap((i) => CONDITION_MARKERS.filter((m) => i.excerptText.toLowerCase().includes(m) && !anchorLower.includes(m))))];
    return {
      discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), role: String(c.role), dual: ids.length > 1,
      anchorChars: anchorText.length, currentOperativeChars: currentText.length, charsOutsideAnchorSpan: outsideAnchor.length,
      carriesTextOutsideItsAnchorSpan: outsideAnchor.trim().length > 0,
      linkedRefs: ids.slice(1).map((id) => stages.index.getNodeById(id)?.sectionRef ?? "?"),
      parentScopeRefs: parentScope.map((i) => i.normalizedRef), parentScopeChars: parentScope.reduce((a, i) => a + i.excerptText.length, 0),
      parentOnlyConditionMarkers,
    };
  });

  const dual = rows.filter((r) => r.dual);
  const red = {
    generatedBy: "scripts/p3-conmed-pilot/red-baseline.ts", modelCalls: 0,
    contractUnderTest: "CURRENT - operativeSourceText = every structuralNodeId's DESCENDANTS text, joined",
    A_parentTextContamination: {
      population: rows.length, dualKey: dual.length,
      carryingTextOutsideTheirAnchorSpan: rows.filter((r) => r.carriesTextOutsideItsAnchorSpan).length,
      dualKeyCarryingForeignText: dual.filter((r) => r.carriesTextOutsideItsAnchorSpan).length,
      singleKeyCarryingForeignText: rows.filter((r) => !r.dual && r.carriesTextOutsideItsAnchorSpan).length,
      totalCharsOutsideAnchorSpans: rows.reduce((a, r) => a + r.charsOutsideAnchorSpan, 0),
      verdict: "RED - every dual-key candidate's operative window extends beyond its own anchor node.",
    },
    B_manufacturedFocusSpans: Object.fromEntries(Object.entries(FOCUS).map(([slot, id]) => {
      const r = rows.find((x) => x.discoveryId === id)!;
      return [slot, { ref: r.ref, anchorChars: r.anchorChars, currentOperativeChars: r.currentOperativeChars, appendedChars: r.charsOutsideAnchorSpan, linkedRefs: r.linkedRefs }];
    })),
    C_gate2ParentOnlyConditions: {
      dualKeyCandidatesWithAParentOnlyConditionMarker: dual.filter((r) => r.parentOnlyConditionMarkers.length > 0).length,
      ofDualKey: dual.length,
      examples: dual.filter((r) => r.parentOnlyConditionMarkers.length > 0).slice(0, 8).map((r) => ({ ref: r.ref, role: r.role, anchorChars: r.anchorChars, parentScopeRefs: r.parentScopeRefs, parentOnlyConditionMarkers: r.parentOnlyConditionMarkers })),
      verdict: "Each of these carries a condition marker that exists ONLY in its parent chapeau. Today Gate 2 sees it because the whole parent is inside operativeSourceText. After R1 it would not - which is exactly why R3 must feed Gate 2 the PARENT_SCOPE excerpts.",
    },
    rows,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "02-red-baseline.json"), JSON.stringify(red, null, 2));
  console.log(JSON.stringify({ ...red, rows: undefined }, null, 2).slice(0, 3000));
}
if (process.argv[1]?.endsWith("red-baseline.ts")) void main();
