/**
 * P0 — operative amount / authority consistency.
 *
 * Successor authority must never publish predecessor basket amounts when
 * successor operative text has not been retrieved and verified.
 */

import { describe, expect, it } from "vitest";
import {
  applyOperativeSourcePublicationGate,
  operativeSourceBoundToGoverning,
} from "@/lib/contract-model/analysis/operative-covenant-package";
import type { CompileUnitRepresentation } from "@/lib/contract-model/analysis/offline-package-compile";

const PREDECESSOR = "credit-agreement-2020";
const SUCCESSOR = "amended-restated-credit-agreement-2022";
const PREDECESSOR_BASKET_USD = 50_000_000;
const SUCCESSOR_BASKET_USD = 100_000_000;

function stubUnit(
  overrides: Partial<CompileUnitRepresentation> &
    Pick<
      CompileUnitRepresentation,
      | "documentId"
      | "discoveryDocumentId"
      | "operativeSourceDocumentId"
      | "operativeSourceBindingStatus"
      | "operativeText"
      | "fixedDollarSlice"
    >,
): CompileUnitRepresentation {
  return {
    unitId: "unit:test-7.03(f)",
    discoveryId: "disc:7.03(f)",
    sourceRef: "7.03(f)",
    role: "BASKET",
    families: ["INDEBTEDNESS"],
    description: "test basket",
    operativeTextSha256: "abc",
    sourceSpan: { charStart: 100, charEnd: 200 },
    supportStatus: "SUPPORTED_STRUCTURE",
    capsAndThresholds: [],
    ratioMentions: [],
    entityMentions: [],
    crossReferences: [],
    definedTermDependencies: [],
    debtLienLinks: [],
    contextBundleSummary: null,
    deterministicFactCount: 1,
    localCompileStatus: "DETERMINISTIC",
    executableAuthority: "VERIFIED_EXECUTABLE",
    greaterOfSlice: null,
    provenance: {
      discoveryMethods: ["test"],
      evidenceSignals: [],
      offlineCompileVersion: "test",
    },
    ...overrides,
  };
}

describe("P0 — operative source amount / authority consistency", () => {
  it("end-to-end: successor authority + predecessor $50M discovery unit REFUSES authoritative GROSS", () => {
    expect(PREDECESSOR_BASKET_USD).not.toBe(SUCCESSOR_BASKET_USD);

    // Discovery originated on 2020; amounts/text from superseded predecessor.
    // As-of after 2022 successor effectiveness; OA points governing → successor.
    const unit = stubUnit({
      documentId: PREDECESSOR,
      discoveryDocumentId: PREDECESSOR,
      operativeSourceDocumentId: PREDECESSOR,
      operativeSourceBindingStatus: "UNVERIFIED_DISCOVERY_FALLBACK",
      operativeText: `Section 7.03(f): Indebtedness not to exceed $${PREDECESSOR_BASKET_USD / 1_000_000},000,000.`,
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: PREDECESSOR_BASKET_USD,
        productionRefusal: "PRODUCTION_REFUSED",
      },
    });

    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });

    expect(pub.capacityClass).toBe("UNSUPPORTED_OR_UNKNOWN");
    expect(pub.sourceBackedGrossCapacityUsd).toBeNull();
    expect(pub.executableAuthority).toBe("REFUSED");
    expect(pub.operativeSourceBindingStatus).toBe("REFUSED_MISMATCH");
    expect(pub.missingDependencies).toContain(
      "operative_source_not_verified_on_governing_document",
    );
    // Historical predecessor evidence preserved separately — never published as GROSS.
    expect(pub.historicalPredecessorEvidence).not.toBeNull();
    expect(pub.historicalPredecessorEvidence!.amountUsd).toBe(PREDECESSOR_BASKET_USD);
    expect(pub.historicalPredecessorEvidence!.discoveryDocumentId).toBe(PREDECESSOR);
    expect(pub.historicalPredecessorEvidence!.operativeSourceDocumentId).toBe(PREDECESSOR);
    expect(pub.historicalPredecessorEvidence!.sourceSpan.charStart).toBe(100);
    expect(pub.historicalPredecessorEvidence!.sourceRef).toBe("7.03(f)");
  });

  it("compiled contractual amount comes from legally operative provision when binding verified", () => {
    const unit = stubUnit({
      documentId: PREDECESSOR, // discovery may still cite predecessor id
      discoveryDocumentId: PREDECESSOR,
      operativeSourceDocumentId: SUCCESSOR,
      operativeSourceBindingStatus: "VERIFIED_ON_GOVERNING",
      operativeText: `Section 7.03(f): Indebtedness not to exceed $${SUCCESSOR_BASKET_USD / 1_000_000},000,000.`,
      sourceSpan: { charStart: 500, charEnd: 700 },
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: SUCCESSOR_BASKET_USD,
        productionRefusal: "PRODUCTION_REFUSED",
      },
    });

    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });

    expect(pub.capacityClass).toBe("SOURCE_BACKED_GROSS_CONTRACTUAL");
    expect(pub.sourceBackedGrossCapacityUsd).toBe(SUCCESSOR_BASKET_USD);
    expect(pub.sourceBackedGrossCapacityUsd).not.toBe(PREDECESSOR_BASKET_USD);
    expect(pub.historicalPredecessorEvidence).toBeNull();
    expect(
      operativeSourceBoundToGoverning({
        governingDocumentId: SUCCESSOR,
        operativeSourceDocumentId: SUCCESSOR,
        operativeSourceBindingStatus: "VERIFIED_ON_GOVERNING",
      }),
    ).toBe(true);
  });

  it("unchanged provision on governing document (same-doc discovery) may publish GROSS", () => {
    const unit = stubUnit({
      documentId: SUCCESSOR,
      discoveryDocumentId: SUCCESSOR,
      operativeSourceDocumentId: SUCCESSOR,
      operativeSourceBindingStatus: "VERIFIED_SAME_AS_DISCOVERY",
      operativeText: `Section 7.03(f): not to exceed $100,000,000.`,
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: SUCCESSOR_BASKET_USD,
        productionRefusal: "PRODUCTION_REFUSED",
      },
    });
    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });
    expect(pub.capacityClass).toBe("SOURCE_BACKED_GROSS_CONTRACTUAL");
    expect(pub.sourceBackedGrossCapacityUsd).toBe(SUCCESSOR_BASKET_USD);
  });

  it("changed provision: predecessor amount must not publish under successor governing id", () => {
    const unit = stubUnit({
      documentId: PREDECESSOR,
      discoveryDocumentId: PREDECESSOR,
      // Mistaken path: authority remapped but IR still from predecessor catalog.
      operativeSourceDocumentId: PREDECESSOR,
      operativeSourceBindingStatus: "VERIFIED_SAME_AS_DISCOVERY",
      operativeText: `not to exceed $50,000,000`,
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: PREDECESSOR_BASKET_USD,
        productionRefusal: null,
      },
    });
    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });
    expect(pub.sourceBackedGrossCapacityUsd).toBeNull();
    expect(pub.capacityClass).toBe("UNSUPPORTED_OR_UNKNOWN");
    expect(pub.historicalPredecessorEvidence!.amountUsd).toBe(PREDECESSOR_BASKET_USD);
  });

  it("partial amendment: unverified successor text for amended limb REFUSES GROSS", () => {
    const unit = stubUnit({
      documentId: PREDECESSOR,
      discoveryDocumentId: PREDECESSOR,
      operativeSourceDocumentId: PREDECESSOR,
      operativeSourceBindingStatus: "UNVERIFIED_DISCOVERY_FALLBACK",
      sourceRef: "7.03(f)",
      operativeText: "not to exceed $50,000,000 (predecessor partial target)",
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: PREDECESSOR_BASKET_USD,
        productionRefusal: null,
      },
    });
    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });
    expect(pub.capacityClass).toBe("UNSUPPORTED_OR_UNKNOWN");
    expect(pub.sourceBackedGrossCapacityUsd).toBeNull();
    expect(pub.productionRefusal).toMatch(/governing document/i);
  });

  it("ambiguous successor text (binding fallback) REFUSES rather than reusing predecessor calculations", () => {
    expect(
      operativeSourceBoundToGoverning({
        governingDocumentId: SUCCESSOR,
        operativeSourceDocumentId: PREDECESSOR,
        operativeSourceBindingStatus: "UNVERIFIED_DISCOVERY_FALLBACK",
      }),
    ).toBe(false);

    const unit = stubUnit({
      documentId: PREDECESSOR,
      discoveryDocumentId: PREDECESSOR,
      operativeSourceDocumentId: PREDECESSOR,
      operativeSourceBindingStatus: "UNVERIFIED_DISCOVERY_FALLBACK",
      operativeText: "ambiguous / missing successor span — kept discovery text $50,000,000",
      fixedDollarSlice: {
        classification: "FIXED_DOLLAR_SOLE_CAP",
        compileClass: "VERIFIED_EXECUTABLE_CANDIDATE",
        fidelityVerdict: "PASS",
        capacityOutcome: "VERIFIED_EXECUTABLE",
        availableAmountUsd: PREDECESSOR_BASKET_USD,
        productionRefusal: null,
      },
    });
    const pub = applyOperativeSourcePublicationGate({
      unit,
      governingDocumentId: SUCCESSOR,
      capacityClass: "SOURCE_BACKED_GROSS_CONTRACTUAL",
    });
    expect(pub.sourceBackedGrossCapacityUsd).toBeNull();
    expect(pub.modeledHypotheticalCapacityUsd).toBeNull();
    expect(pub.historicalPredecessorEvidence!.note).toMatch(/not authoritative/i);
  });
});
