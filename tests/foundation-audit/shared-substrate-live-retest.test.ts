/**
 * ADVERSARIAL FOUNDATION AUDIT - Section 13 (Independent Auditor Dependency
 * Mapping). This is a read-only, adversarial AUDIT test file - it exercises
 * frozen production code (lib/contract-model/compiler/**) exactly as
 * committed and asserts on its REAL behavior. It does not modify, patch, or
 * work around any production file, and it is not part of any release gate.
 *
 * Purpose: re-test, against the CURRENT (post-3F.1.2) code, the exact
 * failure mode Architecture Invariants #18 names and Phase 3F.1.1's
 * forensic report found dominant (a Phase 2A/stage-structure.ts substrate
 * defect defeating both discovery and the "independent" coverage auditor
 * simultaneously) - using a DIFFERENT concrete manifestation than the
 * already-fixed duplicate-nodeKey collision (which 3F.1.2 genuinely closed):
 * a section heading that stage-structure.ts's regex patterns fail to
 * recognize AT ALL (never mind duplicated), because it is case-folded and
 * run together with the end of the preceding paragraph with no line break -
 * a realistic PDF/HTML text-extraction artifact, not a contrived string.
 *
 * This targets the auditor's own SAFETY-NET layer (raw-source-fallback.ts +
 * structural-coverage.ts), not the identity layer 3F.1.2 remediated. 3F.1.2
 * never touched stage-structure.ts's own heading-recognition regexes or
 * structural-coverage.ts's own health-classification logic - both are
 * exactly as they were before 3F.1.2, so this is a live, current-code
 * finding, not a re-litigation of an already-fixed defect.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { computeStructuralCoverage } from "../../lib/contract-model/compiler/structural-coverage";
import { partitionUncoveredSpan, scanRawSourceRegion, buildRawSourceFallbackFindings } from "../../lib/contract-model/compiler/coverage-audit/raw-source-fallback";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";

const OPTS = { companyId: "audit-probe-co", packageKey: "audit-probe-pkg", instrumentKey: null as string | null };

describe("Section 13 live retest: a swallowed mid-document section heading defeats discovery AND the independent auditor's raw-source-fallback simultaneously", () => {
  const documentId = "shared-substrate-live-retest-doc";
  // Section 6.04 is well-formed. Section 6.05's own heading is case-folded
  // ("section 6.05 limitation on affiliate transactions" - lowercase,
  // exactly the shape a text extractor produces when it drops a heading
  // run's own bold/caps styling) and appears mid-paragraph with no
  // preceding newline - defeating every one of stage-structure.ts's
  // SECTION_PATTERNS/INTEGER_SECTION_PATTERNS (the inline pattern requires
  // an uppercase-led title; the line-anchored patterns require the match to
  // start at a line boundary). Section 6.06 is again well-formed.
  const text = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except a Restricted Payment permitted under this Agreement. section 6.05 limitation on affiliate transactions the Borrower will not enter into any transaction with an Affiliate involving $5,000,000 or more without the approval of a majority of disinterested directors, except transactions permitted under this Agreement.

Section 6.06 Liens . Neither party shall grant Liens except Permitted Liens.
`.trim();

  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);

  it("stage-structure.ts never creates a node for 6.05 - the real heading is invisible to the parser", () => {
    expect(index.resolveUniqueNodeByRef(documentId, "6.05").status).toBe("NOT_FOUND");
    expect(nodes.map((n) => n.sectionRef)).toEqual(["VI", "6.04", "6.06"]);
  });

  it("6.05's real operative text (a $5,000,000 affiliate-transaction threshold) is silently absorbed into 6.04's OWN text, mislabeled under the wrong sectionRef", () => {
    const r604 = index.resolveUniqueNodeByRef(documentId, "6.04");
    expect(r604.status).toBe("UNIQUE");
    if (r604.status !== "UNIQUE") throw new Error("unreachable");
    const own = index.getNodeText(r604.node.nodeId, "OWN");
    expect(own).toContain("$5,000,000");
    expect(own).toContain("Affiliate");
  });

  it("PRIMARY DISCOVERY (pass-a-signals.ts) never produces a distinct candidate citing 6.05, and the 6.04 candidate's own signal list is contaminated with 6.05's real economic signal", () => {
    const candidates = runPassADeterministicSignals(documentId, index);
    expect(candidates.some((c) => c.sectionRef === "6.05")).toBe(false);
    const c604 = candidates.find((c) => c.sectionRef === "6.04");
    expect(c604).toBeDefined();
    // The dollar_value signal fired on 6.04's candidate is real - but the
    // $5,000,000 text that fired it is 6.05's real content, not 6.04's own.
    // A downstream consumer citing "documentId::6.04" as governing this
    // threshold would be citing the wrong section - a real provenance
    // integrity defect (Architecture Invariants #1/#3), not merely a
    // missed candidate.
    expect(c604!.signals).toContain("dollar_value");
  });

  it("structural-coverage.ts (the auditor's own document-health gate) reports STRUCTURE_HEALTHY, 100% coverage, zero significant uncovered spans - it sees nothing wrong", () => {
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.health).toBe("STRUCTURE_HEALTHY");
    expect(coverage.coveragePercent).toBe(100);
    expect(coverage.significantUncoveredSpans).toHaveLength(0);
  });

  it("THE CENTRAL FINDING: raw-source-fallback NEVER RUNS for this document at all, reproducing coverage-audit/pipeline.ts's own exact skip condition line-for-line", () => {
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    // This is coverage-audit/pipeline.ts's own literal condition
    // (runIndependentCoverageAudit's loop body): when true, the fallback
    // partition/scan/finding-construction calls are never reached for this
    // document at all.
    const fallbackSkipped = coverage.significantUncoveredSpans.length === 0 && coverage.health === "STRUCTURE_HEALTHY";
    expect(fallbackSkipped).toBe(true);

    // Confirm directly, not just via the boolean: even if invoked anyway,
    // there is no uncovered span to hand to partitionUncoveredSpan, so it
    // is a structural impossibility, not merely an unlucky skip - the
    // fallback's OWN trigger condition (structural HEALTH, computed from
    // top-level ARTICLE/SECTION density only) cannot see a section that
    // silently merged into its neighbor's span.
    const scanResults = coverage.significantUncoveredSpans.flatMap((span) => partitionUncoveredSpan(documentId, text, span, "n/a").map(scanRawSourceRegion));
    const findings = buildRawSourceFallbackFindings({ ...OPTS, documentId, healthReasons: coverage.healthReasons, includeDocumentLevelFinding: coverage.health !== "STRUCTURE_HEALTHY", scanResults });
    expect(findings).toHaveLength(0);
  });

  it("the auditor's OWN independent structural inventory (source-inventory.ts) also produces no distinct region for 6.05, because it too walks index.allNodes() from the SAME stage-structure.ts parser output", () => {
    const regions = buildSourceCoverageInventory(documentId, index, OPTS);
    expect(regions.some((r) => r.sectionRef === "6.05")).toBe(false);
    // The 6.04 region's own possibleUnstructuredMultiItem check (which DOES
    // independently catch a different failure class - enumerated markers
    // inside a node's own OWN text with no corresponding child, e.g. the
    // real LSB 6.14 comma-list gap) does NOT fire here either, because
    // 6.05's swallowed text carries no "(i)"/"(ii)"-shaped markers - it is
    // an entire missing SECTION heading, a categorically different failure
    // shape than an under-split enumerated list.
    const r604 = regions.find((r) => r.sectionRef === "6.04");
    expect(r604?.possibleUnstructuredMultiItem).toBe(false);
  });

  it("downstream consequence for Part 2: an amendment instrument targeting 'Section 6.05' by legal reference cannot resolve at all (NOT_FOUND), independent of any amendment-layer bug", () => {
    // amendment/operative-state.ts and amendment/pipeline.ts both resolve
    // targets via index.resolveUniqueNodeByRef - demonstrated directly here
    // without needing to invoke the amendment pipeline, since the defect is
    // entirely upstream of it.
    expect(index.resolveUniqueNodeByRef(documentId, "6.05").status).toBe("NOT_FOUND");
  });
});

describe("Positive control: raw-source-fallback DOES catch a total parser failure (zero recognized headings anywhere)", () => {
  it("a document with zero recognizable ARTICLE/SECTION headings gets STRUCTURE_FAILED and a real, non-empty raw-source-fallback finding", () => {
    const documentId = "positive-control-zero-nodes";
    // No "Section"/"ARTICLE" keyword anywhere, no line-start bare-number
    // heading shape either - genuinely zero matches for every pattern.
    const text = "the parties agree that neither shall incur indebtedness of more than $10,000,000 in the aggregate without the prior written consent of the required lenders, except indebtedness permitted under the terms hereof.";
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    expect(nodes).toHaveLength(0);

    const index = buildStructuralIndex(new Map([[documentId, { text, nodes: [] }]]), [], []);
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.health).toBe("STRUCTURE_FAILED");

    const scanResults = coverage.significantUncoveredSpans.flatMap((span) => partitionUncoveredSpan(documentId, text, span, "test").map(scanRawSourceRegion));
    const findings = buildRawSourceFallbackFindings({ ...OPTS, documentId, healthReasons: coverage.healthReasons, includeDocumentLevelFinding: true, scanResults });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.findingType === "STRUCTURAL_ANALYSIS_INSUFFICIENT")).toBe(true);
    // The real $10,000,000 covenant-shaped text IS independently surfaced here - unlike the mid-document swallow case above.
    expect(findings.some((f) => f.findingType === "RAW_SOURCE_COVENANT_SIGNAL")).toBe(true);
    void index; // constructed to mirror real pipeline usage; not otherwise queried in this control.
  });
});

describe("Positive control: raw-source-fallback DOES catch severe node-density collapse (STRUCTURE_INSUFFICIENT)", () => {
  it("a large real document collapsing to 1 top-level node is flagged, not silently accepted as healthy", () => {
    const documentId = "positive-control-density-collapse";
    const filler = "This clause imposes a real, substantive obligation regarding indebtedness, liens, and restricted payments that a real drafter would ordinarily have subdivided into its own numbered section. ".repeat(700);
    const text = `ARTICLE VI COVENANTS\n\nSection 6.01 Indebtedness . ${filler}`;
    const nodes = parseDocumentStructure({ documentId, label: documentId, text });
    const coverage = computeStructuralCoverage(documentId, text, nodes);
    expect(coverage.topLevelNodeCount).toBeLessThanOrEqual(2);
    expect(coverage.health).not.toBe("STRUCTURE_HEALTHY");
  });
});
