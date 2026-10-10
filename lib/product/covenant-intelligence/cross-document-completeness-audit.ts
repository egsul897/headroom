/**
 * Independent completeness audit for CONMED + DSGR authentic packages.
 *
 * Restriction inventories are authored from operative fixture text and are
 * intentionally broader than each scenario's mustCiteSectionRefs. Comparison
 * is against Headroom's evaluatedRestrictions / documentVerdicts — not against
 * the pre-declared citation checklist alone.
 */

import { readFileSync } from "node:fs";
import {
  AUTHENTIC_PACKAGE_SCENARIOS,
  runAuthenticPackageScenario,
  type AuthenticPackageScenario,
} from "./cross-document-authentic-packages";
import type { RestrictionFamily } from "./cross-document-covenant";

export const CROSS_DOCUMENT_COMPLETENESS_AUDIT_VERSION =
  "product.cross-document-completeness-audit.v1" as const;

export type AuditFamily =
  | RestrictionFamily
  | "FINANCIAL_CONDITION"
  | "GUARANTEE"
  | "AMENDMENT_PRECEDENCE"
  | "CROSS_DOCUMENT";

export type ApplicabilityExpectation =
  | "MUST_EVALUATE"
  | "MUST_NOT_BLOCK_WHEN_UNSECURED"
  | "MAINTENANCE_ONLY_NOT_INCURRENCE_GATE"
  | "APPLICABLE_IF_GUARANTEE"
  | "APPLICABLE_IF_SECURED"
  | "REQUIRED_DOC_IF_SECURED_PRIORITY"
  | "NOT_IN_PACKAGE";

export interface IndependentlyEnumeratedRestriction {
  id: string;
  packageId: string;
  scenarioId: string;
  sectionRef: string;
  family: AuditFamily;
  expectation: ApplicabilityExpectation;
  why: string;
  sourceNeedle: string;
  fixturePath: string;
}

export interface CompletenessAuditFinding {
  scenarioId: string;
  packageId: string;
  independentlyEnumerated: IndependentlyEnumeratedRestriction[];
  headroomSectionRefs: string[];
  headroomFamilies: string[];
  /** Independent MUST_EVALUATE items with no Headroom evaluatedRestriction / citation hit. */
  missedRestrictions: IndependentlyEnumeratedRestriction[];
  /** Headroom marked NOT_APPLICABLE / skipped a family the independent inventory requires. */
  falseNonApplicability: Array<{
    sectionRef: string;
    family: AuditFamily;
    headroomSignal: string;
    independentExpectation: string;
  }>;
  notes: string[];
}

const CONMED_VII =
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt";
const CONMED_GCA =
  "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt";
const DSGR_D =
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";

function assertFixtureContains(path: string, needle: string): void {
  const text = readFileSync(path, "utf8");
  if (!text.includes(needle)) {
    throw new Error(`Completeness audit source needle missing in ${path}: ${needle.slice(0, 80)}`);
  }
}

/**
 * Full independent inventory — authored by reading CONMED Art VII / GCA and
 * DSGR Second A&R TOC + operative headings before comparing to Headroom.
 */
export function independentlyEnumerateRestrictions(
  scenarioId: string,
): IndependentlyEnumeratedRestriction[] {
  const rows: IndependentlyEnumeratedRestriction[] = [];
  const add = (r: Omit<IndependentlyEnumeratedRestriction, "scenarioId"> & { scenarioId?: string }) => {
    rows.push({ ...r, scenarioId: r.scenarioId ?? scenarioId });
  };

  if (scenarioId.startsWith("auth-conmed-")) {
    const packageId = "conmed-2025-credit-facility";
    // Debt authority
    add({
      id: `${scenarioId}:7.2`,
      packageId,
      sectionRef: "7.2",
      family: "DEBT_INCURRENCE",
      expectation:
        scenarioId === "auth-conmed-rp-basket" ? "NOT_IN_PACKAGE" : "MUST_EVALUATE",
      why: "Art VII §7.2 Limitation on Indebtedness is the primary debt negative covenant.",
      sourceNeedle: "SECTION 7.2 Limitation on Indebtedness",
      fixturePath: CONMED_VII,
    });
    add({
      id: `${scenarioId}:7.2(o)`,
      packageId,
      sectionRef: "7.2(o)",
      family: "DEBT_INCURRENCE",
      expectation:
        scenarioId === "auth-conmed-unsecured-general-basket" ||
        scenarioId === "auth-conmed-secured-without-lien-path"
          ? "MUST_EVALUATE"
          : "NOT_IN_PACKAGE",
      why: "General unsecured basket — greater of $60,000,000 and 3.25% CTA.",
      sourceNeedle: "unsecured Indebtedness not otherwise permitted by this Section 7.2",
      fixturePath: CONMED_VII,
    });
    add({
      id: `${scenarioId}:7.2(l)`,
      packageId,
      sectionRef: "7.2(l)",
      family: "DEBT_INCURRENCE",
      expectation:
        scenarioId === "auth-conmed-rp-basket"
          ? "NOT_IN_PACKAGE"
          : "MUST_EVALUATE",
      why: "Permitted Unsecured Indebtedness path + non-Loan Party guarantee ban.",
      sourceNeedle: "Subsidiary that is not a Loan Party shall guarantee",
      fixturePath: CONMED_VII,
    });
    // Liens
    add({
      id: `${scenarioId}:7.3`,
      packageId,
      sectionRef: "7.3",
      family: "LIENS",
      expectation:
        scenarioId === "auth-conmed-secured-without-lien-path" ||
        scenarioId === "auth-conmed-nonguarantor-guarantee"
          ? "MUST_EVALUATE"
          : scenarioId === "auth-conmed-unsecured-general-basket"
            ? "MUST_NOT_BLOCK_WHEN_UNSECURED"
            : "APPLICABLE_IF_SECURED",
      why: "§7.3 Limitation on Liens — independently applicable when Liens are contemplated.",
      sourceNeedle: "SECTION 7.3 Limitation on Liens",
      fixturePath: CONMED_VII,
    });
    // RP / Investments
    add({
      id: `${scenarioId}:7.6`,
      packageId,
      sectionRef: "7.6",
      family: "RESTRICTED_PAYMENTS",
      expectation: scenarioId === "auth-conmed-rp-basket" ? "MUST_EVALUATE" : "NOT_IN_PACKAGE",
      why: "$40,000,000 fiscal-year Restricted Payments basket.",
      sourceNeedle: "Restricted Payments in any fiscal year in an aggregate amount not to exceed $40,000,000",
      fixturePath: CONMED_VII,
    });
    add({
      id: `${scenarioId}:7.8`,
      packageId,
      sectionRef: "7.8",
      family: "INVESTMENTS",
      expectation: scenarioId === "auth-conmed-rp-basket" ? "MUST_EVALUATE" : "NOT_IN_PACKAGE",
      why: "Investments covenant — RP/Investment reclass risk; evaluated for RP kind.",
      sourceNeedle: "SECTION 7.8 Limitation on Investments",
      fixturePath: CONMED_VII,
    });
    // Financial conditions
    add({
      id: `${scenarioId}:7.1`,
      packageId,
      sectionRef: "7.1",
      family: "FINANCIAL_CONDITION",
      expectation: "MAINTENANCE_ONLY_NOT_INCURRENCE_GATE",
      why:
        "§7.1 leverage/ICR/liquidity are maintenance covenants. Where an incurrence path requires pro forma §7.1(b) (e.g. §7.2(l)), that gate is carried as a condition on the debt fact — not a standalone Headroom family.",
      sourceNeedle: "SECTION 7.1 Financial Condition",
      fixturePath: CONMED_VII,
    });
    // Guarantor / GCA
    add({
      id: `${scenarioId}:gca`,
      packageId,
      sectionRef: "guarantor-scope",
      family: "SUBSIDIARY_GUARANTOR",
      expectation:
        scenarioId === "auth-conmed-nonguarantor-guarantee"
          ? "MUST_EVALUATE"
          : "APPLICABLE_IF_GUARANTEE",
      why: "Guarantee and Collateral Agreement limits who may guarantee Parent Indebtedness.",
      sourceNeedle: "Existing Guarantee and Collateral Agreement",
      fixturePath: CONMED_GCA,
    });
    // Shared capacity / amendment / ICA — package facts
    add({
      id: `${scenarioId}:shared`,
      packageId,
      sectionRef: "shared-capacity",
      family: "SHARED_CAPACITY",
      expectation: "NOT_IN_PACKAGE",
      why: "CONMED Art VII curated excerpt does not state a §9.15-style shared basket across instruments.",
      sourceNeedle: "SECTION 7.2 Limitation on Indebtedness",
      fixturePath: CONMED_VII,
    });
    add({
      id: `${scenarioId}:amendment`,
      packageId,
      sectionRef: "amendment-precedence",
      family: "AMENDMENT_PRECEDENCE",
      expectation: "NOT_IN_PACKAGE",
      why: "No operative amendment superseding Art VII is in the contemplated package for these scenarios.",
      sourceNeedle: "NEGATIVE COVENANTS",
      fixturePath: CONMED_VII,
    });
    add({
      id: `${scenarioId}:ica`,
      packageId,
      sectionRef: "intercreditor",
      family: "INTERCREDITOR",
      expectation: "NOT_IN_PACKAGE",
      why: "No separate Intercreditor Agreement fixture is loaded for CONMED scenarios.",
      sourceNeedle: "Liens created pursuant to the Security Documents",
      fixturePath: CONMED_VII,
    });
  }

  if (scenarioId.startsWith("auth-dsgr-")) {
    const packageId = "dsgr-2022-2025-credit-facility";
    add({
      id: `${scenarioId}:6.01`,
      packageId,
      sectionRef: "6.01",
      family: "DEBT_INCURRENCE",
      expectation: "MUST_EVALUATE",
      why: "§6.01 Indebtedness negative covenant.",
      sourceNeedle: "SECTION 6.01. Indebtedness",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:6.02`,
      packageId,
      sectionRef: "6.02",
      family: "LIENS",
      expectation: "MUST_EVALUATE",
      why: "Both DSGR scenarios contemplate secured financing — §6.02 Liens applies.",
      sourceNeedle: "SECTION 6.02. Liens",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:6.04`,
      packageId,
      sectionRef: "6.04",
      family: "INVESTMENTS",
      expectation:
        scenarioId === "auth-dsgr-investment-lien-debt-bundle" ? "MUST_EVALUATE" : "NOT_IN_PACKAGE",
      why: "§6.04 Investments, Loans, Advances, Guarantees and Acquisitions.",
      sourceNeedle: "SECTION 6.04. Investments, Loans, Advances, Guarantees and Acquisitions",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:6.08`,
      packageId,
      sectionRef: "6.08",
      family: "RESTRICTED_PAYMENTS",
      expectation:
        scenarioId === "auth-dsgr-investment-lien-debt-bundle" ? "MUST_EVALUATE" : "NOT_IN_PACKAGE",
      why: "§6.08 Restricted Payments — RP/Investment reclass risk on financed investment.",
      sourceNeedle: "SECTION 6.08. Restricted Payments; Certain Payments of Indebtedness",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:2.09`,
      packageId,
      sectionRef: "2.09",
      family: "DEBT_INCURRENCE",
      expectation:
        scenarioId === "auth-dsgr-incremental-unevidenced" ? "MUST_EVALUATE" : "MUST_EVALUATE",
      why: "§2.09 Incremental Term Loans / Incremental Facility Amendment mechanics.",
      sourceNeedle: "Incremental Term Loans",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:10.01`,
      packageId,
      sectionRef: "10.01",
      family: "GUARANTEE",
      expectation: "MUST_EVALUATE",
      why: "Article X Loan Guaranty — guarantor scope for Loan Parties.",
      sourceNeedle: "SECTION 10.01. Guaranty",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:ica-def`,
      packageId,
      sectionRef: "Applicable Intercreditor Agreement",
      family: "INTERCREDITOR",
      expectation: "REQUIRED_DOC_IF_SECURED_PRIORITY",
      why: "Definition of Applicable Intercreditor Agreement + Loan Documents include ICA — secured priority may require it.",
      sourceNeedle: "Applicable Intercreditor Agreement",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:9.02`,
      packageId,
      sectionRef: "9.02",
      family: "AMENDMENT_PRECEDENCE",
      expectation:
        scenarioId === "auth-dsgr-incremental-unevidenced"
          ? "MUST_EVALUATE"
          : "NOT_IN_PACKAGE",
      why: "§9.02 Waivers; Amendments — Incremental Facility Amendment is an amendment instrument.",
      sourceNeedle: "SECTION 9.02. Waivers; Amendments",
      fixturePath: DSGR_D,
    });
    add({
      id: `${scenarioId}:shared-inc`,
      packageId,
      sectionRef: "Incremental Amount",
      family: "SHARED_CAPACITY",
      expectation:
        scenarioId === "auth-dsgr-incremental-unevidenced" ? "MUST_EVALUATE" : "NOT_IN_PACKAGE",
      why: "Incremental Amount is a shared facility capacity concept — must not invent headroom.",
      sourceNeedle: "Incremental Term Loan",
      fixturePath: DSGR_D,
    });
  }

  for (const r of rows) {
    if (r.expectation !== "NOT_IN_PACKAGE") {
      assertFixtureContains(r.fixturePath, r.sourceNeedle);
    }
  }
  return rows;
}

function headroomHits(scenario: AuthenticPackageScenario): {
  sectionRefs: Set<string>;
  families: Set<string>;
  notApplicable: Array<{ documentId: string; reason: string }>;
  evaluated: Array<{ sectionRef: string; family: string; stance: string }>;
} {
  const run = runAuthenticPackageScenario(scenario);
  const sectionRefs = new Set<string>();
  const families = new Set<string>();
  const evaluated: Array<{ sectionRef: string; family: string; stance: string }> = [];
  for (const d of run.verdict.documentVerdicts) {
    for (const r of d.evaluatedRestrictions) {
      sectionRefs.add(r.sectionRef);
      families.add(r.family);
      evaluated.push({ sectionRef: r.sectionRef, family: r.family, stance: r.stance });
    }
    for (const c of d.governingSections) sectionRefs.add(c.sectionRef);
  }
  for (const c of run.verdict.exactSourceCitations) sectionRefs.add(c.sectionRef);
  const notApplicable = run.verdict.documentVerdicts
    .filter((d) => d.applicability === "NOT_APPLICABLE")
    .map((d) => ({ documentId: d.documentId, reason: d.applicabilityReason }));
  return { sectionRefs, families, notApplicable, evaluated };
}

function sectionMatch(independentRef: string, headroomRefs: Set<string>): boolean {
  if (headroomRefs.has(independentRef)) return true;
  // Parent section match: independent "7.2" hits Headroom "7.2(o)" etc.
  for (const h of headroomRefs) {
    if (h === independentRef) return true;
    if (h.startsWith(independentRef + "(") || h.startsWith(independentRef + ".")) return true;
    if (independentRef.startsWith(h + "(") || independentRef.startsWith(h + ".")) return true;
  }
  // Soft match on shared labels
  const soft = independentRef.toLowerCase();
  for (const h of headroomRefs) {
    if (h.toLowerCase().includes(soft) || soft.includes(h.toLowerCase())) return true;
  }
  return false;
}

export function auditScenarioCompleteness(scenarioId: string): CompletenessAuditFinding {
  const scenario = AUTHENTIC_PACKAGE_SCENARIOS.find((s) => s.scenarioId === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown authentic scenario: ${scenarioId}`);
  }
  const independentlyEnumerated = independentlyEnumerateRestrictions(scenarioId);
  const hits = headroomHits(scenario);
  const missedRestrictions: IndependentlyEnumeratedRestriction[] = [];
  const falseNonApplicability: CompletenessAuditFinding["falseNonApplicability"] = [];
  const notes: string[] = [];

  for (const row of independentlyEnumerated) {
    if (row.expectation === "MUST_EVALUATE") {
      // Prefer exact/parent section hit. Family-only is accepted for core negative-covenant
      // families when a parent section (e.g. 7.2) is represented by a clause citation (7.2(o)).
      const sectionHit = sectionMatch(row.sectionRef, hits.sectionRefs);
      const coreFamily =
        row.family === "DEBT_INCURRENCE" ||
        row.family === "LIENS" ||
        row.family === "RESTRICTED_PAYMENTS" ||
        row.family === "INVESTMENTS" ||
        row.family === "SUBSIDIARY_GUARANTOR" ||
        row.family === "SHARED_CAPACITY" ||
        row.family === "INTERCREDITOR" ||
        row.family === "AMENDMENT_PRECEDENCE" ||
        row.family === "GUARANTEE";
      const familyHit =
        hits.families.has(row.family as RestrictionFamily) ||
        (row.family === "GUARANTEE" && hits.families.has("SUBSIDIARY_GUARANTOR")) ||
        (row.family === "AMENDMENT_PRECEDENCE" && hits.families.has("AMENDMENT_EFFECT"));
      if (!sectionHit && !(coreFamily && familyHit && sectionMatch(row.sectionRef.split("(")[0]!, hits.sectionRefs))) {
        // Non-core labels (Incremental Amount, Applicable Intercreditor Agreement, 10.01, 9.02)
        // require a section/string hit — family alone is not enough.
        if (!sectionHit) missedRestrictions.push(row);
      }
    }
    if (row.expectation === "MUST_NOT_BLOCK_WHEN_UNSECURED") {
      // False non-applicability would be treating Liens as affirmatively blocking unsecured.
      const lienHit = hits.evaluated.find((e) => e.family === "LIENS" && e.stance === "PROHIBITS");
      if (row.family === "LIENS" && lienHit) {
        falseNonApplicability.push({
          sectionRef: row.sectionRef,
          family: row.family,
          headroomSignal: `LIENS stance=${lienHit.stance}`,
          independentExpectation: row.expectation,
        });
      }
    }
    if (row.expectation === "MAINTENANCE_ONLY_NOT_INCURRENCE_GATE") {
      notes.push(
        `${row.sectionRef}: independently classified as maintenance-only for this pathway — not scored as a Headroom miss when absent from evaluatedRestrictions.`,
      );
    }
  }

  // False NOT_APPLICABLE on documents that should apply
  for (const na of hits.notApplicable) {
    falseNonApplicability.push({
      sectionRef: na.documentId,
      family: "CROSS_DOCUMENT",
      headroomSignal: `NOT_APPLICABLE: ${na.reason}`,
      independentExpectation: "Credit agreement / security docs in these scenarios should remain applicable",
    });
  }

  return {
    scenarioId,
    packageId: scenario.packageId,
    independentlyEnumerated,
    headroomSectionRefs: [...hits.sectionRefs].sort(),
    headroomFamilies: [...hits.families].sort(),
    missedRestrictions,
    falseNonApplicability,
    notes,
  };
}

export function runConmedDsgrCompletenessAudit(): {
  version: typeof CROSS_DOCUMENT_COMPLETENESS_AUDIT_VERSION;
  findings: CompletenessAuditFinding[];
  missedRestrictionCount: number;
  falseNonApplicabilityCount: number;
  scenarioIds: string[];
} {
  const scenarioIds = AUTHENTIC_PACKAGE_SCENARIOS.filter(
    (s) => s.packageId === "conmed-2025-credit-facility" || s.packageId === "dsgr-2022-2025-credit-facility",
  ).map((s) => s.scenarioId);
  const findings = scenarioIds.map(auditScenarioCompleteness);
  return {
    version: CROSS_DOCUMENT_COMPLETENESS_AUDIT_VERSION,
    findings,
    missedRestrictionCount: findings.reduce((n, f) => n + f.missedRestrictions.length, 0),
    falseNonApplicabilityCount: findings.reduce((n, f) => n + f.falseNonApplicability.length, 0),
    scenarioIds,
  };
}
