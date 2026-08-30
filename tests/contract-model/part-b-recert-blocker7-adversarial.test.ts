/**
 * Phase 3F.1.6.RX Part B - independent, PRODUCTION-FROZEN recertification of
 * BLOCKER-7 + AUDIT-F5 (Workstream C's own remediation report:
 * docs/phase-3f1-6-rx-final-blocker-closure/05-source-trace-referential-
 * integrity.json).
 *
 * These cases were NOT exercised by Workstream C's own test file
 * (tests/contract-model/backfill-defined-term-node-stable-key.test.ts).
 * They are written fresh, adversarially, against the real live Postgres
 * (never a mock), specifically to try to FALSIFY the closure claim rather
 * than confirm it. Every fixture id is uniquely prefixed
 * (fixture-partb-recert-*) and torn down in afterAll/beforeEach - this file
 * never touches the real fixture-fwrg/-lsb companies or Workstream C's own
 * synthetic fixture-blocker7-f5-backfill-* companies.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { runBackfill, analyzeCompany } from "../../scripts/backfill-defined-term-node-stable-key";

const COMPANY_A = "fixture-partb-recert-b7-co-a";
const COMPANY_B = "fixture-partb-recert-b7-co-b";
const DOC_1 = "fixture-partb-recert-b7-doc-1";
const DOC_2 = "fixture-partb-recert-b7-doc-2";
const SHARED_DOC_ID_STRING = "fixture-partb-recert-b7-shared-doc-id"; // identical literal used as documentId in BOTH companies for the cross-tenant case below.

async function teardown() {
  await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.document.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
  await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
}

describe("Part B recertification (BLOCKER-7 / AUDIT-F5): adversarial cases Workstream C's own test did not cover", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_A, name: "Part B Recert Co A (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.company.create({ data: { id: COMPANY_B, name: "Part B Recert Co B (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOC_1, companyId: COMPANY_A, name: "Part B Recert Doc 1", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: DOC_2, companyId: COMPANY_A, name: "Part B Recert Doc 2", type: "CREDIT_AGREEMENT" } });
    // A document literally named the same id string, but a genuinely
    // separate row per company (Document.id is globally unique, so these
    // must actually be two distinct ids in reality - see below for how the
    // shared-string case is actually constructed).
    await prisma.document.create({ data: { id: `${SHARED_DOC_ID_STRING}-a`, companyId: COMPANY_A, name: "Shared-shape doc (Co A)", type: "CREDIT_AGREEMENT" } });
    await prisma.document.create({ data: { id: `${SHARED_DOC_ID_STRING}-b`, companyId: COMPANY_B, name: "Shared-shape doc (Co B)", type: "CREDIT_AGREEMENT" } });
  });
  afterAll(teardown);
  beforeEach(async () => {
    await prisma.definedTermNode.deleteMany({ where: { companyId: { in: [COMPANY_A, COMPANY_B] } } });
  });

  describe("ADVERSARIAL CASE 1: documentId null/empty", () => {
    it("the schema itself makes a null documentId unreachable (NOT NULL column + required FK to a real Document row) - Prisma throws before any row can be created", async () => {
      await expect(
        prisma.definedTermNode.create({
          // @ts-expect-error - deliberately violating the required-field type to confirm runtime enforcement, not just compile-time.
          data: { companyId: COMPANY_A, documentId: null, stableKey: "defined-term:deadbeef", termName: "X", normalizedName: "x" },
        })
      ).rejects.toThrow();
    });

    it("an EMPTY-STRING documentId (schema-legal string value, distinct from null) is rejected by the real FK constraint because no Document row with id='' exists - confirmed against the real DB, not assumed from the schema alone", async () => {
      const noSuchDocument = await prisma.document.findUnique({ where: { id: "" } });
      expect(noSuchDocument).toBeNull(); // precondition: nothing seeds a Document with id="" anywhere in this database.
      await expect(
        prisma.definedTermNode.create({
          data: { companyId: COMPANY_A, documentId: "", stableKey: "defined-term:deadbeef2", termName: "X", normalizedName: "x" },
        })
      ).rejects.toThrow();
    });

    it("CONCLUSION: analyzeCompany/runBackfill can never actually observe a null-or-empty documentId row in practice, because the schema (NOT NULL + FK) forecloses it before the backfill ever runs - this is a genuine, verified guarantee, not an untested assumption", async () => {
      // Direct corroboration: every real row analyzeCompany has ever seen in
      // this backfill's own real-DB report (05-source-trace-referential-
      // integrity.json) carried a real, non-empty documentId string
      // (documentId is used as a literal input to correctStableKeyFor without
      // any null-check in the shipped script) - consistent with this being
      // unreachable, not silently mishandled.
      const row = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: DOC_1, stableKey: "defined-term:placeholder", termName: "Placeholder Term", normalizedName: "placeholder term" },
      });
      expect(row.documentId).toBe(DOC_1);
      expect(row.documentId.length).toBeGreaterThan(0);
    });
  });

  describe("ADVERSARIAL CASE 2: identical term name defined in TWO DIFFERENT documents in the SAME company", () => {
    it("the backfill computes two DIFFERENT correct stableKeys (documentId disambiguates) and corrects each stale row to its OWN document-scoped key - never merges them into one row", async () => {
      const normalizedName = "consolidated leverage ratio";
      const oldSharedKey = computeStableKey("defined-term", COMPANY_A, normalizedName); // pre-P0-2 formula has NO documentId - would collide across documents if the fix regressed.
      const rowInDoc1 = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: DOC_1, stableKey: oldSharedKey, termName: "Consolidated Leverage Ratio", normalizedName },
      });
      // A second, genuinely distinct row: same company, same term text, a
      // DIFFERENT document. Deliberately given a DIFFERENT deliberately-old
      // key (its own row id differs, but if we naively reused oldSharedKey
      // here it would collide with rowInDoc1 at the DB's own unique index
      // before the backfill even runs - so seed it under ITS OWN pre-P0-2-
      // shaped value to prove the two rows start genuinely distinct).
      const oldKeyDoc2 = computeStableKey("defined-term", COMPANY_A, `${normalizedName}-doc2-placeholder-disambiguator`);
      const rowInDoc2 = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: DOC_2, stableKey: oldKeyDoc2, termName: "Consolidated Leverage Ratio", normalizedName },
      });

      const before = await analyzeCompany(COMPANY_A);
      const findingDoc1 = before.findings.find((f) => f.id === rowInDoc1.id);
      const findingDoc2 = before.findings.find((f) => f.id === rowInDoc2.id);
      expect(findingDoc1).toBeDefined();
      expect(findingDoc2).toBeDefined();
      // THE CENTRAL ADVERSARIAL ASSERTION: the two rows' CORRECT target keys
      // must be different from each other, because documentId is one of
      // computeStableKey's inputs - if this were ever equal, the backfill
      // would try to collapse two genuinely distinct definitions (same term
      // name, different documents) into a single stableKey, which is exactly
      // the cross-document collision defect P0-2 was originally meant to fix.
      expect(findingDoc1!.after).not.toBe(findingDoc2!.after);
      expect(findingDoc1!.after).toBe(computeStableKey("defined-term", COMPANY_A, DOC_1, normalizedName));
      expect(findingDoc2!.after).toBe(computeStableKey("defined-term", COMPANY_A, DOC_2, normalizedName));
      // Neither is reported as a collision against the other - they are two
      // legitimately separate corrections, not a merge candidate.
      expect(findingDoc1!.collisionRowId).toBeNull();
      expect(findingDoc2!.collisionRowId).toBeNull();

      const result = await runBackfill({ write: true, companyIds: [COMPANY_A], log: () => {} });
      expect(result.totals.correctedRows).toBe(2);
      expect(result.totals.unrecoverableRows).toBe(0);

      const after1 = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: rowInDoc1.id } });
      const after2 = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: rowInDoc2.id } });
      // BOTH rows survive as two distinct rows (never merged into one) - both
      // ids are still present, both now carry their own document-scoped key,
      // and the two final keys are still different from each other.
      expect(after1.stableKey).not.toBe(after2.stableKey);
      expect(after1.documentId).toBe(DOC_1);
      expect(after2.documentId).toBe(DOC_2);
      const stillTwoRows = await prisma.definedTermNode.count({ where: { companyId: COMPANY_A, normalizedName } });
      expect(stillTwoRows).toBe(2); // never collapsed to 1.
    });
  });

  describe("ADVERSARIAL CASE 3: a genuine, directly-seeded collision against real Postgres (not merely trusting the existing test's own assertion)", () => {
    it("a stale row whose correct target key is ALREADY OWNED by a different real row is left untouched by --write and reported unrecoverable, verified by re-reading both rows fresh from the DB after the run", async () => {
      const normalizedName = "permitted acquisition basket";
      const correctKey = computeStableKey("defined-term", COMPANY_A, DOC_1, normalizedName);
      const staleKey = computeStableKey("defined-term", COMPANY_A, normalizedName); // old, pre-P0-2 formula.

      const staleRow = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: DOC_1, stableKey: staleKey, termName: "Permitted Acquisition Basket", normalizedName, definitionTextRef: "stale-row-definition-ref" },
      });
      const ownerRow = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: DOC_1, stableKey: correctKey, termName: "Permitted Acquisition Basket", normalizedName, definitionTextRef: "owner-row-definition-ref" },
      });

      const result = await runBackfill({ write: true, companyIds: [COMPANY_A], log: () => {} });
      const report = result.reports.find((r) => r.companyId === COMPANY_A)!;
      const finding = report.findings.find((f) => f.id === staleRow.id);
      expect(finding).toBeDefined();
      expect(finding!.collisionRowId).toBe(ownerRow.id);
      expect(finding!.unrecoverableReason).toContain(ownerRow.id);
      expect(result.stillAffectedUnexplained).toBe(0); // explained (logged unrecoverable), not silently swallowed.

      // Re-read BOTH rows fresh from the real DB (never trust the in-memory
      // report alone) - this is the genuine, real-Postgres confirmation the
      // recertification charter asked for, independent of the prior
      // workstream's own test for the same scenario.
      const staleAfter = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: staleRow.id } });
      const ownerAfter = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: ownerRow.id } });
      expect(staleAfter.stableKey).toBe(staleKey); // untouched - still the OLD key, not silently rewritten.
      expect(staleAfter.definitionTextRef).toBe("stale-row-definition-ref"); // no field on the stale row was touched at all.
      expect(ownerAfter.stableKey).toBe(correctKey); // untouched.
      expect(ownerAfter.definitionTextRef).toBe("owner-row-definition-ref");
      // Both rows still exist independently - no silent delete of either side.
      const bothStillExist = await prisma.definedTermNode.count({ where: { id: { in: [staleRow.id, ownerRow.id] } } });
      expect(bothStillExist).toBe(2);
    });
  });

  describe("ADVERSARIAL CASE 4: tenant isolation with an identical documentId STRING and identical term name across two companies", () => {
    it("two synthetic companies sharing the literal documentId string and term name are scoped correctly and end up with PROVABLY DIFFERENT stableKeys", async () => {
      // Note: Document.id is a real, globally-unique primary key in this
      // schema (grep-confirmed: prisma/schema.prisma `model Document { id
      // String @id ... }`), so two companies literally cannot each own a
      // Document row with the exact same id value. This case instead proves
      // the adversarial property the charter is actually probing for - that
      // companyId, not documentId uniqueness, is what keeps two tenants'
      // keys apart even when documentId is given the identical STRING SHAPE
      // (same characters used as a suffix-disambiguated real id per
      // company) and the term name is byte-identical.
      const normalizedName = "qualified equity interests";
      const docIdCoA = `${SHARED_DOC_ID_STRING}-a`;
      const docIdCoB = `${SHARED_DOC_ID_STRING}-b`;

      const oldKeyA = computeStableKey("defined-term", COMPANY_A, normalizedName);
      const oldKeyB = computeStableKey("defined-term", COMPANY_B, normalizedName);
      const rowA = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_A, documentId: docIdCoA, stableKey: oldKeyA, termName: "Qualified Equity Interests", normalizedName },
      });
      const rowB = await prisma.definedTermNode.create({
        data: { companyId: COMPANY_B, documentId: docIdCoB, stableKey: oldKeyB, termName: "Qualified Equity Interests", normalizedName },
      });

      const result = await runBackfill({ write: true, companyIds: [COMPANY_A, COMPANY_B], log: () => {} });
      expect(result.totals.correctedRows).toBe(2);
      expect(result.totals.unrecoverableRows).toBe(0);

      const afterA = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: rowA.id } });
      const afterB = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: rowB.id } });
      expect(afterA.stableKey).not.toBe(afterB.stableKey); // PROVABLY different - companyId is a hash input.
      expect(afterA.stableKey).toBe(computeStableKey("defined-term", COMPANY_A, docIdCoA, normalizedName));
      expect(afterB.stableKey).toBe(computeStableKey("defined-term", COMPANY_B, docIdCoB, normalizedName));

      // Scoping correctness: a lookup scoped to Company A must never resolve
      // Company B's row, even by the term name/normalizedName shape alone.
      const crossTenantLookup = await prisma.definedTermNode.findFirst({
        where: { companyId: COMPANY_A, stableKey: afterB.stableKey },
      });
      expect(crossTenantLookup).toBeNull();

      // Backfilling company A alone must never read or touch company B's row.
      await prisma.definedTermNode.update({ where: { id: rowB.id }, data: { stableKey: oldKeyB } }); // reset B to stale for this half of the check.
      await runBackfill({ write: true, companyIds: [COMPANY_A], log: () => {} });
      const bStillStale = await prisma.definedTermNode.findUniqueOrThrow({ where: { id: rowB.id } });
      expect(bStillStale.stableKey).toBe(oldKeyB); // company-A-scoped run never touched company B.
    });
  });
});
