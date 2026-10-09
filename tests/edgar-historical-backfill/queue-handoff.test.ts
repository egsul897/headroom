import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exhibitsFromIndexHtml } from "../../lib/edgar-historical-backfill/index-parser";
import { buildAcquisitionQueue } from "../../lib/edgar-historical-backfill/ranking";
import { validateAcquisitionQueue } from "../../lib/edgar-historical-backfill/queue-validate";
import { toCkfHandoffPackage } from "../../lib/edgar-historical-backfill/ckf-handoff";
import { classifyIbrResidual } from "../../lib/edgar-historical-backfill/ibr-residuals";
import type { ExhibitRef } from "../../lib/edgar-historical-backfill/types";

const fixtureHtml = readFileSync(join(__dirname, "fixtures/sample-index.htm"), "utf8");

describe("acquisition queue validation + CKF handoff", () => {
  it("validates required handoff fields on queued items", () => {
    const exhibits = exhibitsFromIndexHtml(
      { cik: "0000816956", accessionNumber: "0001174947-25-000941", form: "8-K", filingDate: "2025-06-16" },
      fixtureHtml,
    );
    for (const e of exhibits) {
      if (!e.sourceUri && !e.isIncorporatedByReference) e.sourceUri = `https://www.sec.gov/Archives/edgar/data/816956/000117494725000941/${e.filename}`;
      if (e.ibr && e.ibr.resolvedAccessionNumber) {
        e.ibr.resolvedSourceUri = `https://www.sec.gov/Archives/edgar/data/816956/000119312525123456/ex10-1.htm`;
        e.ibr.resolvedFilename = "ex10-1.htm";
        e.ibr.resolutionStatus = "RESOLVED";
        e.sourceUri = e.ibr.resolvedSourceUri;
      }
    }
    const queue = buildAcquisitionQueue({
      exhibits,
      issuersByCik: new Map([["0000816956", { cik: "0000816956", ticker: "CNMD" }]]),
    });
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((q) => q.parentRelationshipCandidates)).toBe(true);
    expect(queue.every((q) => q.dedupeIdentity)).toBe(true);
    expect(queue.every((q) => q.resolutionStatus)).toBe(true);
    const report = validateAcquisitionQueue(queue);
    expect(report.errorCount).toBe(0);
    expect(report.fetchableCount).toBeGreaterThan(0);

    const handoff = toCkfHandoffPackage(queue, { storageStatus: "EPHEMERAL_WORKSPACE" });
    expect(handoff.producer).toBe("WS-EHB");
    expect(handoff.consumer).toBe("WS-CKF");
    expect(handoff.documents[0]?.exhibit.sourceUrl).toMatch(/^https:\/\/www\.sec\.gov\//);
    expect(handoff.documents[0]?.ibrAuthorityNote).toBe("DISCOVERY_HINT_ONLY");
  });
});

describe("IBR residual classification", () => {
  it("separates missing accession vs needs-original-index", () => {
    const missingAcc: ExhibitRef = {
      cik: "0000816956",
      accessionNumber: "0000816956-26-000009",
      filingDate: "2026-02-17",
      form: "10-K",
      exhibitType: "EX-10.1",
      filename: "ex-10.1-ibr",
      description: "Guarantee",
      documentKind: "GUARANTEE",
      relevanceScore: 82,
      isIncorporatedByReference: true,
      ibr: { rawText: "Incorporated by reference to an unspecified prior filing", resolutionStatus: "UNRESOLVED" },
      agreementIdentityKey: "x",
      discoveryStatus: "IBR_UNRESOLVED",
    };
    expect(classifyIbrResidual(missingAcc).residual).toBe("INCORRECT_CITATION_PARSING");

    const needsIndex: ExhibitRef = {
      ...missingAcc,
      ibr: {
        rawText: "Incorporated by reference to Exhibit 10.1 of Form 8-K filed June 16, 2025",
        resolvedAccessionNumber: "0001174947-25-000941",
        resolvedExhibitType: "EX-10.1",
        resolutionStatus: "PARTIAL",
      },
    };
    expect(classifyIbrResidual(needsIndex).residual).toBe("NEEDS_ORIGINAL_INDEX");
  });
});
