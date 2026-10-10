/**
 * Stage D Cycle 6 — final integration gate (independent verification).
 *
 * Proves: resolveGoverningScopeForCitedUnit binds the operative parent section
 * (not a nearest section-number guess); adversarial parent/child cases fail
 * closed; SOURCE_SCOPE_DERIVED → SCOPE_CONFIRMED_BY_SOURCE only with
 * safeToRely + non-empty scope; dual-path $15M consumes debt and lien
 * authority without treating the principal as $30M of new financial debt;
 * debt-only SATISFIED is not a secured answer.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTestIndex } from "../contract-model/context-retrieval-test-utils";
import { resolveGoverningScope, resolveGoverningScopeForCitedUnit } from "../../lib/contract-model/compiler/semantic/governing-scope";
import {
  applyEntityScopeGuard,
  ENTITY_SCOPE_GUARD_VERSION,
  parentSectionLeadIn,
} from "../../lib/contract-model/compiler/semantic/entity-scope-guard";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { evaluateRule } from "../../lib/contract-model/runtime/rule-evaluator";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
} from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { TEST_DOCUMENT_ID } from "../contract-model/semantic-compiler/test-helpers";

const VEP_PATH = "docs/product/customer-workflow/stage-d-pkgi-entity-scope/verified-execution-package.json";
const AS_OF = "2026-12-31";
const DOC = "credit-doc";

const PARENT_702 = "SECTION 7.02 Liens . The Borrower shall not, and shall not permit any Subsidiary to, create any Lien on any property, except:";
const PARENT_802 = "SECTION 8.02 Liens . The Company shall not create any Lien on any property, except:";

function baseDoc(extra = ""): string {
  return [
    "CREDIT AGREEMENT",
    "",
    "ARTICLE VII NEGATIVE COVENANTS",
    "",
    "SECTION 7.01 Indebtedness . The Borrower shall not, and shall not permit any Subsidiary to, create, incur or assume any Indebtedness, except:",
    "",
    "(a) Indebtedness under the Loan Documents;",
    "",
    "(b) other Indebtedness of the Borrower and the Guarantors in an aggregate principal amount not to exceed $50,000,000 at any time outstanding;",
    "",
    PARENT_702,
    "",
    "(a) Liens securing the Obligations;",
    "",
    "(b) Liens securing Indebtedness permitted under Section 7.01(b) in an aggregate principal amount not to exceed $20,000,000 at any time outstanding;",
    "",
    "(c) Liens securing Indebtedness of any Unrestricted Subsidiary;",
    "",
    "(d) Liens of the Borrower securing Indebtedness permitted under Section 7.01(b);",
    "",
    PARENT_802,
    "",
    "(a) Liens for taxes;",
    "",
    "(b) Liens securing Indebtedness in an aggregate principal amount not to exceed $1,000,000;",
    "",
    extra,
  ].join("\n");
}

function ruleStub(overrides: Partial<IRRule> & { excerpt?: string | null }): IRRule {
  const { excerpt, ...rest } = overrides;
  return {
    ruleId: "ir-rule:gate",
    irSchemaVersion: "test",
    companyId: "c",
    instrumentKey: "i",
    sourceDocumentId: DOC,
    sourceSectionRef: "7.02(b)",
    covenantFamily: "LIENS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "CREATE_LIEN",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: excerpt === undefined ? null : { documentId: DOC, sourceNodeKey: null, sourceCitation: "§7.02(b)", excerpt },
    compilerVersion: null,
    sourceContentVersion: null,
    ...rest,
  } as IRRule;
}

const noTags = { tagNormalization: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" as const } };

describe("Cycle 6 integration gate — resolveGoverningScopeForCitedUnit", () => {
  it("resolves the operative parent section chapeau for §7.02(b), not §8.02", () => {
    const idx = buildTestIndex([{ documentId: DOC, label: "ca", text: baseDoc() }]);
    const child = idx.findNodesByRef(DOC, "7.02(b)");
    expect(child).toHaveLength(1);
    const candidateGov = resolveGoverningScope({
      candidateRef: "cand:7.02",
      documentId: DOC,
      anchorNodeId: idx.findNodesByRef(DOC, "7.02")[0]!.nodeId,
      index: idx,
    });
    // Section-level candidate often has empty inherited entity scope (chapeau is own text).
    expect(candidateGov?.inheritedEntityScope ?? null).toBeNull();

    const forChild = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand:7.02",
      documentId: DOC,
      ruleSourceSectionRef: "7.02(b)",
      candidateGoverningScope: candidateGov,
      index: idx,
    });
    expect(forChild).not.toBeNull();
    const parent = forChild!.ancestorRegions.find((r) => r.role === "PARENT_SCOPE");
    expect(parent?.sectionRef).toBe("7.02");
    expect(parent?.text).toContain("Borrower shall not, and shall not permit any Subsidiary");
    expect(parent?.text).not.toContain("SECTION 8.02");
    expect(forChild!.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
  });

  it("does not pick §8.02(b) when resolving §7.02(b) (section-number discipline)", () => {
    const idx = buildTestIndex([{ documentId: DOC, label: "ca", text: baseDoc() }]);
    const for702b = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand:7.02",
      documentId: DOC,
      ruleSourceSectionRef: "7.02(b)",
      candidateGoverningScope: null,
      index: idx,
    });
    const for802b = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand:8.02",
      documentId: DOC,
      ruleSourceSectionRef: "8.02(b)",
      candidateGoverningScope: null,
      index: idx,
    });
    expect(for702b!.ancestorRegions[0]!.sectionRef).toBe("7.02");
    expect(for802b!.ancestorRegions[0]!.sectionRef).toBe("8.02");
    expect(for702b!.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    // §8.02 chapeau binds Company only (BORROWER alias), no Subsidiary.
    expect(for802b!.inheritedEntityScope).toEqual(["BORROWER"]);
  });

  it("duplicate section references refuse unique re-resolve (fall back; never silent pick)", () => {
    // Two physical documents each with 7.02(b) — same documentId would be AMBIGUOUS;
    // force ambiguity within one document via repeated lettered markers under two SECTION 7.02 headings.
    const dupText = [
      "ARTICLE VII",
      "",
      "SECTION 7.02 Liens . The Borrower shall not, and shall not permit any Subsidiary to, create any Lien, except:",
      "",
      "(a) first;",
      "",
      "(b) first-b;",
      "",
      "SECTION 7.02 Liens . The Borrower shall not create any Lien, except:",
      "",
      "(a) second;",
      "",
      "(b) second-b;",
    ].join("\n");
    const idx = buildTestIndex([{ documentId: DOC, label: "dup", text: dupText }]);
    const matches = idx.findNodesByRef(DOC, "7.02(b)");
    expect(matches.length).toBeGreaterThan(1);
    const fallback = { version: "t", anchorSectionRef: "7.02", contentHash: "x", ancestorRegions: [], inheritedEntityScope: null, inheritedEntityScopeBasis: null, inheritedAction: null, inheritedActionBasis: null, governingProhibition: null, notes: ["fallback"] } as ReturnType<typeof resolveGoverningScope>;
    const out = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand",
      documentId: DOC,
      ruleSourceSectionRef: "7.02(b)",
      candidateGoverningScope: fallback,
      index: idx,
    });
    expect(out).toBe(fallback);
  });

  it("amended / other-document refs do not bind across documentId", () => {
    const idx = buildTestIndex([
      { documentId: "base", label: "base", text: baseDoc() },
      {
        documentId: "amendment",
        label: "am",
        text: ["AMENDMENT", "", "SECTION 7.02 Liens . The Company shall not create any Lien, except:", "", "(a) Liens for taxes;", "", "(b) amended basket $1;", ""].join("\n"),
      },
    ]);
    const fromBase = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand",
      documentId: "base",
      ruleSourceSectionRef: "7.02(b)",
      candidateGoverningScope: null,
      index: idx,
    });
    expect(fromBase!.ancestorRegions[0]!.documentId).toBe("base");
    expect(fromBase!.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    const fromAmd = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand",
      documentId: "amendment",
      ruleSourceSectionRef: "7.02(b)",
      candidateGoverningScope: null,
      index: idx,
    });
    expect(fromAmd).not.toBeNull();
    expect(fromAmd!.ancestorRegions[0]!.documentId).toBe("amendment");
    // Amendment chapeau binds Company only — never inherits base doc's Borrower+Subsidiary scope.
    expect(fromAmd!.inheritedEntityScope).toEqual(["BORROWER"]);
    expect(idx.findNodesByRef("amendment", "7.02(b)")[0]!.documentId).toBe("amendment");
    expect(idx.findNodesByRef("base", "7.02(b)")[0]!.documentId).toBe("base");
  });

  it("nested enumerations resolve 7.02(b)(i) to the §7.02 chapeau (operative parent), not a sibling section", () => {
    const nested = [
      "ARTICLE VII",
      "",
      PARENT_702,
      "",
      "(a) top;",
      "",
      "(b) Liens securing Indebtedness, including:",
      "",
      "(i) Liens on inventory;",
      "",
      "(ii) Liens on equipment;",
    ].join("\n");
    const idx = buildTestIndex([{ documentId: DOC, label: "n", text: nested }]);
    const nodes = idx.findNodesByRef(DOC, "7.02(b)(i)");
    expect(nodes.length).toBe(1);
    const g = resolveGoverningScopeForCitedUnit({
      candidateRef: "cand",
      documentId: DOC,
      ruleSourceSectionRef: "7.02(b)(i)",
      candidateGoverningScope: null,
      index: idx,
    });
    // Immediate lettered parent may be heading-only (no governing-material region); section chapeau must still bind.
    expect(g!.ancestorRegions.some((r) => r.sectionRef === "7.02" && r.role === "PARENT_SCOPE" || r.sectionRef === "7.02")).toBe(true);
    expect(g!.ancestorRegions.map((r) => r.sectionRef)).toContain("7.02");
    expect(g!.ancestorRegions.every((r) => r.sectionRef !== "8.02")).toBe(true);
    expect(g!.inheritedEntityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
  });

  it("missing chapeau / non-lettered ref / null index fall back without inventing scope", () => {
    const idx = buildTestIndex([{ documentId: DOC, label: "ca", text: baseDoc() }]);
    const fallback = resolveGoverningScope({
      candidateRef: "cand:7.02",
      documentId: DOC,
      anchorNodeId: idx.findNodesByRef(DOC, "7.02")[0]!.nodeId,
      index: idx,
    });
    expect(
      resolveGoverningScopeForCitedUnit({
        candidateRef: "c",
        documentId: DOC,
        ruleSourceSectionRef: "7.02",
        candidateGoverningScope: fallback,
        index: idx,
      }),
    ).toBe(fallback);
    expect(
      resolveGoverningScopeForCitedUnit({
        candidateRef: "c",
        documentId: DOC,
        ruleSourceSectionRef: "7.02(b)",
        candidateGoverningScope: fallback,
        index: null,
      }),
    ).toBe(fallback);
    expect(parentSectionLeadIn("(b) fragment only with no chapeau words", "7.02", "7.02(b)")).toBeNull();
  });
});

describe("Cycle 6 integration gate — child vs parent entity scope", () => {
  const parentChapeau = PARENT_702;
  const childFrag = "(b) Liens securing Indebtedness permitted under Section 7.01(b) not to exceed $20,000,000;";

  it("child-specific Unrestricted Subsidiary obligor overrides inherited Borrower+Subsidiary parent", () => {
    const child = "(c) Liens securing Indebtedness of any Unrestricted Subsidiary;";
    // Model carries the parent-wide tags; own text establishes the narrower exact class.
    const g = applyEntityScopeGuard(
      ruleStub({ sourceSectionRef: "7.02(c)", entityScope: ["BORROWER", "ANY_SUBSIDIARY"], excerpt: child }),
      { ownExcerpt: child, citedUnitLeadIn: child, parentScopeLeadIn: parentChapeau, operativeText: `${parentChapeau}\n\n${child}` },
      noTags,
    );
    expect(g.entityScope).toEqual(["UNRESTRICTED_SUB"]);
    expect(g.entityScopeAudit!.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(g.entityScopeAudit!.precedence).toBe("OWN_OPERATIVE_LANGUAGE");
    expect(g.entityScopeAudit!.safeToRely).toBe(true);
    expect(g.entityScopeAudit!.modelDiscrepancy?.relation).toBe("MODEL_DIFFERENT");
  });

  it("child narrower than parent (Borrower-only own text) outranks parent", () => {
    const child = "(d) Liens of the Borrower securing Indebtedness permitted under Section 7.01(b);";
    const g = applyEntityScopeGuard(
      ruleStub({ sourceSectionRef: "7.02(d)", entityScope: ["BORROWER", "ANY_SUBSIDIARY"], excerpt: child }),
      { ownExcerpt: child, citedUnitLeadIn: child, parentScopeLeadIn: parentChapeau, operativeText: `${parentChapeau}\n\n${child}` },
      noTags,
    );
    expect(g.entityScope).toEqual(["BORROWER"]);
    expect(g.entityScopeAudit!.precedence).toBe("OWN_OPERATIVE_LANGUAGE");
  });

  it("conflicting child scope (Foreign Subsidiaries unmappable) does not invent FOREIGN_RS; under-inclusion vs own binding fails closed", () => {
    const child = "(c) Liens of Foreign Subsidiaries securing Indebtedness;";
    const g = applyEntityScopeGuard(
      ruleStub({ sourceSectionRef: "7.02(c)", entityScope: ["BORROWER"], excerpt: child }),
      { ownExcerpt: child, citedUnitLeadIn: child, parentScopeLeadIn: parentChapeau, operativeText: `${parentChapeau}\n\n${child}` },
      noTags,
    );
    // Own binding phrase is not exactly nameable → no ownDerived; unmet vs model → underinclusive reset.
    expect(g.entityScope).toEqual([]);
    expect(g.entityScopeAudit!.status).toBe("UNDERINCLUSIVE_VS_SOURCE");
    expect(g.entityScopeAudit!.safeToRely).toBe(false);
  });

  it("missing parent chapeau refuses inheritance (UNWITNESSED)", () => {
    const g = applyEntityScopeGuard(
      ruleStub({ excerpt: childFrag }),
      { ownExcerpt: childFrag, citedUnitLeadIn: childFrag, parentScopeLeadIn: null },
      noTags,
    );
    expect(g.entityScopeAudit!.status).toBe("UNWITNESSED");
    expect(g.entityScopeAudit!.safeToRely).toBe(false);
  });

  it("unmappable parent obligor language refuses derivation (Guarantor-only chapeau)", () => {
    const badParent = "SECTION 7.02 Liens . No Guarantor shall create any Lien, except:";
    const g = applyEntityScopeGuard(
      ruleStub({ entityScope: [], excerpt: childFrag }),
      { ownExcerpt: childFrag, citedUnitLeadIn: childFrag, parentScopeLeadIn: badParent, operativeText: `${badParent}\n\n${childFrag}` },
      noTags,
    );
    // Guarantor maps to null tags → parentDerived null → empty model scope stays UNSPECIFIED (or unwitnessed if model had tags).
    expect(g.entityScope).toEqual([]);
    expect(["UNSPECIFIED", "UNWITNESSED"]).toContain(g.entityScopeAudit!.status!);
  });
});

describe("Cycle 6 integration gate — SOURCE_SCOPE_DERIVED → SCOPE_CONFIRMED_BY_SOURCE", () => {
  it(`guard ${ENTITY_SCOPE_GUARD_VERSION}: derived + safeToRely + non-empty → confirmed`, () => {
    const child = "(b) Liens securing Indebtedness;";
    const g = applyEntityScopeGuard(
      ruleStub({
        entityScope: ["BORROWER"],
        excerpt: child,
        capacityExpression: {
          kind: "MONEY",
          amount: 20_000_000,
          currency: "USD",
          type: "MONEY",
          exprId: "ir-expr:gate-money",
        } as IRRule["capacityExpression"],
      }),
      { ownExcerpt: child, citedUnitLeadIn: child, parentScopeLeadIn: PARENT_702, operativeText: `${PARENT_702}\n\n${child}` },
      noTags,
    );
    expect(g.entityScopeAudit!.status).toBe("SOURCE_SCOPE_DERIVED");
    expect(g.entityScopeAudit!.safeToRely).toBe(true);
    expect(g.entityScope).toEqual(["BORROWER", "ANY_SUBSIDIARY"]);
    const shell = evaluateRule(g, () => null);
    expect(shell.entityScope.applicability).toBe("SCOPE_CONFIRMED_BY_SOURCE");
    const graph = buildCapacityGraph({
      companyId: "c",
      instrumentKey: "i",
      rules: [g],
      sharedCapacities: [],
      definitions: [],
      asOf: null,
    });
    const ruleNode = graph.nodes.find((n) => n.kind === "RULE_CAPACITY");
    expect(ruleNode?.entityScope?.applicability).toBe("SCOPE_CONFIRMED_BY_SOURCE");
  });

  it("SOURCE_SCOPE_DERIVED with safeToRely false does not confirm", () => {
    const r = ruleStub({
      entityScope: ["BORROWER"],
      entityScopeAudit: {
        guardVersion: ENTITY_SCOPE_GUARD_VERSION,
        status: "SOURCE_SCOPE_DERIVED",
        safeToRely: false,
        reasonCodes: [],
        rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" },
        tagNormalization: [],
        before: { entityScope: ["BORROWER"], entityScopeExcluded: [], sufficiency: "COMPLETE" },
        witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE", signals: [] },
        precedence: "GOVERNING_SCOPE_SOURCE",
        modelDiscrepancy: null,
      },
    });
    expect(evaluateRule(r, () => null).entityScope.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
  });

  it("SOURCE_SCOPE_DERIVED with empty entityScope does not confirm", () => {
    const r = ruleStub({
      entityScope: [],
      entityScopeAudit: {
        guardVersion: ENTITY_SCOPE_GUARD_VERSION,
        status: "SOURCE_SCOPE_DERIVED",
        safeToRely: true,
        reasonCodes: [],
        rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" },
        tagNormalization: [],
        before: { entityScope: [], entityScopeExcluded: [], sufficiency: "COMPLETE" },
        witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "PARENT_SCOPE", signals: [] },
        precedence: "GOVERNING_SCOPE_SOURCE",
        modelDiscrepancy: null,
      },
    });
    expect(evaluateRule(r, () => null).entityScope.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
  });

  it("UNWITNESSED never confirms", () => {
    const r = ruleStub({
      entityScope: ["BORROWER"],
      entityScopeAudit: {
        guardVersion: ENTITY_SCOPE_GUARD_VERSION,
        status: "UNWITNESSED",
        safeToRely: false,
        reasonCodes: ["ENTITY_SCOPE_UNWITNESSED"],
        rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" },
        tagNormalization: [],
        before: { entityScope: ["BORROWER"], entityScopeExcluded: [], sufficiency: "COMPLETE" },
        witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE", signals: [] },
        precedence: "MODEL_EMITTED",
        modelDiscrepancy: null,
      },
    });
    expect(evaluateRule(r, () => null).entityScope.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
  });
});

describe("Cycle 6 integration gate — dual-path $15M accounting + debt-only ≠ secured", () => {
  function loadPkg(): VerifiedExecutionPackage {
    return JSON.parse(fs.readFileSync(VEP_PATH, "utf8")) as VerifiedExecutionPackage;
  }

  it("consumes $15M debt authority and $15M lien authority; remaining baskets reflect single principal draws", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const inputs = snapshotInputResolver({
      snapshots: [],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const lienCap = capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!;
    expect(debtCap.status).toBe("AVAILABLE");
    expect(lienCap.status).toBe("AVAILABLE");

    const dual = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "gate-secured-15m",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "SYNTHETIC $15M secured principal — dual-basket draws (not $30M new debt)",
        effects: [
          { effectId: "e-debt", kind: "CONSUME_CAPACITY", capacityNodeId: debtCap.capacityNodeId, amount: { type: "MONEY", amount: "15000000", currency: "USD" } },
          { effectId: "e-lien", kind: "CONSUME_CAPACITY", capacityNodeId: lienCap.capacityNodeId, amount: { type: "MONEY", amount: "15000000", currency: "USD" } },
        ],
        // Phase 4D: stated draws must sum; economic principal remains $15M secured (label + provenance).
        intendedAmount: { type: "MONEY", amount: "30000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: {
          source: "SYNTHETIC_LABELED_TECHNICAL_DEMO",
          sourceVersion: "cycle6-integration-gate",
          approvalRef: "SYNTHETIC_NOT_CUSTOMER",
        },
      },
      selectedPath: {
        capacityNodeIds: [debtCap.capacityNodeId, lienCap.capacityNodeId],
        ruleIds: [debt.ruleId, lien.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(dual.outcome).toBe("EXECUTED");
    if (dual.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    expect(dual.simulation.selectedPathResult).toBe("SATISFIED");
    const effects = dual.simulation.capacityEffects;
    expect(effects).toHaveLength(2);
    expect(effects.map((e) => e.attemptedAmount)).toEqual([
      { type: "MONEY", amount: "15000000", currency: "USD" },
      { type: "MONEY", amount: "15000000", currency: "USD" },
    ]);
    expect(effects.every((e) => e.outcome === "SATISFIED")).toBe(true);
    // Post-state: each basket reduced by $15M once — not a second $15M of financial debt stacked.
    const post = dual.simulation.postState;
    expect(post).toBeTruthy();
    const postDebt = post!.capacities.find((c) => c.ruleId === debt.ruleId)!;
    const postLien = post!.capacities.find((c) => c.ruleId === lien.ruleId)!;
    expect(postDebt.effectiveRemaining).toMatchObject({ kind: "AMOUNT", value: { type: "MONEY", amount: "35000000", currency: "USD" } });
    expect(postLien.effectiveRemaining).toMatchObject({ kind: "AMOUNT", value: { type: "MONEY", amount: "5000000", currency: "USD" } });
  });

  it("debt-only favorable result is not enumerated/presented as secured dual-path permission", () => {
    const pkg = loadPkg();
    const debt = pkg.rules.find((r) => r.sourceSectionRef === "7.01(b)")!;
    const lien = pkg.rules.find((r) => r.sourceSectionRef === "7.02(b)")!;
    const inputs = snapshotInputResolver({
      snapshots: [],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });
    const capacity = evaluateVerifiedCapacity({ package: pkg, inputs, ledger: [], asOf: AS_OF });
    if (capacity.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    const debtCap = capacity.state.capacities.find((c) => c.ruleId === debt.ruleId)!;

    const debtOnly = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: [],
      asOf: AS_OF,
      transaction: {
        transactionId: "gate-debt-only",
        companyId: pkg.companyId,
        instrumentKey: pkg.instrumentKey,
        effectiveAsOf: AS_OF,
        category: "INCUR_DEBT",
        label: "debt-only — not secured",
        effects: [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: debtCap.capacityNodeId, amount: { type: "MONEY", amount: "15000000", currency: "USD" } }],
        intendedAmount: { type: "MONEY", amount: "15000000", currency: "USD" },
        unallocatedAmount: null,
        provenance: { source: "SYNTHETIC_LABELED_TECHNICAL_DEMO", sourceVersion: "gate", approvalRef: "SYNTHETIC_NOT_CUSTOMER" },
      },
      selectedPath: {
        capacityNodeIds: [debtCap.capacityNodeId],
        ruleIds: [debt.ruleId],
        sharedCapacityIds: [],
        reclassificationElectionIds: [],
      },
    });
    expect(debtOnly.outcome).toBe("EXECUTED");
    if (debtOnly.outcome !== "EXECUTED") throw new Error("expected EXECUTED");
    expect(debtOnly.simulation.selectedPathResult).toBe("SATISFIED");
    // Lien node was not selected; secured enumeration still requires both action classes.
    expect(debtOnly.simulation.selectedPath.capacityNodeIds).not.toContain(
      capacity.state.capacities.find((c) => c.ruleId === lien.ruleId)!.capacityNodeId,
    );
    const secured = enumerateCertifiedPaths({ verifiedPackage: pkg, transactionKind: "SECURED_DEBT", secured: true });
    expect(secured.authority).toBe("CERTIFIED_4E");
    expect(secured.paths.some((p) => p.action === "INCUR_DEBT" || p.action === "INCUR_SECURED_DEBT")).toBe(true);
    expect(secured.paths.some((p) => p.action === "CREATE_LIEN" || p.action === "GRANT_COLLATERAL")).toBe(true);
    // A debt-only selected path is not a SECURED_DEBT dual-path answer.
    expect(debtOnly.simulation.selectedPath.ruleIds).toEqual([debt.ruleId]);
    expect(debtOnly.simulation.selectedPath.ruleIds).not.toContain(lien.ruleId);
  });
});
