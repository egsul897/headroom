import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifySemanticRole,
  bindGoverningSource,
  buildDependencyGraph,
  assignLibraryStatus,
  assertNeverExecutable,
  integratePeerWorkstreams,
  peerFlagsForGraph,
  linkPermissionToCeiling,
} from "../../lib/basket-formula-corpus";

const ROOT = resolve(__dirname, "../..");
const PHASE3 = resolve(ROOT, "docs/covenant-basket-capacity-formula-library/phase-3");

/**
 * Independent adversarial cases (Phase 4). Ground truth is fixed here and must
 * not be rewritten to match implementation failures.
 */
const ADVERSARIAL_CASES = [
  {
    id: "adv-ceiling-as-permission",
    title: "Ceiling misclassified as permission",
    span: "Aggregate Indebtedness shall not exceed the greater of $5,000,000 and 10% of Total Assets.",
    expect: { suppliesPermission: false, notAffirmative: true },
  },
  {
    id: "adv-comparator-as-capacity",
    title: "Comparator threshold misclassified as available capacity",
    span: "The First Lien Net Leverage Ratio shall not be greater than 4.00 to 1.00.",
    expect: { suppliesPermission: false, notAffirmative: true },
  },
  {
    id: "adv-missing-parent-prohibition",
    title: "Missing parent prohibition",
    span: "greater of $25,000,000 and 25% of Applicable EBITDA",
    fidelity: "NUMERICAL_FRAGMENT" as const,
    expect: { suppliesPermission: false, incomplete: true },
  },
  {
    id: "adv-missing-proviso",
    title: "Missing proviso",
    span: "The Borrower may make Restricted Payments in an unlimited amount.",
    // Without leverage proviso in span — still may look like permission, but binding must fail closed for execution.
    expect: { maySupplyPermissionText: true, executable: false },
  },
  {
    id: "adv-missing-remote-condition",
    title: "Missing remote condition",
    span: "other Investments not to exceed the Available Amount.",
    expect: { executable: false },
  },
  {
    id: "adv-missing-definition",
    title: "Missing definition",
    span: "“Available Amount” means the sum of (a) and (b).",
    expect: { role: "DEFINITION", notAffirmative: true },
  },
  {
    id: "adv-wrong-entity-scope",
    title: "Wrong entity scope",
    span: "Foreign Subsidiaries may incur Indebtedness not to exceed $10,000,000.",
    expect: { entityMention: "Foreign Subsidiar", executable: false },
  },
  {
    id: "adv-wrong-measurement-date",
    title: "Wrong measurement date",
    span: "not to exceed 10% of Total Assets as of the date of determination.",
    expect: { measureMention: "date of determination", notStandalonePermission: true },
  },
  {
    id: "adv-superseded-amendment",
    title: "Superseded amendment text",
    span: "as amended and restated, the basket shall not exceed $1,000,000.",
    amendmentNote: "superseded by Amendment No. 3 — prior text",
    expect: { executable: false },
  },
  {
    id: "adv-unresolved-side-letter",
    title: "Unresolved side letter",
    span: "subject to the Side Letter dated as of the Closing Date.",
    expect: { incompleteOrNonPermission: true },
  },
  {
    id: "adv-shared-double-count",
    title: "Shared-capacity double counting",
    span: "together with all other Indebtedness incurred under this clause, in an aggregate amount not to exceed $50,000,000, without duplication.",
    expect: { sharedOrConsumption: true, notAffirmative: true },
  },
  {
    id: "adv-greater-of-arithmetic",
    title: "Incorrect greater-of/lesser-of arithmetic alone",
    span: "the lesser of $2,000,000 and 5% of Consolidated EBITDA",
    fidelity: "NUMERICAL_FRAGMENT" as const,
    expect: { suppliesPermission: false },
  },
  {
    id: "adv-cross-doc-omission",
    title: "Cross-document restriction omission",
    span: "The Borrower may incur Indebtedness under Section 6.01.",
    expect: { hasXref: true, executable: false },
  },
  {
    id: "adv-duplicate-permission",
    title: "Duplicate permission from one underlying basket",
    // Same basket described twice — linking must not create duplicate capacity.
    spanA: "Indebtedness shall not exceed $5,000,000.",
    spanB: "The Borrower may incur other Indebtedness, subject to the $5,000,000 limitation.",
    expect: { noDuplicate: true },
  },
  {
    id: "adv-unavailable-source",
    title: "Unavailable canonical source bytes",
    span: "not to exceed $1,000,000",
    documentPath: "missing/canonical/source.txt",
    expect: { unresolvedSource: true },
  },
] as const;

describe("phase-4 independent adversarial validation", () => {
  it("preserves historical 145-case independent evaluation without rewriting ground truth", () => {
    const path = resolve(PHASE3, "02-independent-legal-safety-reviews.json");
    expect(existsSync(path)).toBe(true);
    const indep = JSON.parse(readFileSync(path, "utf8"));
    expect(indep.totalIndependentReviews).toBe(145);
    expect(indep.reviews.length).toBe(145);
    // Spot-check frozen false-affirmative id still present with original verdict.
    const hit = indep.reviews.find((r: { candidateId: string }) => r.candidateId === "chwy-debt-reclassification");
    expect(hit.independentVerdict).toBe("INCOMPLETE_SEMANTICS");
  });

  it("covers 15 independent adversarial scenarios with fixed expectations", () => {
    expect(ADVERSARIAL_CASES.length).toBe(15);
    const peers = integratePeerWorkstreams(ROOT);
    const flags = peerFlagsForGraph(peers);

    for (const c of ADVERSARIAL_CASES) {
      if (c.id === "adv-duplicate-permission") {
        const roleA = classifySemanticRole({
          spanText: c.spanA!,
          spanFidelity: "OPERATIVE_PROVISION",
          hasBoundPermissionAuthority: true,
        });
        const roleB = classifySemanticRole({
          spanText: c.spanB!,
          spanFidelity: "OPERATIVE_PROVISION",
        });
        expect(roleA.suppliesPermissionAuthority).toBe(false);
        expect(roleB.suppliesPermissionAuthority).toBe(true);
        const link = linkPermissionToCeiling({
          permissionAuthorityId: "B",
          ceilingId: "A",
          permissionRole: roleB.role === "CONDITIONAL_EXCEPTION" ? "CONDITIONAL_EXCEPTION" : "PERMISSION_AUTHORITY",
          ceilingRole: roleA.role === "CAPACITY_CEILING" ? "CAPACITY_CEILING" : "PROHIBITION_THRESHOLD",
        });
        expect(link.duplicateCapacityCreated).toBe(false);
        continue;
      }

      if (c.id === "adv-unavailable-source") {
        const binding = bindGoverningSource({
          candidateId: c.id,
          exactSourceSpan: c.span!,
          documentPath: c.documentPath!,
        });
        expect(binding.bindingResolution).toBe("UNRESOLVED_SOURCE_MISSING");
        expect(binding.sufficientForAffirmativePermission).toBe(false);
        continue;
      }

      const fidelity = "fidelity" in c ? c.fidelity : "OPERATIVE_PROVISION";
      const role = classifySemanticRole({
        spanText: c.span!,
        spanFidelity: fidelity,
      });

      if ("suppliesPermission" in c.expect && c.expect.suppliesPermission === false) {
        expect(role.suppliesPermissionAuthority, c.title).toBe(false);
      }
      if ("notAffirmative" in c.expect && c.expect.notAffirmative) {
        expect(role.capacitySemantics, c.title).not.toBe("AFFIRMATIVE_CAPACITY");
      }
      if ("incomplete" in c.expect && c.expect.incomplete) {
        expect(role.capacitySemantics).toBe("INCOMPLETE_SEMANTICS");
      }
      if ("role" in c.expect && c.expect.role) {
        expect(role.role).toBe(c.expect.role);
      }
      if ("sharedOrConsumption" in c.expect && c.expect.sharedOrConsumption) {
        expect(["SHARED_CAPACITY_LIMITATION", "CAPACITY_CONSUMPTION", "PROHIBITION_THRESHOLD", "CAPACITY_CEILING"]).toContain(
          role.role,
        );
      }
      if ("executable" in c.expect && c.expect.executable === false) {
        const binding = bindGoverningSource({
          candidateId: c.id,
          exactSourceSpan: c.span!,
          documentPath: "adv://synthetic",
          sourceText: c.span!,
          amendmentVersionNote: "amendmentNote" in c ? c.amendmentNote : null,
        });
        const graph = buildDependencyGraph({
          candidateId: c.id,
          semanticRole: role.role,
          binding,
          financialInputs: ["Consolidated EBITDA"],
          sharedCapacityDependencies: [],
          conditions: [],
          peer: flags,
        });
        const status = assignLibraryStatus({ semantic: role, binding, graph });
        assertNeverExecutable(status);
        expect(status.executable).toBe(false);
        expect(status.verified).toBe(false);
        expect(graph.executable).toBe(false);
        expect(graph.completeness.fullyClosed).toBe(false);
      }
    }
  });

  it("treats any false affirmative permission as a promotion blocker", () => {
    const falsePermissionSpans = [
      "greater of $5,000,000 and 10% of Total Assets",
      "shall not exceed $10,000,000",
      "the First Lien Net Leverage Ratio shall not be greater than 3.50 to 1.00",
    ];
    for (const span of falsePermissionSpans) {
      const role = classifySemanticRole({
        spanText: span,
        spanFidelity: "NUMERICAL_FRAGMENT",
      });
      expect(role.capacitySemantics === "AFFIRMATIVE_CAPACITY" && role.suppliesPermissionAuthority).toBe(
        false,
      );
    }
  });
});
