/**
 * ZERO-COST false-credit probe.
 *
 * The INDEPENDENT verifier builds the SOURCE side of its reconciliation from
 * `compilerInput.operativeSourceText` (semantic-verification/verify.ts:319 -> buildSourceInventory).
 * Today that text carries the whole linked parent section, so every SIBLING clause's amounts,
 * percentages and metric mentions sit inside the window the verifier treats as "what THIS candidate's
 * source says". This measures exactly how many such items each child inherits that do not belong to
 * its own anchor text - i.e. the size of the false-credit channel. No model calls.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSourceInventory } from "../../lib/contract-model/compiler/semantic-verification/source-inventory";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { operativeTextFor } from "./pipeline";
import { prepare } from "./compile-run";
import { dedupExact } from "./dedup";

const OUT = "docs/phase-3-candidate-span-remediation";
const DSGR_DOCS: Record<string, string> = {
  "doc-a": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
  "doc-b": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
  "doc-d": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
};
/** The distinct SECTIONS behind the 14 historical false-credit controls (two pairs share a section). */
export const CONTROL_SECTIONS = ["doc-a::6.01", "doc-a::6.04", "doc-a::6.05", "doc-a::6.08(b)", "doc-a::6.10", "doc-b::6.01", "doc-b::6.04", "doc-b::6.05", "doc-d::6.01", "doc-d::6.04", "doc-d::6.05", "doc-d::6.08(b)"];

export const economicItems = (text: string, ref: string): string[] => buildSourceInventory("probe", text, "doc", ref, null).items.map((i) => `${i.kind}:${i.rawText.trim()}`);

/** Items present in the CURRENT (concatenated) window that the anchor's own text does not contain. */
export function foreignItems(currentText: string, anchorText: string, ref: string): string[] {
  const own = new Set(economicItems(anchorText, ref));
  return economicItems(currentText, ref).filter((x) => !own.has(x));
}

/** DSGR spans are re-derived from the preserved source with the repo's own parser: the frozen stage-1
 *  node table's offsets were produced against a differently-normalized text and do not align with it. */
function dsgrProbe() {
  const textByNode = new Map<string, string>();
  for (const [documentId, file] of Object.entries(DSGR_DOCS)) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const n of parseDocumentStructure({ documentId, label: documentId, text })) {
      const body = text.slice(n.charStart, n.charEnd);
      const prev = textByNode.get(n.nodeKey);
      if (prev === undefined || body.length > prev.length) textByNode.set(n.nodeKey, body); // largest physical occurrence
    }
  }
  const cands = (JSON.parse(fs.readFileSync("tests/fixtures/unseen-packages/phase-3f-first-blind-run/stage2-all-discovery-candidates.json", "utf8")) as { discoveryId: string; documentId: string; structuralNodeKeys: string[]; normalizedSourceRef: string; role: string }[])
    .filter((c) => c.role !== "REPRESENTATION" && ["doc-a", "doc-b", "doc-d"].includes(c.documentId) && ["1", "6", "10"].includes(String(c.normalizedSourceRef).match(/^(\d+)/)?.[1] ?? ""));
  const rows = cands.map((c) => {
    const keys = c.structuralNodeKeys ?? [];
    const texts = keys.map((k) => textByNode.get(k) ?? null);
    const resolved = texts.length > 0 && texts.every((t) => t !== null);
    const cur = resolved ? texts.map((t) => t!).join("\n\n") : "";
    const anchor = texts[0] ?? "";
    const parentKey = keys.length > 1 ? keys[1]! : null;
    return {
      discoveryId: c.discoveryId, documentId: c.documentId, ref: String(c.normalizedSourceRef), role: c.role, dual: keys.length > 1,
      parentKey, parentIsFalseCreditControlSection: parentKey !== null && CONTROL_SECTIONS.includes(parentKey), resolved,
      currentItems: resolved ? economicItems(cur, c.normalizedSourceRef).length : 0,
      ownItems: anchor ? economicItems(anchor, c.normalizedSourceRef).length : 0,
      inheritedItems: resolved ? foreignItems(cur, anchor, c.normalizedSourceRef).length : 0,
    };
  });
  const res = rows.filter((r) => r.resolved);
  const ctrl = res.filter((r) => r.parentIsFalseCreditControlSection);
  const byParent: Record<string, number> = {};
  for (const r of ctrl) byParent[r.parentKey!] = (byParent[r.parentKey!] ?? 0) + 1;
  return {
    candidates: rows.length, spansResolved: res.length, spansUnresolved: rows.length - res.length, dual: res.filter((r) => r.dual).length,
    inheritingForeignItems: res.filter((r) => r.inheritedItems > 0).length,
    totalForeignItems: res.reduce((a, r) => a + r.inheritedItems, 0),
    currentTotalItems: res.reduce((a, r) => a + r.currentItems, 0), proposedTotalItems: res.reduce((a, r) => a + r.ownItems, 0),
    carryingAControlSectionAsParent: { candidates: ctrl.length, inheritingForeignItems: ctrl.filter((r) => r.inheritedItems > 0).length, totalForeignItems: ctrl.reduce((a, r) => a + r.inheritedItems, 0), meanForeign: ctrl.length ? Math.round((10 * ctrl.reduce((a, r) => a + r.inheritedItems, 0)) / ctrl.length) / 10 : 0, maxForeign: Math.max(0, ...ctrl.map((r) => r.inheritedItems)), byParentSection: byParent, exposedControlSections: Object.keys(byParent).sort(), unexposedControlSections: CONTROL_SECTIONS.filter((k) => !(k in byParent)) },
    rows: res.filter((r) => r.dual),
  };
}

async function main() {
  const { stages, rehydrated } = await prepare();
  const { keep } = dedupExact(rehydrated, (c) => operativeTextFor(c, stages.index));
  const rows = keep.map((c) => {
    const ids = c.structuralNodeIds ?? [];
    const curText = operativeTextFor(c, stages.index);
    const anchorText = ids[0] ? stages.index.getNodeText(ids[0], "DESCENDANTS") : "";
    const inherited = foreignItems(curText, anchorText, String(c.normalizedSourceRef));
    return { discoveryId: c.discoveryId, ref: String(c.normalizedSourceRef), role: String(c.role), dual: ids.length > 1, currentItems: economicItems(curText, String(c.normalizedSourceRef)).length, ownItems: economicItems(anchorText, String(c.normalizedSourceRef)).length, inheritedItems: inherited.length, inheritedSample: [...new Set(inherited)].slice(0, 6) };
  });
  const dual = rows.filter((r) => r.dual);
  const withInherited = rows.filter((r) => r.inheritedItems > 0);
  const conmed = {
    population: rows.length, dualKey: dual.length,
    candidatesInheritingForeignEconomicItems: withInherited.length,
    totalForeignItemsInVerifierSourceWindow: rows.reduce((a, r) => a + r.inheritedItems, 0),
    currentTotalItems: rows.reduce((a, r) => a + r.currentItems, 0), proposedTotalItems: rows.reduce((a, r) => a + r.ownItems, 0),
    meanForeignItemsPerDualCandidate: dual.length ? Math.round((10 * dual.reduce((a, r) => a + r.inheritedItems, 0)) / dual.length) / 10 : 0,
    maxForeignItems: Math.max(0, ...rows.map((r) => r.inheritedItems)),
    rows,
  };
  const dsgr = dsgrProbe();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "05-false-credit-span-probe.json"), JSON.stringify({
    generatedBy: "scripts/p3-conmed-pilot/false-credit-span-probe.ts", modelCalls: 0,
    reading: "A 'foreign' item is an economic value the verifier's source inventory accepts as this candidate's own source evidence although it comes from a SIBLING clause under the linked parent. A compiled rule citing such a value reconciles as SUPPORTED today. Under the proposed contract the verifier's window is the anchor text, so the same citation reconciles as UNSUPPORTED and forces review.",
    conmed, dsgr,
  }, null, 2));
  console.log("CONMED", JSON.stringify({ ...conmed, rows: undefined }, null, 1));
  console.log("DSGR", JSON.stringify({ ...dsgr, rows: undefined }, null, 1));
  for (const r of withInherited.slice(0, 5)) console.log(`  ${r.ref.padEnd(12)} ${r.role.padEnd(22)} own=${r.ownItems} current=${r.currentItems} foreign=${r.inheritedItems} ${JSON.stringify(r.inheritedSample.slice(0, 3))}`);
}
if (process.argv[1]?.endsWith("false-credit-span-probe.ts")) void main();
