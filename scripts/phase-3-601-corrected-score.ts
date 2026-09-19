/**
 * PHASE 3 / 6.01 remediation §19/§21 - CORRECTED_DIAGNOSTIC_SCORE over the FROZEN paid outputs with the HD-5-fixed
 * numeric correspondence. Diagnostic only: it never replaces the immutable pinned 83/84/85/87 and cannot make the paid
 * trust gate pass. The frozen human reference set is read unmodified; the B6 span defect is classified and recorded,
 * never silently edited. Zero model calls. Run: npx tsx scripts/phase-3-601-corrected-score.ts
 */
import { readFileSync } from "node:fs";
import { section601ReferenceItems } from "./phase-3-601-preflight";
import { writeJson } from "./f7b-lib";
import { numbersIn, contradictsSource } from "./phase-3-601-score-numeric";

const OUT = "docs/phase-3-final-601";
const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";

type Disp = "REPRESENTED" | "INTENTIONALLY_NON_COMPUTATIONAL" | "UNSUPPORTED" | "AMBIGUOUS" | "MISSING_FROM_COMPOSITION";
type Classification = "FOUND_AND_REPRESENTED" | "FOUND_BUT_UNSUPPORTED" | "FOUND_BUT_AMBIGUOUS" | "FOUND_BUT_INCORRECT" | "EXPLICITLY_MISSING" | "NOT_DISCOVERED" | "REFERENCE_SET_ERROR";
interface InvItem { inventoryItemId: string; sourceSpan: { regionId: string; charStart: number; charEnd: number; sourceCitation: string }; materiality: string }
interface RecItem { inventoryItemId: string; materiality: string; disposition: Disp; lineageIrPaths: string[]; quantitative: { value: { rawText: string; normalizedValue: number | null; unit: string | null }; disposition: string; irPaths: string[] }[]; support?: { supportStatus: string } }

export function correctedScore() {
  const compile = JSON.parse(readFileSync(`${RAW}/compile-result.json`, "utf8"));
  const verify = JSON.parse(readFileSync(`${RAW}/verify-result.json`, "utf8"));
  const pinned = JSON.parse(readFileSync(`${OUT}/83-final-paid-reference-comparison.json`, "utf8"));
  const { byLabel: refItems } = section601ReferenceItems();
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

  /** A frozen reference span whose boundary bisects a numeric token is a REFERENCE_SET_ERROR (recorded, never silently corrected). */
  const spanBoundaryDefect = (span: [number, number]): { erroneous: boolean; detail: string } => {
    const tail = srcText.slice(Math.max(0, span[1] - 24), span[1]);
    const next = srcText.slice(span[1], span[1] + 12);
    const cutsWord = /[A-Za-z0-9.]$/.test(tail) && /^[A-Za-z0-9]/.test(next);
    const cutsMoneyPhrase = /\$\s?[\d,.]+\s*(?:m|mi|mil|milli|millio|b|bi|bil|billi|billio)?$/i.test(tail) && /^(?:illion|llion|lion|ion|on|n|million|billion)\b/i.test(next);
    return { erroneous: cutsWord, detail: cutsWord ? `span end ${span[1]} bisects a token: "...${tail.slice(-16)}" | "${next.slice(0, 8)}..."${cutsMoneyPhrase ? " (a money scale word is cut - the pinned scorer read the amount without its scale)" : ""}` : "span boundaries fall between tokens" };
  };

  const rows = refItems.map((R) => {
    const span: [number, number] = [R.span[0], R.span[1]];
    const covering = inv.filter((i) => overlaps(absSpan(i), span));
    const coveringMaterial = covering.filter((i) => isMaterial(i.materiality));
    const dispOf = (i: InvItem) => recById.get(i.inventoryItemId)?.disposition ?? null;
    const matDisp = coveringMaterial.map(dispOf).filter(Boolean) as Disp[];
    const anyDisp = covering.map(dispOf).filter(Boolean) as Disp[];
    const pool = matDisp.length > 0 ? matDisp : anyDisp;
    const sourceNumbers = numbersIn(srcText.slice(span[0], span[1]));
    const coveredQuant = covering.flatMap((i) => (recById.get(i.inventoryItemId)?.quantitative ?? []).map((q) => ({ ...q, itemId: i.inventoryItemId })));
    const checks = coveredQuant.filter((q) => q.value.normalizedValue !== null).map((q) => ({ itemId: q.itemId, raw: q.value.rawText, normalized: q.value.normalizedValue, unit: q.value.unit, ...contradictsSource({ normalizedValue: q.value.normalizedValue, unit: q.value.unit, rawText: q.value.rawText }, sourceNumbers, { fullSourceText: srcText, spanStart: span[0], spanEnd: span[1] }) }));
    const contradictions = checks.filter((c) => c.contradiction);
    const boundary = spanBoundaryDefect(span);
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
    const pinnedRow = (pinned.items as { id: string; classification: string }[]).find((x) => x.id === R.id);
    return { id: R.id, section: R.section, materiality: R.materiality, span, description: R.description, pinnedClassification: pinnedRow?.classification ?? null, classification, changed: (pinnedRow?.classification ?? null) !== classification, recovered, explicitLimitation, incorrect, silentMiss, coveringInventoryItems: covering.length, coveringMaterialItems: coveringMaterial.length, dispositionPool: pool, quantitative: { sourceNumbers, checks, contradictions: contradictions.length }, referenceSpan: { originalSpanPreserved: true, boundaryDefect: boundary, referenceSetErrorRecorded: boundary.erroneous } };
  });
  const tally = (rs: typeof rows) => ({ correct: rs.filter((r) => r.recovered).length, explicitLimitation: rs.filter((r) => r.explicitLimitation).length, incorrect: rs.filter((r) => r.incorrect).length, silent: rs.filter((r) => r.silentMiss).length });
  const critical = tally(rows.filter((r) => r.materiality === "CRITICAL"));
  const material = tally(rows.filter((r) => r.materiality === "MATERIAL"));
  return { rows, critical, material, unitFlaggedForReview, compileStatus, verifyStatus: verify?.status ?? null, pinnedCounts: { critical: pinned.critical, material: pinned.material } };
}

if (process.argv[1] && /phase-3-601-corrected-score\.ts$/.test(process.argv[1])) {
  const r = correctedScore();
  writeJson(`${OUT}/101-corrected-reference-diagnostic.json`, {
    artifact: "PHASE 3 / 6.01 TRUST-FAILURE REMEDIATION §19/§21 - CORRECTED_DIAGNOSTIC_SCORE (HD-5-fixed re-score of the FROZEN paid outputs)",
    label: "CORRECTED_DIAGNOSTIC_SCORE",
    at: new Date().toISOString(),
    diagnosticOnly: true,
    doesNotReplace: ["83-final-paid-reference-comparison.json", "84-final-paid-quantitative-extra-audit.json", "85-final-paid-trust-quality.json", "87-final-paid-verdict.json (PHASE3_601_NOT_SAFE stands)"],
    cannotMakePaidTrustGatePass: "the production trust failure (317 unresolved owned items, 5 values lost, 2 SHARD_MISSING_CONTEXT shards) is independent of the scorer and is unchanged by this re-score",
    inputs: { compileResult: `${RAW}/compile-result.json`, verifyResult: `${RAW}/verify-result.json`, referenceSet: "frozen Section 6.01 reference items (unmodified)", numericModule: "scripts/phase-3-601-score-numeric.ts" },
    unitFlaggedForReview: r.unitFlaggedForReview, compileStatus: r.compileStatus, verifyStatus: r.verifyStatus,
    pinned: r.pinnedCounts,
    CRITICAL: r.critical,
    MATERIAL: r.material,
    items: r.rows,
    b6ReferenceSpanVerdict: r.rows.find((x) => x.id === "B6")?.referenceSpan ?? null,
  });
  console.log(JSON.stringify({ CRITICAL: r.critical, MATERIAL: r.material, changed: r.rows.filter((x) => x.changed).map((x) => `${x.id}: ${x.pinnedClassification} -> ${x.classification}`), b6: r.rows.find((x) => x.id === "B6")?.referenceSpan }, null, 1));
}
