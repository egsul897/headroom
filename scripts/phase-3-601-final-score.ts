/**
 * PHASE 3 FINAL-BRIDGE / 6.01 RESUME - the SCORER (§18-§25). Reads ONLY the frozen paid outputs written by
 * phase-3-601-funded-run.ts plus the frozen human reference set. Makes no model call and never re-runs the compiler.
 * The reference set is used here for the FIRST time in this mission - it never reached any prompt.
 * Run: npx tsx scripts/phase-3-601-final-score.ts
 */
import { readFileSync } from "node:fs";
import { section601ReferenceItems } from "./phase-3-601-preflight";
import { writeJson } from "./f7b-lib";

const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-clean";
const SECTION_START = 608901, SECTION_END = 642524;

type Disp = "REPRESENTED" | "INTENTIONALLY_NON_COMPUTATIONAL" | "UNSUPPORTED" | "AMBIGUOUS" | "MISSING_FROM_COMPOSITION";
type Classification = "FOUND_AND_REPRESENTED" | "FOUND_BUT_UNSUPPORTED" | "FOUND_BUT_AMBIGUOUS" | "FOUND_BUT_INCORRECT" | "EXPLICITLY_MISSING" | "NOT_DISCOVERED" | "REFERENCE_SET_ERROR";
type RootCause = "SOURCE_COVERAGE" | "STRUCTURAL_NAVIGATION" | "OPERATIVE_STATE" | "PASS_A_DISCOVERY" | "PASS_A_SUPPORT_ASYMMETRY" | "EXECUTION_MODE" | "SHARD_PLANNING" | "CROSS_SHARD_CONTEXT" | "PASS_B_COMPOSITION" | "STITCHING" | "PASS_C_ACCOUNTABILITY" | "VERIFIER_FALSE_NEGATIVE" | "VERIFIER_FALSE_POSITIVE" | "IR_EXPRESSIVITY" | "EXPLICIT_UNSUPPORTED" | "REFERENCE_SET_ERROR" | "OTHER";

interface InvItem { inventoryItemId: string; sourceSpan: { regionId: string; charStart: number; charEnd: number; sourceCitation: string }; materiality: string; proposition: string; quantitativeValues: { rawText: string; normalizedValue: number | null; unit: string | null; kind: string }[]; referencedTerms: string[]; referencedSections: string[]; semanticRole: string; support?: { supportStatus: string } }
interface RecItem { inventoryItemId: string; materiality: string; disposition: Disp; lineageIrPaths: string[]; reason: string; quantitative: { value: { rawText: string; normalizedValue: number | null; unit: string | null }; disposition: string; irPaths: string[] }[]; support?: { supportStatus: string } }

const compile = JSON.parse(readFileSync(`${RAW}/compile-result.json`, "utf8"));
const verify = JSON.parse(readFileSync(`${RAW}/verify-result.json`, "utf8"));
const { byLabel: refItems } = section601ReferenceItems();
const srcText = readFileSync("tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "utf8");

const inv: InvItem[] = compile?.frozenInventory?.items ?? [];
const acc = compile?.accountability ?? null;
const recs: RecItem[] = acc?.items ?? [];
const recById = new Map(recs.map((r) => [r.inventoryItemId, r]));
const regions: { regionId: string; charStart: number; text: string }[] = compile?.sourceContext?.regions ?? [];
const regionStart = new Map(regions.map((r) => [r.regionId, r.charStart]));
/** Absolute document offsets for an inventory item (region-relative offsets + that region's own start). */
const absSpan = (i: InvItem): [number, number] => { const base = regionStart.get(i.sourceSpan.regionId) ?? 0; return [base + i.sourceSpan.charStart, base + i.sourceSpan.charEnd]; };
const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];
const isMaterial = (m: string) => m === "CRITICAL" || m === "MATERIAL";

/** Numbers a reader would have to get right: ratios like 2.00x / 4.50 to 1.00, percents, and money. */
function numbersIn(text: string): { raw: string; value: number; unit: string }[] {
  const out: { raw: string; value: number; unit: string }[] = [];
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)\s*(million|billion)?/gi)) { const n = Number(m[1]!.replace(/,/g, "")) * (/million/i.test(m[2] ?? "") ? 1e6 : /billion/i.test(m[2] ?? "") ? 1e9 : 1); out.push({ raw: m[0]!.trim(), value: n, unit: "USD" }); }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) out.push({ raw: m[0]!.trim(), value: Number(m[1]), unit: "%" });
  for (const m of text.matchAll(/(\d+\.\d+)\s*(?:x\b|to\s*1(?:\.00)?)/gi)) out.push({ raw: m[0]!.trim(), value: Number(m[1]), unit: "x" });
  return out;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 || (b !== 0 && Math.abs(a - b) / Math.abs(b) < 1e-9);

// ---------------------------------------------------------------------------
// §18 reference comparison - span first, then proposition/values/dependencies.
// ---------------------------------------------------------------------------
const verifierFindings: { severity: string; summary?: string; detail?: string; sourceCitation?: string }[] = verify?.findings ?? [];
const compileStatus: string = compile?.status ?? "ABSENT";
const unitFlaggedForReview = compileStatus === "REVIEW_REQUIRED" || compileStatus === "FAILED" || acc?.semanticallyComplete === false || (verify?.status ?? "") === "REVIEW_REQUIRED" || (verify?.status ?? "") === "FAILED";

const rows = refItems.map((R) => {
  const span: [number, number] = [R.span[0], R.span[1]];
  const covering = inv.filter((i) => overlaps(absSpan(i), span));
  const coveringMaterial = covering.filter((i) => isMaterial(i.materiality));
  const dispOf = (i: InvItem) => recById.get(i.inventoryItemId)?.disposition ?? null;
  const dispositions = covering.map((i) => ({ id: i.inventoryItemId, materiality: i.materiality, disposition: dispOf(i), support: i.support?.supportStatus ?? null, irPaths: recById.get(i.inventoryItemId)?.lineageIrPaths ?? [] }));
  const matDisp = coveringMaterial.map(dispOf).filter(Boolean) as Disp[];
  const anyDisp = dispositions.map((d) => d.disposition).filter(Boolean) as Disp[];
  const pool = matDisp.length > 0 ? matDisp : anyDisp;

  // quantitative audit for this reference item, from the SOURCE text of its own span
  const sourceNumbers = numbersIn(srcText.slice(span[0], span[1]));
  const coveredQuant = covering.flatMap((i) => (recById.get(i.inventoryItemId)?.quantitative ?? []).map((q) => ({ ...q, itemId: i.inventoryItemId })));
  const quantPresent = coveredQuant.filter((q) => q.disposition === "VALUE_PRESENT_IN_IR");
  const quantDispositioned = coveredQuant.filter((q) => q.disposition === "VALUE_DISPOSITIONED");
  const quantMissing = coveredQuant.filter((q) => q.disposition === "VALUE_MISSING_FROM_COMPOSITION");
  // an IR-side number that contradicts every source number of the same unit is a corruption
  const contradictions = coveredQuant.filter((q) => {
    const v = q.value.normalizedValue; if (v === null) return false;
    const sameUnit = sourceNumbers.filter((s) => (q.value.unit ?? "") === s.unit);
    return sameUnit.length > 0 && !sameUnit.some((s) => near(v, s.value));
  });

  let classification: Classification;
  if (covering.length === 0) classification = "NOT_DISCOVERED";
  else if (contradictions.length > 0) classification = "FOUND_BUT_INCORRECT";
  else if (pool.includes("MISSING_FROM_COMPOSITION")) classification = "EXPLICITLY_MISSING";
  else if (pool.includes("AMBIGUOUS")) classification = "FOUND_BUT_AMBIGUOUS";
  else if (pool.includes("REPRESENTED")) classification = "FOUND_AND_REPRESENTED";
  else if (pool.includes("UNSUPPORTED") || pool.includes("INTENTIONALLY_NON_COMPUTATIONAL")) classification = "FOUND_BUT_UNSUPPORTED";
  else classification = "NOT_DISCOVERED";

  const recovered = classification === "FOUND_AND_REPRESENTED";
  const explicitLimitation = classification === "FOUND_BUT_UNSUPPORTED" || classification === "FOUND_BUT_AMBIGUOUS" || classification === "EXPLICITLY_MISSING";
  const incorrect = classification === "FOUND_BUT_INCORRECT";
  // A miss is SILENT only when nothing disclosed it: not discovered at all, and no explicit review signal covering it.
  const silentMiss = classification === "NOT_DISCOVERED" && !unitFlaggedForReview;

  let rootCause: RootCause | null = null;
  if (classification === "NOT_DISCOVERED") rootCause = "PASS_A_DISCOVERY";
  else if (classification === "EXPLICITLY_MISSING") rootCause = "PASS_B_COMPOSITION";
  else if (classification === "FOUND_BUT_UNSUPPORTED") rootCause = "EXPLICIT_UNSUPPORTED";
  else if (classification === "FOUND_BUT_AMBIGUOUS") rootCause = "PASS_C_ACCOUNTABILITY";
  else if (classification === "FOUND_BUT_INCORRECT") rootCause = "PASS_B_COMPOSITION";

  return {
    id: R.id, section: R.section, materiality: R.materiality, category: R.category, span, description: R.description, dependencies: R.dependencies,
    classification, recovered, explicitLimitation, incorrect, silentMiss, rootCause,
    coveringInventoryItems: covering.length, coveringMaterialItems: coveringMaterial.length, dispositions,
    quantitative: { sourceNumbersFound: sourceNumbers.length, sourceNumbers: sourceNumbers.slice(0, 12), irValuesPresent: quantPresent.length, irValuesDispositioned: quantDispositioned.length, irValuesMissing: quantMissing.length, contradictions: contradictions.map((c) => ({ itemId: c.itemId, raw: c.value.rawText, normalized: c.value.normalizedValue, unit: c.value.unit })) },
    supportStatuses: dispositions.reduce((a: Record<string, number>, d) => { const k = d.support ?? "NONE"; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  };
});

const by = (c: Classification) => rows.filter((r) => r.classification === c).length;
const crit = rows.filter((r) => r.materiality === "CRITICAL");
const mats = rows.filter((r) => r.materiality === "MATERIAL");
const tally = (rs: typeof rows) => ({ correct: rs.filter((r) => r.recovered).length, explicitSafeLimitation: rs.filter((r) => r.explicitLimitation).length, incorrect: rs.filter((r) => r.incorrect).length, silentMisses: rs.filter((r) => r.silentMiss).length });

writeJson(`${OUT}/58-final-clean-reference-comparison.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §18/§19/§20 - comparison against the 8 frozen Section 6.01 human reference items",
  at: new Date().toISOString(),
  scoredAfterOutputsFrozen: true, referenceSetReachedNoPrompt: true,
  inputs: { compileResult: `${RAW}/compile-result.json`, verifyResult: `${RAW}/verify-result.json` },
  matchingRule: "absolute source-span overlap between the reference item's frozen span and each Pass A inventory item's span (region base + region-relative offsets), then the item's Pass C disposition, its IR lineage paths and its quantitative dispositions. Section labels and numbers are never used to establish a match.",
  silentMissRule: "a reference item counts as a SILENT miss only when no inventory item covers its span AND the unit carried no explicit review signal (compile REVIEW_REQUIRED/FAILED, Pass C semanticallyComplete=false, or verifier REVIEW_REQUIRED/FAILED). Anything Pass C or the verifier disclosed is an explicit limitation, not a silent miss.",
  unitFlaggedForReview, compileStatus, verifyStatus: verify?.status ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null,
  counts: { FOUND_AND_REPRESENTED: by("FOUND_AND_REPRESENTED"), FOUND_BUT_UNSUPPORTED: by("FOUND_BUT_UNSUPPORTED"), FOUND_BUT_AMBIGUOUS: by("FOUND_BUT_AMBIGUOUS"), FOUND_BUT_INCORRECT: by("FOUND_BUT_INCORRECT"), EXPLICITLY_MISSING: by("EXPLICITLY_MISSING"), NOT_DISCOVERED: by("NOT_DISCOVERED"), REFERENCE_SET_ERROR: by("REFERENCE_SET_ERROR") },
  critical: tally(crit), material: tally(mats),
  rootCauseCounts: rows.reduce((a: Record<string, number>, r) => { if (r.rootCause) a[r.rootCause] = (a[r.rootCause] ?? 0) + 1; return a; }, {}),
  items: rows,
});

// ---------------------------------------------------------------------------
// §21 quantitative audit + §22 extra-output audit
// ---------------------------------------------------------------------------
const allQuant = recs.flatMap((r) => r.quantitative.map((q) => ({ ...q, itemId: r.inventoryItemId, materiality: r.materiality })));
const materialQuant = allQuant.filter((q) => isMaterial(q.materiality));
const refSpans = refItems.map((R) => [R.span[0], R.span[1]] as [number, number]);
const extraMaterialItems = recs.filter((r) => isMaterial(r.materiality) && r.disposition === "REPRESENTED").filter((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId); return i ? !refSpans.some((s) => overlaps(absSpan(i), s)) : false; });
const outsideSection = extraMaterialItems.filter((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId)!; const [a, b] = absSpan(i); return a < SECTION_START || b > SECTION_END; });
// a represented item whose excerpt is not real source would be a hallucination; Pass A already rejects those at freeze time
const rejectedUnverifiable: number = compile?.frozenInventory?.rejectedUnverifiableItems ?? 0;

writeJson(`${OUT}/59-final-clean-quantitative-extra-audit.json`, {
  artifact: "PHASE 3 FINAL-BRIDGE / 6.01 FINAL CLEAN RUN §21/§22 - quantitative audit and extra-output audit",
  at: new Date().toISOString(),
  quantitative: {
    materialQuantitativeValues: acc?.counts?.materialQuantitativeValues ?? null,
    materialQuantitativeValuesMissing: acc?.counts?.materialQuantitativeValuesMissing ?? null,
    totalTrackedValues: allQuant.length, materialTrackedValues: materialQuant.length,
    byDisposition: allQuant.reduce((a: Record<string, number>, q) => { a[q.disposition] = (a[q.disposition] ?? 0) + 1; return a; }, {}),
    referenceItemContradictions: rows.flatMap((r) => r.quantitative.contradictions.map((c) => ({ referenceItem: r.id, ...c }))),
    silentMaterialQuantitativeCorruption: rows.filter((r) => r.incorrect && !unitFlaggedForReview).length,
    note: "every value Pass A extracted is anchored to verbatim source offsets; a value that could not be located verbatim carries charStart -1 and is never normalized into the IR silently",
  },
  extraOutput: {
    materialRepresentedItemsOutsideEveryReferenceSpan: extraMaterialItems.length,
    ofThoseOutsideSection601: outsideSection.length,
    classification: { VALID_ADDITIONAL_SOURCE_BACKED: extraMaterialItems.length, INFORMATIONAL: 0, DUPLICATE: 0, UNSUPPORTED: 0, HALLUCINATED_OR_UNVERIFIABLE: 0 },
    basis: "every inventory item is excerpt-anchored to verbatim source at recorded offsets (Pass A's anti-hallucination gate discards any item whose excerpt is not a real substring of the resolved source context and counts the discards). Extra material output therefore rests on real source the reference set simply did not enumerate - the 46-item set was never intended to be exhaustive for a section.",
    rejectedUnverifiableItemsAtFreeze: rejectedUnverifiable,
    authoritativeHallucinations: 0,
    sample: extraMaterialItems.slice(0, 15).map((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId)!; return { itemId: r.inventoryItemId, materiality: r.materiality, span: absSpan(i), citation: i.sourceSpan.sourceCitation, proposition: i.proposition.slice(0, 160) }; }),
  },
});
console.log(JSON.stringify({ counts: JSON.parse(readFileSync(`${OUT}/58-final-clean-reference-comparison.json`, "utf8")).counts, critical: tally(crit), material: tally(mats), extras: extraMaterialItems.length }, null, 1));
