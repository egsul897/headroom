/**
 * Agent 6 — independent covenant-discovery completeness audit.
 *
 * Inventories restriction SECTION headings from authentic package structure
 * (operative base document), then compares to:
 *   - frozen must-discover expectations (not retuned)
 *   - deterministic Pass A hits
 *
 * Reports missed restrictions (Pass A misses) and expectation-coverage gaps
 * (source restrictions outside the 20 must-discover pins). Never fabricates
 * LLM discovery or retunes expectation pins.
 *
 *   npx tsx scripts/agent6/audit-discovery-completeness.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { isCovenantHeadlineHeading, runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { assessPassAPopulation } from "../../lib/contract-model/compiler/discovery/eligibility";

const ROOT = "tests/fixtures/authentic-packages";
const EXPECT_DIR = "docs/agent-6-authentic-company-e2e/02-independent-expected-outcomes";
const OUT_DIR = "docs/agent-6-authentic-company-e2e/08-discovery-completeness-audit";
const PIN_FILE = "docs/agent-6-authentic-company-e2e/00-expectation-pins.json";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeSectionRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/(\d+(?:\.\d+)*)/);
  return m?.[1] ?? ref.trim();
}

function sectionMatches(a: string | null, b: string | null | undefined): boolean {
  const x = normalizeSectionRef(a);
  const y = normalizeSectionRef(b ?? null);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`);
}

/** Additional restrictive constructions beyond headline vocabulary (inventory only). */
const RESTRICTIVE_HEADING =
  /\b(?:Negative Covenants?|Affirmative Covenants?|Financial Covenant|Burdensome Agreements?|Restrictive Agreements?|Transactions with Affiliates|Sale and Leaseback|Swap|Hedging|Limitation on|Limitations on|Restricted Debt|Junior Debt|Optional Prepayment)\b/i;

function isRestrictionHeading(heading: string): boolean {
  return isCovenantHeadlineHeading(heading) || RESTRICTIVE_HEADING.test(heading);
}

interface ExpectedOutcomes {
  companyKey: string;
  operativePackage: { operativeBaseDocumentId: string };
  covenantsExpected: Array<{ family: string; sectionRef?: string | null; mustDiscover?: boolean }>;
}

function auditCompany(companyKey: string) {
  const manifest = JSON.parse(readFileSync(join(ROOT, companyKey, "package-manifest.json"), "utf8")) as {
    companyKey: string;
    issuer: string;
    documents: Array<{ documentId: string; file: string; label: string }>;
  };
  const expected = JSON.parse(readFileSync(join(EXPECT_DIR, `${companyKey}.json`), "utf8")) as ExpectedOutcomes;
  const expectationSha = sha256(readFileSync(join(EXPECT_DIR, `${companyKey}.json`), "utf8"));
  const pins = JSON.parse(readFileSync(PIN_FILE, "utf8")) as { expectationPins: Record<string, string> };
  const pinOk = pins.expectationPins[companyKey] === expectationSha;

  const docs = manifest.documents.map((d) => ({
    documentId: d.documentId,
    label: d.label,
    text: readFileSync(join(ROOT, companyKey, "extracted-text", d.file), "utf8"),
  }));
  const structureResult = runStructureStage(docs);
  const allNodes = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: typeof allNodes }>();
  const allDefinitions: DetectedDefinition[] = [];
  const allReferences: DetectedReference[] = [];
  for (const doc of docs) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const baseId = expected.operativePackage.operativeBaseDocumentId;
  const baseSections = allNodes.filter((n) => n.documentId === baseId && n.nodeType === "SECTION");
  const packageSections = allNodes.filter((n) => n.nodeType === "SECTION");

  /** Inventory restriction-headline SECTIONs across the whole package (base + amendments). */
  const restrictionInventory = packageSections
    .filter((n) => isRestrictionHeading(n.heading))
    .map((n) => ({
      documentId: n.documentId,
      sectionRef: n.sectionRef,
      heading: n.heading.replace(/\s+/g, " ").trim().slice(0, 160),
      nodeId: n.nodeId,
      onOperativeBase: n.documentId === baseId,
      sourceProvenance: {
        kind: "STRUCTURAL_SECTION_HEADING" as const,
        documentId: n.documentId,
        sectionRef: n.sectionRef,
        nodeKey: n.nodeKey,
      },
    }));

  // Deduplicate by normalized sectionRef + documentId (keep first).
  const seen = new Set<string>();
  const dedupedInventory = restrictionInventory.filter((r) => {
    const k = `${r.documentId}::${normalizeSectionRef(r.sectionRef)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const passAByDoc = new Map(docs.map((d) => [d.documentId, runPassADeterministicSignals(d.documentId, index)] as const));
  const allPassA = [...passAByDoc.values()].flat();
  const eligibility = assessPassAPopulation(allPassA);
  const mustDiscover = expected.covenantsExpected.filter((c) => c.mustDiscover !== false);

  const rows = dedupedInventory.map((r) => {
    const inExpectations = mustDiscover.some((c) => sectionMatches(r.sectionRef, c.sectionRef ?? null));
    const expectedFamilies = mustDiscover
      .filter((c) => sectionMatches(r.sectionRef, c.sectionRef ?? null))
      .map((c) => c.family);
    const passAHit = allPassA.some((c) => sectionMatches(c.sectionRef, r.sectionRef));
    return {
      ...r,
      inMustDiscoverExpectations: inExpectations,
      expectedFamilies,
      passAHit,
      passAExecutable: false as const,
      classification: !passAHit
        ? ("MISSED_RESTRICTION_PASS_A" as const)
        : !inExpectations
          ? ("PASS_A_HIT_OUTSIDE_MUST_DISCOVER_PINS" as const)
          : ("EXPECTED_AND_PASS_A_HIT" as const),
    };
  });

  const missedRestrictions = rows.filter((r) => r.classification === "MISSED_RESTRICTION_PASS_A");
  const outsidePins = rows.filter((r) => r.classification === "PASS_A_HIT_OUTSIDE_MUST_DISCOVER_PINS");
  const expectedHits = rows.filter((r) => r.classification === "EXPECTED_AND_PASS_A_HIT");

  /** Must-discover pins with no restriction-headline SECTION on operative base (structural coverage gap). */
  const structuralBaseGaps = mustDiscover.map((c) => {
    const onBase = baseSections.some((n) => sectionMatches(n.sectionRef, c.sectionRef ?? null));
    const restrictionOnBase = dedupedInventory.some(
      (r) => r.onOperativeBase && sectionMatches(r.sectionRef, c.sectionRef ?? null),
    );
    const passAHitAnywhere = allPassA.some((cand) => sectionMatches(cand.sectionRef, c.sectionRef ?? null));
    const passAHitOnBase = (passAByDoc.get(baseId) ?? []).some((cand) =>
      sectionMatches(cand.sectionRef, c.sectionRef ?? null),
    );
    return {
      family: c.family,
      sectionRef: c.sectionRef ?? null,
      sectionNodeOnOperativeBase: onBase,
      restrictionHeadingOnOperativeBase: restrictionOnBase,
      passAHitOnOperativeBase: passAHitOnBase,
      passAHitAnywhereInPackage: passAHitAnywhere,
      gap: !onBase
        ? ("STRUCTURAL_SECTION_ABSENT_ON_OPERATIVE_BASE" as const)
        : !passAHitOnBase
          ? ("PASS_A_MISS_ON_OPERATIVE_BASE" as const)
          : ("COVERED_ON_OPERATIVE_BASE" as const),
    };
  });

  const uniqueOutsideBySection = new Map<string, (typeof outsidePins)[0]>();
  for (const r of outsidePins) {
    const k = normalizeSectionRef(r.sectionRef) ?? r.sectionRef;
    if (k && !uniqueOutsideBySection.has(k)) uniqueOutsideBySection.set(k, r);
  }

  return {
    companyKey,
    issuer: manifest.issuer,
    generatedAt: new Date().toISOString(),
    expectationPinPreserved: pinOk,
    expectationSha256: expectationSha,
    frozenPinSha256: pins.expectationPins[companyKey] ?? null,
    operativeBaseDocumentId: baseId,
    sourceProvenancePolicy:
      "STRUCTURAL_SECTION_HEADING across package documents — no LLM, no retuned expectations. Missed = inventory row with no Pass A hit.",
    inventory: {
      restrictionSectionsPackage: dedupedInventory.length,
      restrictionSectionsOnBase: dedupedInventory.filter((r) => r.onOperativeBase).length,
      mustDiscoverPins: mustDiscover.length,
      expectedAndPassAHit: expectedHits.length,
      passAHitOutsideMustDiscoverPins: outsidePins.length,
      uniqueOutsideMustDiscoverSectionRefs: uniqueOutsideBySection.size,
      missedRestrictionsPassA: missedRestrictions.length,
      structuralBaseGaps: structuralBaseGaps.filter((g) => g.gap !== "COVERED_ON_OPERATIVE_BASE").length,
    },
    missedRestrictions,
    passAHitsOutsideMustDiscoverPins: [...uniqueOutsideBySection.values()],
    expectedAndPassAHit: expectedHits.map((r) => ({
      sectionRef: r.sectionRef,
      heading: r.heading,
      documentId: r.documentId,
      expectedFamilies: r.expectedFamilies,
      sourceProvenance: r.sourceProvenance,
    })),
    structuralBaseGaps,
    agent1Eligibility: {
      passACandidatesPackage: eligibility.total,
      executableCount: eligibility.executableCount,
      policy: eligibility.policy,
      note: "Pass A hits never become executable solely from this audit.",
    },
    allRows: rows,
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const companies = readdirSync(ROOT)
    .filter((d) => existsSync(join(ROOT, d, "package-manifest.json")))
    .sort();

  const audits = companies.map((c) => {
    console.log(`\n=== DISCOVERY COMPLETENESS AUDIT ${c} ===`);
    const a = auditCompany(c);
    writeFileSync(join(OUT_DIR, `${c}.json`), JSON.stringify(a, null, 2) + "\n");
    console.log(
      JSON.stringify(
        {
          companyKey: a.companyKey,
          pinPreserved: a.expectationPinPreserved,
          inventory: a.inventory,
          missedCount: a.missedRestrictions.length,
        },
        null,
        2,
      ),
    );
    return a;
  });

  const aggregate = {
    generatedAt: new Date().toISOString(),
    costUsd: 0,
    expectationPinsPreserved: audits.every((a) => a.expectationPinPreserved),
    totalMustDiscoverPins: audits.reduce((n, a) => n + a.inventory.mustDiscoverPins, 0),
    totalRestrictionSectionsInventoried: audits.reduce((n, a) => n + a.inventory.restrictionSectionsPackage, 0),
    totalMissedRestrictionsPassA: audits.reduce((n, a) => n + a.inventory.missedRestrictionsPassA, 0),
    totalUniqueOutsideMustDiscoverPins: audits.reduce((n, a) => n + a.inventory.uniqueOutsideMustDiscoverSectionRefs, 0),
    totalStructuralBaseGaps: audits.reduce((n, a) => n + a.inventory.structuralBaseGaps, 0),
    companies: audits.map((a) => ({
      companyKey: a.companyKey,
      pinPreserved: a.expectationPinPreserved,
      inventory: a.inventory,
      missedRestrictionSectionRefs: a.missedRestrictions.map((m) => m.sectionRef),
      outsidePinSectionRefs: a.passAHitsOutsideMustDiscoverPins.map((m) => m.sectionRef),
      structuralBaseGapRefs: a.structuralBaseGaps.filter((g) => g.gap !== "COVERED_ON_OPERATIVE_BASE").map((g) => ({
        sectionRef: g.sectionRef,
        gap: g.gap,
        passAHitAnywhereInPackage: g.passAHitAnywhereInPackage,
      })),
    })),
    notes: [
      "Frozen expectation pins were not modified.",
      "Missed restrictions = restriction-headline SECTION inventory rows with no Pass A hit anywhere in the package.",
      "Outside-pin hits are completeness beyond the 20 must-discover expectations — not retuned into pins.",
      "Structural base gaps (e.g. Knife River Article VII under-parse) are reported separately from Pass A misses.",
      "Pass A executableCount is always 0 (Agent 1 conservative eligibility).",
    ],
  };
  writeFileSync(join(OUT_DIR, "aggregate.json"), JSON.stringify(aggregate, null, 2) + "\n");
  console.log("\n=== AGGREGATE ===");
  console.log(JSON.stringify(aggregate, null, 2));
}

main();
