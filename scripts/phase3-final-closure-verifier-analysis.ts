/**
 * PHASE 3 FINAL CLOSURE §20 - independent verifier error taxonomy over the
 * preserved REAL runs (zero cost). For every MATERIAL Phase 3C finding it
 * asks, deterministically, which accountability layer the finding
 * corresponds to:
 *
 *   INVENTORY_OMISSION       the finding's source evidence is NOT covered by
 *                            any frozen Pass A item span (Pass A missed it)
 *   COMPOSITION_OMISSION     a MISSING_* finding whose source evidence IS
 *                            covered by an inventory item (Pass A had it,
 *                            Pass B did not compose it / Pass C dispositioned
 *                            it MISSING/UNSUPPORTED)
 *   SEMANTIC_DISAGREEMENT    OTHER_MATERIAL_SEMANTIC_DISCREPANCY / WRONG_*:
 *                            both inventoried and composed, verifier disputes
 *                            the meaning (formula shape, scope, condition)
 *   COMPOSITION_ADDITION     UNSUPPORTED_IR_ADDITION - the IR carries
 *                            something the source does not
 *   SOURCE_CONTEXT_INCOMPLETENESS  the unit's source context was
 *                            TRUNCATED/STRUCTURALLY_INCOMPLETE/UNKNOWN
 *
 * The verifier itself is not modified and never reads Pass A/C; this
 * script reads both AFTER the fact, as an analyst would.
 *
 *   npx tsx scripts/phase3-final-closure-verifier-analysis.ts --out docs/phase3-final-closure/18-verifier-analysis.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const ws = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
function arg(name: string, fallback: string): string { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback; }

type Layer = "INVENTORY_OMISSION" | "COMPOSITION_OMISSION" | "SEMANTIC_DISAGREEMENT" | "COMPOSITION_ADDITION" | "SOURCE_CONTEXT_INCOMPLETENESS" | "UNCLASSIFIED";

interface Row { runDir: string; region: string; findingType: string; layer: Layer; evidenceCoveredByInventory: boolean | null; coveringItemDisposition: string | null; irPath: string; sourceEvidence: string }

function analyseRun(runDir: string, rows: Row[]) {
  if (!existsSync(runDir)) return;
  for (const f of readdirSync(runDir).filter((f) => /^region-[a-z0-9-]+\.json$/.test(f))) {
    const j = JSON.parse(readFileSync(`${runDir}/${f}`, "utf-8"));
    if (j.error || !j.verify || !j.compile?.frozenInventory) continue;
    const region = j.region.id as string;
    const state = j.compile.sourceContext?.state as string;
    const regions: { regionId: string; text: string }[] = j.compile.sourceContext?.regions ?? [];
    const items: { inventoryItemId: string; sourceSpan: { regionId: string; charStart: number; charEnd: number } }[] = j.compile.frozenInventory.items;
    const dispositionById = new Map<string, string>((j.compile.accountability?.items ?? []).map((r: { inventoryItemId: string; disposition: string }) => [r.inventoryItemId, r.disposition]));
    for (const x of j.verify.findings) {
      if (x.severity !== "MATERIAL") continue;
      const ev = ws(x.sourceEvidence ?? "");
      // Locate the evidence in a region text (whitespace-tolerant) and test span coverage.
      let covered: boolean | null = null;
      let coveringDisposition: string | null = null;
      const uninventoried: { regionId: string; rawText: string }[] = j.compile.frozenInventory.uninventoriedValues ?? [];
      if (ev.length >= 20) {
        covered = false;
        for (const r of regions) {
          const hay = ws(r.text);
          const probe = ev.slice(0, Math.min(ev.length, 120));
          const at = hay.indexOf(probe);
          if (at < 0) continue;
          // Map the normalized offset back approximately by ratio (regions are large; a coarse mapping is enough to test item coverage).
          const approx = Math.round((at / Math.max(1, hay.length)) * r.text.length);
          const hit = items.find((it) => it.sourceSpan.regionId === r.regionId && it.sourceSpan.charStart - 200 <= approx && approx <= it.sourceSpan.charEnd + 200);
          if (hit) { covered = true; coveringDisposition = dispositionById.get(hit.inventoryItemId) ?? null; }
          break;
        }
      } else if (ev.length > 0) {
        // Short evidence (typically a bare amount such as "$37.5 million"): locate the exact text in the region and test span coverage exactly; a value listed in uninventoriedValues is a Pass A gap by construction.
        const raw = String(x.sourceEvidence ?? "").replace(/ /g, " ").trim();
        if (uninventoried.some((u) => ws(u.rawText.replace(/ /g, " ")) === ws(raw))) covered = false;
        else {
          for (const r of regions) {
            const text = r.text.replace(/ /g, " ");
            let at = text.indexOf(raw);
            while (at >= 0) {
              const hit = items.find((it) => it.sourceSpan.regionId === r.regionId && it.sourceSpan.charStart <= at && at + raw.length <= it.sourceSpan.charEnd);
              if (hit) { covered = true; coveringDisposition = dispositionById.get(hit.inventoryItemId) ?? null; break; }
              covered = false;
              at = text.indexOf(raw, at + 1);
            }
            if (covered) break;
          }
        }
      }
      let layer: Layer;
      if (state === "TRUNCATED_SOURCE" || state === "STRUCTURALLY_INCOMPLETE_SOURCE" || state === "UNKNOWN_SOURCE_COMPLETENESS") layer = "SOURCE_CONTEXT_INCOMPLETENESS";
      else if (x.findingType === "UNSUPPORTED_IR_ADDITION") layer = "COMPOSITION_ADDITION";
      else if (/^MISSING_/.test(x.findingType)) layer = covered === false ? "INVENTORY_OMISSION" : covered === true ? "COMPOSITION_OMISSION" : "UNCLASSIFIED";
      else if (/^OTHER_MATERIAL|^WRONG_/.test(x.findingType)) layer = covered === false ? "INVENTORY_OMISSION" : "SEMANTIC_DISAGREEMENT";
      else layer = "UNCLASSIFIED";
      rows.push({ runDir, region, findingType: x.findingType, layer, evidenceCoveredByInventory: covered, coveringItemDisposition: coveringDisposition, irPath: String(x.irPath ?? "").slice(0, 120), sourceEvidence: String(x.sourceEvidence ?? "").slice(0, 160) });
    }
  }
}

function main() {
  const out = arg("--out", "docs/phase3-final-closure/18-verifier-analysis.json");
  const rows: Row[] = [];
  const runs = ["tests/fixtures/semantic-accountability-validation/holdout/run-1", "tests/fixtures/semantic-accountability-validation/holdout/run-2", "tests/fixtures/semantic-accountability-validation/whole-agreement/run-1", "tests/fixtures/semantic-accountability-validation/whole-agreement/run-2"];
  for (const r of runs) analyseRun(r, rows);
  const count = (f: (r: Row) => string) => rows.reduce<Record<string, number>>((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const result = {
    schemaVersion: 1,
    artifactId: "18-verifier-analysis",
    independence: "Phase 3C verifier unchanged in this mission (no file under lib/contract-model/compiler/semantic-verification/ modified; tests/contract-model/semantic-accountability-independence.test.ts asserts it imports nothing from semantic-accountability). This analysis reads verifier findings and Pass A/C artifacts after the fact; it feeds nothing back into either.",
    method: "Each MATERIAL finding's sourceEvidence is located (whitespace-tolerant) in the unit's source-context regions and tested against frozen Pass A item spans (+/-200 chars tolerance for the coarse offset mapping). Layer rules in the file header.",
    runsAnalysed: runs.filter((r) => existsSync(r)),
    materialFindings: rows.length,
    byLayer: count((r) => r.layer),
    byFindingType: count((r) => r.findingType),
    byLayerAndRegion: count((r) => `${r.layer} | ${r.region}`),
    coveringItemDispositionWhenCovered: count((r) => (r.evidenceCoveredByInventory ? String(r.coveringItemDisposition) : "n/a")),
    reading: "A COMPOSITION_OMISSION or SEMANTIC_DISAGREEMENT finding means Pass A DID inventory the text (the accountability chain had it) and the disagreement sits in Pass B/C or in interpretation; an INVENTORY_OMISSION finding is the verifier independently catching a Pass A gap, which is exactly what the two-layer trust design is for. SOURCE_CONTEXT_INCOMPLETENESS attributes the finding to the unit boundary, not to either model.",
    rows,
  };
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ materialFindings: rows.length, byLayer: result.byLayer, byFindingType: result.byFindingType }, null, 2));
}
main();
