/**
 * Agent 6 — score independent discovery ground truth vs Pass A (evaluation only).
 *
 * Loads reviewer-selected GT samples from
 *   docs/agent-6-authentic-company-e2e/11-independent-discovery-ground-truth/
 * Runs structural index + Pass A (deterministic, $0). Does NOT retune pins or GT.
 *
 * Layers explicitly out of scope: interpretation, verification, execution.
 * Discovery ≠ interpretation ≠ verification ≠ execution.
 *
 *   npx tsx scripts/agent6/score-independent-discovery.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import {
  isCovenantHeadlineHeading,
  runPassADeterministicSignals,
} from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import type { DeterministicCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const FIXTURE_ROOT = "tests/fixtures/authentic-packages";
const GT_DIR = "docs/agent-6-authentic-company-e2e/11-independent-discovery-ground-truth";
const EXPECT_DIR = "docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes";
const PIN_FILE = "docs/agent-6-authentic-company-e2e/00-expectation-pins.json";
const SAMPLE_FILES = ["knife-river-sample.json", "insulet-sample.json", "benchmark-sample.json"] as const;

type ExpectedFamily =
  | "INDEBTEDNESS"
  | "LIENS"
  | "RESTRICTED_PAYMENTS"
  | "INVESTMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "FINANCIAL"
  | "OTHER";

interface GtItem {
  id: string;
  companyKey: string;
  category: string;
  expectedFamily: ExpectedFamily;
  operativeDocumentId: string;
  sectionRef: string;
  sourceExcerpt: string;
  sourceCharStart: number;
  sourceSha256: string;
  mustDiscoverPin: boolean;
  notes?: string;
}

interface GtSample {
  companyKey: string;
  issuer: string;
  items: GtItem[];
  documents: Array<{ documentId: string; file: string; sourceSha256: string }>;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeSectionRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/(\d+(?:\.\d+)*)/);
  return m?.[1] ?? ref.trim();
}

/** Match section refs allowing parent/child (7.01 ↔ 7.01(b) / 7.01.1). */
function sectionMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeSectionRef(a ?? null);
  const y = normalizeSectionRef(b ?? null);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`);
}

/** Best-effort family hint from heading + Pass A signals — never sealed interpretation. */
function familyHintFromHit(
  expected: ExpectedFamily,
  heading: string,
  signals: string[],
): { familyHint: ExpectedFamily | "UNKNOWN"; matched: boolean } {
  const h = heading.replace(/\s+/g, " ");
  const guesses: Array<{ fam: ExpectedFamily; re: RegExp }> = [
    { fam: "INDEBTEDNESS", re: /\bIndebtedness\b|\bDebt\b/i },
    { fam: "LIENS", re: /\bLiens?\b/i },
    { fam: "RESTRICTED_PAYMENTS", re: /\bRestricted Payments?\b/i },
    { fam: "INVESTMENTS", re: /\bInvestments?\b/i },
    { fam: "ASSET_SALES", re: /\b(?:Asset\s+Dispositions?|Dispositions?|Asset Sales?|Fundamental Changes?)\b/i },
    { fam: "AFFILIATE_TRANSACTIONS", re: /\bAffiliate\b/i },
    { fam: "FINANCIAL", re: /\bFinancial Covenants?\b|\bLeverage Ratio\b|\bCoverage Ratio\b/i },
  ];
  let fromHeading: ExpectedFamily | "UNKNOWN" = "UNKNOWN";
  for (const g of guesses) {
    if (g.re.test(h)) {
      fromHeading = g.fam;
      break;
    }
  }
  // Signal-only soft hint when heading is silent
  if (fromHeading === "UNKNOWN" && signals.includes("financial_metric") && expected === "FINANCIAL") {
    fromHeading = "FINANCIAL";
  }
  if (fromHeading === "UNKNOWN" && signals.includes("builder_language") && expected === "RESTRICTED_PAYMENTS") {
    fromHeading = "RESTRICTED_PAYMENTS";
  }
  if (expected === "OTHER") {
    return { familyHint: fromHeading, matched: fromHeading === "UNKNOWN" || fromHeading === "OTHER" };
  }
  return { familyHint: fromHeading, matched: fromHeading === expected };
}

function loadPins(companyKey: string): Set<string> {
  const expected = JSON.parse(readFileSync(join(EXPECT_DIR, `${companyKey}.json`), "utf8")) as {
    covenantsExpected: Array<{ sectionRef?: string | null; mustDiscover?: boolean }>;
  };
  const set = new Set<string>();
  for (const c of expected.covenantsExpected) {
    if (c.mustDiscover === false) continue;
    const n = normalizeSectionRef(c.sectionRef ?? null);
    if (n) set.add(n);
  }
  return set;
}

function operativeBaseId(companyKey: string): string {
  const expected = JSON.parse(readFileSync(join(EXPECT_DIR, `${companyKey}.json`), "utf8")) as {
    operativePackage: { operativeBaseDocumentId: string };
  };
  return expected.operativePackage.operativeBaseDocumentId;
}

function scoreCompany(sample: GtSample) {
  const companyKey = sample.companyKey;
  const manifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, companyKey, "package-manifest.json"), "utf8")) as {
    issuer: string;
    documents: Array<{ documentId: string; file: string; label: string }>;
  };
  const pinShaFile = JSON.parse(readFileSync(PIN_FILE, "utf8")) as { expectationPins: Record<string, string> };
  const expectRaw = readFileSync(join(EXPECT_DIR, `${companyKey}.json`), "utf8");
  const expectationPinPreserved = pinShaFile.expectationPins[companyKey] === sha256(expectRaw);
  const mustDiscoverSections = loadPins(companyKey);
  const baseId = operativeBaseId(companyKey);

  const docs = manifest.documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: readFileSync(join(FIXTURE_ROOT, companyKey, "extracted-text", d.file), "utf8"),
  }));

  // Verify GT source hashes still match fixture files (integrity, not retune).
  const shaByDoc = new Map(docs.map((d) => {
    const file = manifest.documents.find((m) => m.documentId === d.documentId)!.file;
    const bytes = readFileSync(join(FIXTURE_ROOT, companyKey, "extracted-text", file));
    return [d.documentId, createHash("sha256").update(bytes).digest("hex")] as const;
  }));
  for (const item of sample.items) {
    const expectedSha = shaByDoc.get(item.operativeDocumentId);
    if (expectedSha && item.sourceSha256 !== expectedSha) {
      throw new Error(`GT sourceSha256 mismatch for ${item.id}: fixture changed under GT`);
    }
    const docText = docs.find((d) => d.documentId === item.operativeDocumentId)?.text ?? "";
    const slice = docText.slice(item.sourceCharStart, item.sourceCharStart + item.sourceExcerpt.length);
    if (slice !== item.sourceExcerpt) {
      throw new Error(`GT excerpt mismatch for ${item.id} at char ${item.sourceCharStart}`);
    }
  }

  const structureResult = runStructureStage(docs);
  const allNodes = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of docs) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const passAByDoc = new Map(
    docs.map((d) => [d.documentId, runPassADeterministicSignals(d.documentId, index)] as const),
  );
  const allPassA = [...passAByDoc.values()].flat();
  const nodeById = new Map(allNodes.map((n) => [n.nodeId, n]));

  const gtSectionKeys = new Set<string>();
  for (const item of sample.items) {
    const n = normalizeSectionRef(item.sectionRef);
    if (n) gtSectionKeys.add(n);
  }

  const scoredItems = sample.items.map((item) => {
    const local = passAByDoc.get(item.operativeDocumentId) ?? [];
    const localHits = local.filter((c) => sectionMatches(c.sectionRef, item.sectionRef));
    const packageHits = allPassA.filter((c) => sectionMatches(c.sectionRef, item.sectionRef));
    const documentLocalHit = localHits.length > 0;
    const packageLevelHit = packageHits.length > 0;

    const bestHit: DeterministicCandidate | undefined = localHits[0] ?? packageHits[0];
    let heading = "";
    if (bestHit) {
      heading = nodeById.get(bestHit.nodeId)?.heading ?? "";
    }
    const hint = familyHintFromHit(item.expectedFamily, heading, bestHit?.signals ?? []);

    return {
      id: item.id,
      category: item.category,
      expectedFamily: item.expectedFamily,
      operativeDocumentId: item.operativeDocumentId,
      sectionRef: item.sectionRef,
      mustDiscoverPin: item.mustDiscoverPin,
      documentLocalHit,
      packageLevelHit,
      familyHint: hint.familyHint,
      familyHintMatchedExpected: hint.matched,
      localHitCount: localHits.length,
      packageHitCount: packageHits.length,
      sampleLocalSignals: (localHits[0] ?? packageHits[0])?.signals?.slice(0, 8) ?? [],
      classification: documentLocalHit ? ("TP" as const) : ("FN" as const),
      notes: item.notes ?? null,
    };
  });

  const tp = scoredItems.filter((r) => r.classification === "TP");
  const fn = scoredItems.filter((r) => r.classification === "FN");
  const packageLevelTp = scoredItems.filter((r) => r.packageLevelHit);

  // Bounded FP sample: Pass A SECTION candidates on operative base with covenant
  // headline that are neither in this GT sample nor in frozen must-discover pins.
  const basePassA = passAByDoc.get(baseId) ?? [];
  const fpCandidates = basePassA
    .filter((c) => {
      const node = nodeById.get(c.nodeId);
      if (!node || node.nodeType !== "SECTION") return false;
      if (!isCovenantHeadlineHeading(node.heading)) return false;
      const n = normalizeSectionRef(c.sectionRef);
      if (!n) return false;
      if ([...gtSectionKeys].some((g) => sectionMatches(g, n))) return false;
      if ([...mustDiscoverSections].some((p) => sectionMatches(p, n))) return false;
      return true;
    })
    .map((c) => {
      const node = nodeById.get(c.nodeId)!;
      return {
        documentId: c.documentId,
        sectionRef: c.sectionRef,
        heading: node.heading.replace(/\s+/g, " ").trim().slice(0, 160),
        signals: c.signals.slice(0, 10),
        classification: "FP_BOUNDED" as const,
      };
    });

  // Dedupe FP by normalized sectionRef
  const fpSeen = new Set<string>();
  const falsePositivesBounded = fpCandidates.filter((f) => {
    const k = normalizeSectionRef(f.sectionRef) ?? f.sectionRef;
    if (fpSeen.has(k)) return false;
    fpSeen.add(k);
    return true;
  });

  const n = scoredItems.length;
  const documentLocalRecall = n === 0 ? null : tp.length / n;
  const packageLevelRecall = n === 0 ? null : packageLevelTp.length / n;

  return {
    companyKey,
    issuer: manifest.issuer,
    expectationPinPreserved,
    operativeBaseDocumentId: baseId,
    gtItemCount: n,
    mustDiscoverPinCountInSample: scoredItems.filter((r) => r.mustDiscoverPin).length,
    scores: {
      TP: tp.length,
      FN: fn.length,
      FP_bounded: falsePositivesBounded.length,
      documentLocalRecall,
      packageLevelRecall,
      familyHintMatchRate:
        n === 0 ? null : scoredItems.filter((r) => r.familyHintMatchedExpected).length / n,
    },
    falseNegatives: fn.map((r) => ({
      id: r.id,
      sectionRef: r.sectionRef,
      operativeDocumentId: r.operativeDocumentId,
      packageLevelHit: r.packageLevelHit,
      expectedFamily: r.expectedFamily,
      category: r.category,
      notes: r.notes,
    })),
    falsePositivesBounded,
    items: scoredItems,
    layerBoundaries: {
      discovery: "IN_SCOPE",
      interpretation: "OUT_OF_SCOPE_familyHint_best_effort_only",
      verification: "OUT_OF_SCOPE",
      execution: "OUT_OF_SCOPE",
    },
  };
}

function main() {
  mkdirSync(GT_DIR, { recursive: true });
  const companyResults = [];

  for (const file of SAMPLE_FILES) {
    const path = join(GT_DIR, file);
    if (!existsSync(path)) {
      throw new Error(`Missing GT sample: ${path}`);
    }
    const sample = JSON.parse(readFileSync(path, "utf8")) as GtSample;
    console.log(`\n=== SCORE ${sample.companyKey} (${sample.items.length} GT items) ===`);
    const result = scoreCompany(sample);
    companyResults.push(result);
    console.log(
      JSON.stringify(
        {
          companyKey: result.companyKey,
          scores: result.scores,
          fnIds: result.falseNegatives.map((f) => f.id),
          fpBoundedCount: result.falsePositivesBounded.length,
        },
        null,
        2,
      ),
    );
  }

  const totalGt = companyResults.reduce((n, r) => n + r.gtItemCount, 0);
  const totalTp = companyResults.reduce((n, r) => n + r.scores.TP, 0);
  const totalFn = companyResults.reduce((n, r) => n + r.scores.FN, 0);
  const totalFp = companyResults.reduce((n, r) => n + r.scores.FP_bounded, 0);
  const totalPackageTp = companyResults.reduce(
    (n, r) => n + r.items.filter((i) => i.packageLevelHit).length,
    0,
  );

  const matrix = {
    generatedAt: new Date().toISOString(),
    costUsd: 0,
    method:
      "Independent human-read GT vs Pass A + structural index (evaluation only). Pins not retuned. Discovery ≠ interpretation ≠ verification ≠ execution.",
    definitions: {
      TP: "GT item with documentLocalHit (Pass A on operativeDocumentId matching sectionRef)",
      FN: "GT item without documentLocalHit (even if packageLevelHit)",
      FP_bounded:
        "Pass A SECTION candidates on operative base with covenant headline that are not in GT and not in frozen must-discover pins (bounded sample, not exhaustive)",
      documentLocalRecall: "TP / GT items",
      packageLevelRecall: "GT items with Pass A hit on any package document matching sectionRef / GT items",
      familyHint: "Best-effort heading/signal suggestion only — not sealed interpretation",
    },
    expectationPinsPreserved: companyResults.every((r) => r.expectationPinPreserved),
    totals: {
      gtItems: totalGt,
      TP: totalTp,
      FN: totalFn,
      FP_bounded: totalFp,
      documentLocalRecall: totalGt === 0 ? null : totalTp / totalGt,
      packageLevelRecall: totalGt === 0 ? null : totalPackageTp / totalGt,
    },
    falseNegatives: companyResults.flatMap((r) =>
      r.falseNegatives.map((f) => ({ companyKey: r.companyKey, ...f })),
    ),
    companies: companyResults,
    notes: [
      "Ground truth was not generated from Pass A, isCovenantHeadlineHeading, or structural-heading inventory.",
      "mustDiscoverPin on GT items is a separate frozen-pin label, not the GT selection criterion.",
      "FP is intentionally bounded (headline SECTION on operative base outside GT∪pins), not an exhaustive precision census.",
      "A packageLevelHit without documentLocalHit remains FN for document-local scoring.",
    ],
  };

  const outPath = join(GT_DIR, "accuracy-matrix.json");
  writeFileSync(outPath, JSON.stringify(matrix, null, 2) + "\n");
  console.log("\n=== ACCURACY MATRIX ===");
  console.log(
    JSON.stringify(
      {
        costUsd: matrix.costUsd,
        totals: matrix.totals,
        falseNegatives: matrix.falseNegatives,
        wrote: outPath,
      },
      null,
      2,
    ),
  );
}

main();
