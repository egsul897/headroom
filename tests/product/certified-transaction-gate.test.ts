/**
 * Product certified-transaction gate — fail-closed without VerifiedExecutionPackage.
 * Provider-free; uses Prisma only when DATABASE_URL is set for the optional path.
 */
import { describe, expect, it } from "vitest";
import {
  decodeLocatorFromNote,
  encodeLocatorNote,
} from "@/lib/contract-model/runtime/input/store/certificate/map-fact";
import { attemptCertifiedTransaction } from "@/lib/product/north-star-workflow";

describe("certificate locator note encoding", () => {
  it("round-trips page/section/table/row for Prisma FactLocator persistence", () => {
    const note = encodeLocatorNote("hand-keyed", {
      page: 2,
      section: "I. Financial Covenants",
      table: "Leverage Metrics",
      row: "Consolidated EBITDA",
    });
    expect(note).toMatch(/sourceLocator=/);
    const loc = decodeLocatorFromNote(note);
    expect(loc?.page).toBe(2);
    expect(loc?.section).toBe("I. Financial Covenants");
    expect(loc?.table).toBe("Leverage Metrics");
    expect(loc?.row).toBe("Consolidated EBITDA");
  });
});

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("attemptCertifiedTransaction fail-closed", () => {
  it("blocks without evaluation date and without VerifiedExecutionPackage", async () => {
    const r = await attemptCertifiedTransaction({
      companyId: "certified-gate-missing-co",
      verifiedPackage: null,
    });
    expect(r.blockers).toContain("MISSING_EVALUATION_DATE");
    expect(r.capacity).toBeNull();
    expect(r.authorityNote).toMatch(/evaluation date|CERTIFIED path blocked/i);
  });

  it("blocks with date but no package / no approved snapshot", async () => {
    const r = await attemptCertifiedTransaction({
      companyId: "certified-gate-empty-co",
      evaluationDate: "2026-08-01",
      verifiedPackage: null,
    });
    expect(r.blockers).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(r.verifiedPackagePresent).toBe(false);
    expect(r.capacity).toBeNull();
    expect(r.authorityNote).toMatch(/NOT_CERTIFIED_4E|CERTIFIED Phase 4A/);
  });
});
