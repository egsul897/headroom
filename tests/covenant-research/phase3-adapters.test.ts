/**
 * Phase 3 — canonical adapters, SUP/Gibraltar ingest, provenance taxonomy.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhase3ResearchCorpus,
  normalizeVerificationStatus,
  probeCanonicalExportAdapters,
  retrieveResearch,
} from "../../lib/covenant-research";

describe("covenant research phase3 — adapters and provenance", () => {
  it("implements versioned CKF adapters and reports blockers when exports absent", () => {
    const adapters = probeCanonicalExportAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(7);
    expect(adapters.every((a) => a.adapterImplemented && a.fixtureTested)).toBe(true);
    expect(adapters.every((a) => a.persistedToDurableDatabase === false)).toBe(true);
    expect(adapters.every((a) => a.independentlyVerified === false)).toBe(true);
    expect(adapters.every((a) => a.realExportTested === false)).toBe(true);
    expect(adapters.every((a) => a.blocker != null)).toBe(true);
  });

  it("normalizes legacy statuses without promoting to independent legal verification", () => {
    expect(normalizeVerificationStatus("COMPILED")).toBe("HYPOTHESIS");
    expect(normalizeVerificationStatus("VERIFIED")).toBe("SOURCE_VERIFIED");
    expect(normalizeVerificationStatus("FIXTURE")).toBe("FIXTURE");
    expect(normalizeVerificationStatus("UNVERIFIED")).toBe("UNVERIFIED");
    expect(normalizeVerificationStatus("INDEPENDENTLY_LEGALLY_VERIFIED")).toBe(
      "INDEPENDENTLY_LEGALLY_VERIFIED",
    );
  });

  it("phase3 corpus adds SUP + Gibraltar authentic package material", () => {
    const report = buildPhase3ResearchCorpus();
    expect(report.phase).toBe("phase3");
    expect(report.newlyIndexedFromExistingData).toBeGreaterThan(1000);
    expect(report.distinctIssuers).toBeGreaterThanOrEqual(7);
    expect(report.entries.some((e) => e.issuer.ticker === "SUP")).toBe(true);
    expect(report.entries.some((e) => e.tags.includes("gibraltar-2026"))).toBe(true);
    expect(report.verificationStatusDistribution.INDEPENDENTLY_LEGALLY_VERIFIED ?? 0).toBe(0);
    expect(report.canonicalExportRawCount ?? 0).toBe(0);
  }, 60_000);

  it("discloses missing dependencies / amendment uncertainty on affected hits", () => {
    const report = buildPhase3ResearchCorpus();
    const response = retrieveResearch(
      { text: "Superior Industries Restricted Payments Section 7.05", issuer: "SUP" },
      { corpus: report.entries, limit: 5 },
    );
    expect(response.hits.length).toBeGreaterThan(0);
    // At least one hit should carry disclosed dependency or uncertainty when present on entry.
    const anyDisclosure = response.hits.some(
      (h) =>
        (h.entry.missingDependencies?.length ?? 0) > 0 ||
        (h.uncertaintyNotes?.length ?? 0) > 0 ||
        h.entry.verificationStatus === "UNVERIFIED" ||
        h.entry.verificationStatus === "HYPOTHESIS",
    );
    expect(anyDisclosure).toBe(true);
  }, 60_000);
});
