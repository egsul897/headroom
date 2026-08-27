/**
 * Phase 2E fault-injection scenarios (task §25/§26/§27/§41). Shared
 * between the vitest regression gate and scripts/phase-2e-fault-injection.ts
 * (the persisted, reproducible manifest run) so both exercise identical
 * logic - no drift between what is asserted in CI and what is reported.
 *
 * Starts from a CORRECT synthetic primary-pipeline output (a real
 * DiscoveredCandidate[] + a real Phase 2D CovenantContextBundle built via
 * the real buildCovenantContextBundle, plus a real PackageGraphResult),
 * then deliberately removes/corrupts exactly one material item per
 * scenario (task §25's own required 12-item list, mapped 1:1 onto
 * InjectedDefectType) and records whether the independent auditor
 * rediscovers the problem on its own.
 */
import { buildCovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import { buildSourceCoverageInventory } from "../../lib/contract-model/compiler/coverage-audit/source-inventory";
import { auditDiscoveryCoverage } from "../../lib/contract-model/compiler/coverage-audit/discovery-comparison";
import { auditContextCoverage } from "../../lib/contract-model/compiler/coverage-audit/context-comparison";
import { auditDefinitionCompleteness } from "../../lib/contract-model/compiler/coverage-audit/definition-audit";
import { computeInjectionId } from "../../lib/contract-model/compiler/coverage-audit/identity";
import type { AuditFinding, FaultManifestEntry, InjectedDefectType } from "../../lib/contract-model/compiler/coverage-audit/types";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { CovenantContextBundle } from "../../lib/contract-model/compiler/context-retrieval/types";
import type { PackageGraphResult, ModificationCandidate } from "../../lib/contract-model/compiler/package-graph/types";
import { buildTestIndex, buildExactTermsByDocument, makeCandidate, removeItem, removeUnresolved } from "./coverage-audit-test-utils";

const DOC = "fault-doc";
const COMPANY = "fault-company";
const PACKAGE = "fault-package";

// A single, structurally rich synthetic section carrying every material
// element the 12 injections will each remove exactly one of: a parent
// prohibition, a child basket, a trailing proviso, a shared cap, a
// definition, a nested definition, a calculation cross-reference, an
// entity-scope condition, and (via the amendment/package-graph layer) an
// amendment lead and an unresolved-dependency signal.
const TEXT = [
  `SECTION 6.01. Indebtedness . The Borrower shall not incur Indebtedness.`,
  `(a) Indebtedness not to exceed the greater of $10,000,000 and 15% of "Consolidated EBITDA" shall be permitted, calculated in accordance with the pro forma methodology set forth in Section 1.05.`,
  `(b) Indebtedness incurred to finance a Permitted Acquisition not to exceed $20,000,000 shall be permitted.`,
  `(c) provided that no Default shall have occurred and is continuing at the time of any incurrence under this Section 6.01.`,
  `(d) the aggregate amount of Indebtedness incurred in reliance on clauses (a) and (b) above shall not exceed $25,000,000.`,
  `(e) this Section 6.01 shall apply only to Restricted Subsidiaries that are Domestic Subsidiaries.`,
  `(f) compliance with this Section 6.01 shall be calculated in accordance with the pro forma methodology set forth in Section 1.05.`,
  `" Consolidated EBITDA " means net income plus interest, taxes, depreciation and amortization, each as determined by reference to " Consolidated Net Income " .`,
  `" Consolidated Net Income " means the net income of the Borrower and its Restricted Subsidiaries on a consolidated basis.`,
  `SECTION 1.05. Pro Forma Calculations . Pro forma compliance shall be determined using the accounting principles set forth herein.`,
].join(" ");

function buildBaseline() {
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text: TEXT }]);
  const exactTerms = buildExactTermsByDocument([{ documentId: DOC, label: "CA", text: TEXT }]);
  const parentNode = index.getNodeByRef(DOC, "6.01")!;
  const childA = index.getNodeByRef(DOC, "6.01(a)")!;

  const candidates: DiscoveredCandidate[] = [
    makeCandidate({ documentId: DOC, structuralNodeKeys: [parentNode.nodeKey], normalizedSourceRef: "6.01", multipleRulesLikely: true }),
    makeCandidate({ documentId: DOC, structuralNodeKeys: [childA.nodeKey], normalizedSourceRef: "6.01(a)" }),
    makeCandidate({ documentId: DOC, structuralNodeKeys: [index.getNodeByRef(DOC, "6.01(b)")!.nodeKey], normalizedSourceRef: "6.01(b)" }),
  ];

  const modificationCandidate: ModificationCandidate = {
    sourceDocumentId: "amendment-doc",
    sourceNodeCitation: "amendment-doc::1",
    sourceText: "Section 6.01 is hereby amended and restated to increase the threshold in clause (a) to $15,000,000",
    operation: "RESTATE",
    targetDocumentId: DOC,
    targetHint: null,
    targetSectionRef: "6.01",
    targetDefinedTermRef: null,
    status: "RESOLVED",
    unresolvedReason: null,
    confidence: 0.9,
  };
  const packageGraph: PackageGraphResult = {
    companyId: COMPANY,
    packageKey: PACKAGE,
    classifications: [],
    identities: [],
    relationshipCandidates: [],
    modificationCandidates: [modificationCandidate],
    crossDocumentReferenceLeads: [],
    instruments: [],
    performance: { documentCount: 2, totalCharsScanned: TEXT.length, relationshipCandidatesGenerated: 0, relationshipsResolved: 0, relationshipsUnresolved: 0, modificationCandidatesGenerated: 1, crossDocumentReferenceLeadsGenerated: 0, wallClockMs: 0, semanticCallsUsed: 0 },
  };

  // The context bundle is anchored at the LEAF candidate 6.01(a), not the
  // parent 6.01 - Phase 2D classifies PROVISO/SHARED_CAP/ENTITY_SCOPE
  // roles only for the operative node's own SIBLINGS (task-mirrored
  // structural-context.ts logic), while direct CHILDREN are always
  // retrieved as plain CHILD_RULE. Anchoring at 6.01(a) makes 6.01(c)/(d)/
  // (e) real siblings, exactly as a real discovered leaf-level covenant
  // candidate would be audited in production.
  const bundle = buildCovenantContextBundle({ candidate: candidates[1]!, packageKey: PACKAGE, companyId: COMPANY, instrumentKey: null }, { index, packageGraph, exactTermsByDocument: exactTerms });

  return { index, candidates, packageGraph, bundle };
}

export interface FaultScenario {
  defectType: InjectedDefectType;
  materiality: "MATERIAL";
  sourceLocation: string;
  expectedAuditorBehavior: string;
  runAudit: () => AuditFinding[];
  matchesExpectedFinding: (findings: AuditFinding[]) => boolean;
}

export function buildFaultScenarios(): { baselineFindings: AuditFinding[]; scenarios: FaultScenario[] } {
  const { index, candidates, packageGraph, bundle } = buildBaseline();
  const regions = buildSourceCoverageInventory(DOC, index, { companyId: COMPANY, packageKey: PACKAGE, instrumentKey: null });

  const runDiscovery = (cands: DiscoveredCandidate[]) => auditDiscoveryCoverage(regions, cands, index);
  const runContext = (b: CovenantContextBundle, pg: PackageGraphResult | null = packageGraph) => [...auditContextCoverage({ companyId: COMPANY, packageKey: PACKAGE, instrumentKey: null, documentId: DOC, nodeKey: index.getNodeByRef(DOC, "6.01(a)")!.nodeKey, index, packageGraph: pg, bundle: b }), ...auditDefinitionCompleteness(b, index, DOC, COMPANY, PACKAGE, null)];

  const baselineFindings = [...runDiscovery(candidates), ...runContext(bundle)].filter((f) => f.materiality === "MATERIAL");

  const scenarios: FaultScenario[] = [
    {
      defectType: "REMOVE_BASKET",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::6.01(b)`,
      expectedAuditorBehavior: "auditDiscoveryCoverage flags 6.01(b) as PARTIAL_DISCOVERY or MATERIAL_DISCOVERY_MISS once its candidate is removed (its own sibling 6.01(a) still has a distinct candidate, so ancestor-only credit is not accepted)",
      runAudit: () => runDiscovery(candidates.filter((c) => c.normalizedSourceRef !== "6.01(b)")),
      matchesExpectedFinding: (f) => f.some((x) => (x.findingType === "MATERIAL_DISCOVERY_MISS" || x.findingType === "PARTIAL_DISCOVERY") && x.sourceCitation.includes("6.01(b)")),
    },
    {
      defectType: "REMOVE_TRAILING_PROVISO",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::6.01(c)`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_PROVISO for 6.01(c) once removed from the bundle",
      runAudit: () => runContext(removeItem(bundle, "PROVISO", "6.01(c)")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_PROVISO"),
    },
    {
      defectType: "REMOVE_SHARED_CAP",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::6.01(d)`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_SHARED_CAP for 6.01(d) once removed from the bundle",
      runAudit: () => runContext(removeItem(bundle, "SHARED_CAP", "6.01(d)")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_SHARED_CAP"),
    },
    {
      defectType: "REMOVE_PARENT_SCOPE",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::6.01`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_PARENT_CONTEXT once the parent scope item is removed from 6.01(a)'s own bundle",
      runAudit: () => runContext(removeItem(bundle, "PARENT_SCOPE", "6.01")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_PARENT_CONTEXT"),
    },
    {
      defectType: "REMOVE_TOP_LEVEL_DEFINITION",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::Consolidated EBITDA`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_DEFINITION once both the item and its unresolved surface are removed",
      runAudit: () => runContext(removeUnresolved(removeItem(bundle, "DEFINITION", "Consolidated EBITDA"), "Consolidated EBITDA")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_DEFINITION"),
    },
    {
      defectType: "REMOVE_NESTED_DEFINITION",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::Consolidated Net Income`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_DEFINITION_DEPENDENCY once the nested definition is removed from both items and unresolved",
      runAudit: () => runContext(removeUnresolved(removeItem(bundle, "DEFINITION_DEPENDENCY", "Consolidated Net Income"), "Consolidated Net Income")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_DEFINITION_DEPENDENCY"),
    },
    {
      defectType: "REMOVE_CALCULATION_PROVISION",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::1.05`,
      expectedAuditorBehavior: "auditContextCoverage flags a silent gap for the calculation cross-reference once removed from both items and unresolved",
      runAudit: () => runContext(removeUnresolved(removeItem(bundle, "CALCULATION_PROVISION", "1.05"), "1.05")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "SILENT_UNRESOLVED_DEPENDENCY" && x.sourceCitation.includes("1.05")),
    },
    {
      defectType: "REMOVE_ENTITY_SCOPE",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::6.01(e)`,
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_ENTITY_SCOPE for 6.01(e) once removed from the bundle",
      runAudit: () => runContext(removeItem(bundle, "ENTITY_SCOPE", "6.01(e)")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_ENTITY_SCOPE"),
    },
    {
      defectType: "REMOVE_AMENDMENT_LEAD",
      materiality: "MATERIAL",
      sourceLocation: "amendment-doc::1",
      expectedAuditorBehavior: "auditContextCoverage flags MISSING_AMENDMENT_LEAD once the AMENDMENT_LEAD item is stripped while the real ModificationCandidate remains in the package graph",
      runAudit: () => runContext({ ...bundle, items: bundle.items.filter((i) => i.type !== "AMENDMENT_LEAD" && i.type !== "SUPPLEMENT_LEAD") }),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_AMENDMENT_LEAD"),
    },
    {
      defectType: "REMOVE_CROSS_REFERENCE",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::1.05`,
      expectedAuditorBehavior: "same as REMOVE_CALCULATION_PROVISION - both a CROSS_REFERENCE and a CALCULATION_PROVISION removal collapse to the same silent-gap detection path",
      runAudit: () => runContext(removeUnresolved(removeItem(removeItem(bundle, "CROSS_REFERENCE", "1.05"), "CALCULATION_PROVISION", "1.05"), "1.05")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "SILENT_UNRESOLVED_DEPENDENCY" && x.sourceCitation.includes("1.05")),
    },
    {
      defectType: "REMOVE_UNRESOLVED_DEPENDENCY_SIGNAL",
      materiality: "MATERIAL",
      sourceLocation: `${DOC}::Consolidated EBITDA`,
      expectedAuditorBehavior: "removing a term from BOTH items and unresolvedDependencies (a fully silent drop) is caught as a missing definition, distinct from a term correctly surfaced as unresolved",
      runAudit: () => runContext(removeUnresolved(removeItem(bundle, "DEFINITION", "Consolidated EBITDA"), "Consolidated EBITDA")),
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "MISSING_DEFINITION"),
    },
    {
      defectType: "SUPPRESS_MULTIPLE_RULES_FLAG",
      materiality: "MATERIAL",
      sourceLocation: "multi-item-doc::6.02(i)",
      expectedAuditorBehavior: "when the ONLY candidate for a node whose own text independently shows an unrepresented multi-item list (comma-separated sub-baskets the structural parser swallowed into one node - the same real class as the known LSB 6.14 comma-list gap) has multipleRulesLikely=false, the auditor flags PARTIAL_DISCOVERY rather than crediting it as exactly discovered",
      runAudit: () => {
        const multiItemText = `SECTION 6.02. Liens . The Borrower shall not create Liens, except (i) Liens securing Indebtedness in an amount not to exceed $10,000,000, (ii) Liens securing Indebtedness in an amount not to exceed the greater of $5,000,000 and 10% of Consolidated EBITDA, and (iii) Liens so long as the Total Leverage Ratio does not exceed 3.00:1.00.`;
        const miIndex = buildTestIndex([{ documentId: "multi-item-doc", label: "CA", text: multiItemText }]);
        const miRegions = buildSourceCoverageInventory("multi-item-doc", miIndex, { companyId: COMPANY, packageKey: PACKAGE, instrumentKey: null });
        const leafNode = miIndex.getNodeByRef("multi-item-doc", "6.02(i)")!;
        return auditDiscoveryCoverage(miRegions, [makeCandidate({ documentId: "multi-item-doc", structuralNodeKeys: [leafNode.nodeKey], normalizedSourceRef: "6.02(i)", multipleRulesLikely: false })], miIndex);
      },
      matchesExpectedFinding: (f) => f.some((x) => x.findingType === "PARTIAL_DISCOVERY" && x.sourceCitation.includes("6.02(i)")),
    },
  ];

  return { baselineFindings, scenarios };
}

export function runFaultInjectionManifest(): FaultManifestEntry[] {
  const { scenarios } = buildFaultScenarios();
  return scenarios.map((s): FaultManifestEntry => {
    const findings = s.runAudit();
    const caught = s.matchesExpectedFinding(findings);
    return {
      injectionId: computeInjectionId(PACKAGE, DOC, s.sourceLocation, s.defectType),
      companyId: COMPANY,
      packageKey: PACKAGE,
      documentId: DOC,
      sourceLocation: s.sourceLocation,
      injectedDefectType: s.defectType,
      materiality: s.materiality,
      expectedAuditorBehavior: s.expectedAuditorBehavior,
      actualFindingIds: findings.filter((f) => s.matchesExpectedFinding([f])).map((f) => f.findingId),
      caught,
      reasonIfNotCaught: caught ? null : `No finding matched the expected behavior; findings produced: ${findings.map((f) => f.findingType).join(", ") || "(none)"}`,
    };
  });
}
