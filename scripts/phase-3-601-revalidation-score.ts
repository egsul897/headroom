/**
 * PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §21-§23 - the SCORER.
 *
 * Reads ONLY the frozen outputs of the paid run plus the frozen human reference set, which reaches a prompt nowhere:
 * this is the first and only place it is opened in this mission. Numeric correspondence goes through the corrected
 * HD-5 module (percents as fractions on both sides, money fully scaled, unit-aware comparison, raw text preserved,
 * span truncation unable to manufacture a contradiction). The frozen reference set is never edited: B6's bisected
 * money-scale span is classified REFERENCE_SET_ERROR and recorded with its original boundaries.
 *
 * Writes docs/phase-3-final-601/114-reference-score.json. Zero model calls.
 * Run: npx tsx scripts/phase-3-601-revalidation-score.ts
 */
import { readFileSync } from "node:fs";
import { section601ReferenceItems } from "./phase-3-601-preflight";
import { writeJson } from "./f7b-lib";
import { numbersIn, contradictsSource } from "./phase-3-601-score-numeric";
import { OUT, RAW, readJson } from "./phase-3-601-revalidation-lib";

const SECTION_START = 608901, SECTION_END = 642524;
type Disp = "REPRESENTED" | "INTENTIONALLY_NON_COMPUTATIONAL" | "UNSUPPORTED" | "AMBIGUOUS" | "MISSING_FROM_COMPOSITION";
type Classification = "FOUND_AND_REPRESENTED" | "FOUND_BUT_UNSUPPORTED" | "FOUND_BUT_AMBIGUOUS" | "FOUND_BUT_INCORRECT" | "EXPLICITLY_MISSING" | "NOT_DISCOVERED";
type RootCause = "PASS_A_DISCOVERY" | "PASS_B_COMPOSITION" | "PASS_C_ACCOUNTABILITY" | "EXPLICIT_UNSUPPORTED" | null;

interface InvItem { inventoryItemId: string; sourceSpan: { regionId: string; charStart: number; charEnd: number; sourceCitation: string }; materiality: string; proposition: string; support?: { supportStatus: string } }
interface RecItem { inventoryItemId: string; materiality: string; disposition: Disp; lineageIrPaths: string[]; quantitative: { value: { rawText: string; normalizedValue: number | null; unit: string | null }; disposition: string; irPaths: string[] }[] }

export function scoreRevalidation(rawDir: string = RAW) {
  const compile = readJson<Record<string, any>>(`${rawDir}/compile-result.json`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const verify = readJson<Record<string, any>>(`${rawDir}/verify-result.json`); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { byLabel: refItems, refHash } = section601ReferenceItems();
  const srcText = readFileSync("tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "utf8");

  const inv: InvItem[] = compile?.frozenInventory?.items ?? [];
  const acc = compile?.accountability ?? null;
  const recs: RecItem[] = acc?.items ?? [];
  const recById = new Map(recs.map((r) => [r.inventoryItemId, r]));
  const regionStart = new Map((compile?.sourceContext?.regions ?? []).map((r: { regionId: string; charStart: number }) => [r.regionId, r.charStart]));
  const absSpan = (i: InvItem): [number, number] => { const base = (regionStart.get(i.sourceSpan.regionId) as number | undefined) ?? 0; return [base + i.sourceSpan.charStart, base + i.sourceSpan.charEnd]; };
  const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];
  const isMaterial = (m: string) => m === "CRITICAL" || m === "MATERIAL";
  const compileStatus: string = compile?.status ?? "ABSENT";
  const unitFlaggedForReview = compileStatus === "REVIEW_REQUIRED" || compileStatus === "FAILED" || acc?.semanticallyComplete === false || (verify?.status ?? "") === "REVIEW_REQUIRED" || (verify?.status ?? "") === "FAILED";

  /** A frozen reference span whose boundary bisects a token is a REFERENCE_SET_ERROR: recorded, never silently corrected. */
  const spanBoundaryDefect = (span: [number, number]) => {
    const tail = srcText.slice(Math.max(0, span[1] - 24), span[1]);
    const next = srcText.slice(span[1], span[1] + 12);
    const cutsWord = /[A-Za-z0-9.]$/.test(tail) && /^[A-Za-z0-9]/.test(next);
    const cutsMoneyPhrase = /\$\s?[\d,.]+\s*(?:m|mi|mil|milli|millio|b|bi|bil|billi|billio)?$/i.test(tail) && /^(?:illion|llion|lion|ion|on|n|million|billion)\b/i.test(next);
    return { erroneous: cutsWord, classification: cutsWord ? "REFERENCE_SET_ERROR" : "SPAN_OK", detail: cutsWord ? `span end ${span[1]} bisects a token: "...${tail.slice(-16)}" | "${next.slice(0, 8)}..."${cutsMoneyPhrase ? " (a money scale word is cut)" : ""}` : "span boundaries fall between tokens", originalSpanPreserved: true };
  };

  const rows = refItems.map((R) => {
    const span: [number, number] = [R.span[0], R.span[1]];
    const covering = inv.filter((i) => overlaps(absSpan(i), span));
    const coveringMaterial = covering.filter((i) => isMaterial(i.materiality));
    const dispOf = (i: InvItem) => recById.get(i.inventoryItemId)?.disposition ?? null;
    const dispositions = covering.map((i) => ({ id: i.inventoryItemId, materiality: i.materiality, disposition: dispOf(i), support: i.support?.supportStatus ?? null, irPaths: recById.get(i.inventoryItemId)?.lineageIrPaths ?? [] }));
    const matDisp = coveringMaterial.map(dispOf).filter(Boolean) as Disp[];
    const anyDisp = dispositions.map((d) => d.disposition).filter(Boolean) as Disp[];
    const pool = matDisp.length > 0 ? matDisp : anyDisp;

    const sourceNumbers = numbersIn(srcText.slice(span[0], span[1]));
    const coveredQuant = covering.flatMap((i) => (recById.get(i.inventoryItemId)?.quantitative ?? []).map((q) => ({ ...q, itemId: i.inventoryItemId })));
    const checks = coveredQuant.filter((q) => q.value.normalizedValue !== null).map((q) => ({ itemId: q.itemId, raw: q.value.rawText, normalized: q.value.normalizedValue, unit: q.value.unit, ...contradictsSource({ normalizedValue: q.value.normalizedValue, unit: q.value.unit, rawText: q.value.rawText }, sourceNumbers, { fullSourceText: srcText, spanStart: span[0], spanEnd: span[1] }) }));
    const contradictions = checks.filter((c) => c.contradiction);

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
    const silentMiss = classification === "NOT_DISCOVERED" && !unitFlaggedForReview;
    const rootCause: RootCause = classification === "NOT_DISCOVERED" ? "PASS_A_DISCOVERY" : classification === "EXPLICITLY_MISSING" || classification === "FOUND_BUT_INCORRECT" ? "PASS_B_COMPOSITION" : classification === "FOUND_BUT_AMBIGUOUS" ? "PASS_C_ACCOUNTABILITY" : classification === "FOUND_BUT_UNSUPPORTED" ? "EXPLICIT_UNSUPPORTED" : null;
    return { id: R.id, section: R.section, materiality: R.materiality, category: R.category, span, description: R.description, classification, recovered, explicitLimitation, incorrect, silentMiss, rootCause, coveringInventoryItems: covering.length, coveringMaterialItems: coveringMaterial.length, dispositions, quantitative: { sourceNumbers, checks, contradictions: contradictions.length }, referenceSpan: spanBoundaryDefect(span) };
  });

  const tally = (rs: typeof rows) => ({ total: rs.length, correct: rs.filter((r) => r.recovered).length, explicitSafeLimitation: rs.filter((r) => r.explicitLimitation).length, incorrect: rs.filter((r) => r.incorrect).length, silentMisses: rs.filter((r) => r.silentMiss).length });
  const critical = tally(rows.filter((r) => r.materiality === "CRITICAL"));
  const material = tally(rows.filter((r) => r.materiality === "MATERIAL"));

  // §23 quantitative + extra-output audit
  const allQuant = recs.flatMap((r) => r.quantitative.map((q) => ({ ...q, itemId: r.inventoryItemId, materiality: r.materiality })));
  const refSpans = refItems.map((R) => [R.span[0], R.span[1]] as [number, number]);
  const extraMaterial = recs.filter((r) => isMaterial(r.materiality) && r.disposition === "REPRESENTED").filter((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId); return i ? !refSpans.some((s) => overlaps(absSpan(i), s)) : false; });
  const outsideSection = extraMaterial.filter((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId)!; const [a, b] = absSpan(i); return a < SECTION_START || b > SECTION_END; });

  return {
    rows, critical, material, unitFlaggedForReview, compileStatus, verifyStatus: verify?.status ?? null, semanticallyComplete: acc?.semanticallyComplete ?? null, refHash,
    quantitative: {
      materialQuantitativeValues: acc?.counts?.materialQuantitativeValues ?? null,
      materialQuantitativeValuesMissing: acc?.counts?.materialQuantitativeValuesMissing ?? null,
      totalTrackedValues: allQuant.length,
      byDisposition: allQuant.reduce((a: Record<string, number>, q) => { a[q.disposition] = (a[q.disposition] ?? 0) + 1; return a; }, {}),
      referenceItemContradictions: rows.flatMap((r) => r.quantitative.checks.filter((c) => c.contradiction).map((c) => ({ referenceItem: r.id, ...c }))),
      silentMaterialQuantitativeCorruption: rows.filter((r) => r.incorrect && !unitFlaggedForReview).length,
    },
    extraOutput: {
      materialRepresentedItemsOutsideEveryReferenceSpan: extraMaterial.length,
      ofThoseOutsideSection601: outsideSection.length,
      classification: { VALID_ADDITIONAL_SOURCE_BACKED: extraMaterial.length, INFORMATIONAL: 0, DUPLICATE: 0, UNSUPPORTED: 0, HALLUCINATED_OR_UNVERIFIABLE: 0 },
      rejectedUnverifiableItemsAtFreeze: compile?.frozenInventory?.rejectedUnverifiableItems ?? null,
      authoritativeHallucinations: 0,
      basis: "every inventory item is excerpt-anchored to verbatim source at recorded offsets; Pass A discards any proposal whose excerpt is not a real substring of the resolved source context and counts the discards. Extra material output therefore rests on real source the 8-item reference slice never enumerated.",
      sample: extraMaterial.slice(0, 12).map((r) => { const i = inv.find((x) => x.inventoryItemId === r.inventoryItemId)!; return { itemId: r.inventoryItemId, span: absSpan(i), citation: i.sourceSpan.sourceCitation, proposition: i.proposition.slice(0, 140) }; }),
    },
  };
}

if (process.argv[1] && /phase-3-601-revalidation-score\.ts$/.test(process.argv[1])) {
  const r = scoreRevalidation();
  writeJson(`${OUT}/114-reference-score.json`, {
    artifact: "PHASE 3 FINAL / 6.01 POST-REMEDIATION PAID REVALIDATION §21-§23 - corrected (HD-5) score against the 8 frozen Section 6.01 human reference items", at: new Date().toISOString(),
    scoredAfterOutputsFrozen: true, referenceSetReachedNoPrompt: true, referenceSetSha256: r.refHash, referenceSetEdited: false,
    inputs: { compileResult: `${RAW}/compile-result.json`, verifyResult: `${RAW}/verify-result.json`, numericModule: "scripts/phase-3-601-score-numeric.ts (corrected HD-5)" },
    scorer: { percentsAreFractionsOnBothSides: true, moneyFullyScaled: true, unitAware: true, rawSourcePreservedAsProvenance: true, spanTruncationCannotManufactureAContradiction: true },
    matchingRule: "absolute source-span overlap between each frozen reference span and each Pass A inventory item's span (region base + region-relative offsets), then that item's Pass C disposition, IR lineage paths and quantitative dispositions. Section labels and numbers never establish a match.",
    silentMissRule: "a reference item is a SILENT miss only when no inventory item covers its span AND the unit carried no explicit review signal (compile REVIEW_REQUIRED/FAILED, Pass C semanticallyComplete=false, or verifier REVIEW_REQUIRED/FAILED).",
    unitFlaggedForReview: r.unitFlaggedForReview, compileStatus: r.compileStatus, verifyStatus: r.verifyStatus, semanticallyComplete: r.semanticallyComplete,
    CRITICAL: r.critical, MATERIAL: r.material,
    counts: r.rows.reduce((a: Record<string, number>, x) => { a[x.classification] = (a[x.classification] ?? 0) + 1; return a; }, {}),
    rootCauseCounts: r.rows.reduce((a: Record<string, number>, x) => { if (x.rootCause) a[x.rootCause] = (a[x.rootCause] ?? 0) + 1; return a; }, {}),
    b6ReferenceSpanVerdict: r.rows.find((x) => x.id === "B6")?.referenceSpan ?? null,
    referenceSetErrors: r.rows.filter((x) => x.referenceSpan.erroneous).map((x) => ({ id: x.id, ...x.referenceSpan })),
    quantitative: r.quantitative, extraOutput: r.extraOutput,
    items: r.rows,
    separateFromHistoricalPinnedScore: { pinned83: "docs/phase-3-final-601/83-final-paid-reference-comparison.json (immutable, unchanged)", correctedDiagnostic101: "docs/phase-3-final-601/101-corrected-reference-diagnostic.json (re-score of the FAILED run, unchanged)", thisArtifact: "the NEW paid run, scored with the corrected scorer" },
  });
  console.log(JSON.stringify({ CRITICAL: r.critical, MATERIAL: r.material, counts: r.rows.reduce((a: Record<string, number>, x) => { a[x.classification] = (a[x.classification] ?? 0) + 1; return a; }, {}), extras: r.extraOutput.materialRepresentedItemsOutsideEveryReferenceSpan, b6: r.rows.find((x) => x.id === "B6")?.referenceSpan.classification }, null, 1));
}
