/**
 * Document-scoped absence: a partial filing's missing operative covenant is not a package-wide ABSENT_VERIFIED.
 * TOC entries never establish an operative covenant. absentScope survives FamilySummary and customer persistence.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentTree } from "@/lib/contract-model/section-tree/parse";
import { covenantChecklist } from "@/lib/contract-model/section-tree/semantics";
import { runAgreementPipeline, persistCustomerAgreementRun, type CustomerStore } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";

const AMENDMENT_TOC = [
  "AMENDMENT NO. 4 TO CREDIT AGREEMENT",
  "",
  "This Amendment is entered into as of the date hereof by and among the Borrower and the Lenders.",
  "",
  "TABLE OF CONTENTS",
  "",
  "ARTICLE VII NEGATIVE COVENANTS",
  "59",
  "",
  "Section 7.01",
  "Liens",
  "59",
  "",
  "Section 7.02",
  "Investments",
  "59",
  "",
  "Section 1. Amendments. Section 1.01 of the Credit Agreement is hereby amended by restating the definition of Applicable Margin.",
  "",
  "Section 2. Conditions Precedent. This Amendment shall become effective on the date hereof.",
  "",
  "Section 3. Counterparts. This Amendment may be executed in counterparts.",
  "",
].join("\n");

const AMENDMENT_BY_REF = [
  "FIRST AMENDMENT TO CREDIT AGREEMENT",
  "",
  "Section 1. Amendments. The definition of Applicable Rate is amended to read 2.00%.",
  "",
  "Section 2. Covenants. The negative covenants set forth in Article VI of the Credit Agreement are hereby incorporated herein by reference.",
  "",
  "Section 3. Counterparts. This Amendment may be executed in counterparts.",
  "",
].join("\n");

const COMPLETE_AGREEMENT = [
  "CREDIT AGREEMENT",
  "",
  "Section 1.01 Definitions. Capitalized terms have the meanings given below.",
  "",
  "Section 2.01 Loans. The Lenders agree to make Loans to the Borrower.",
  "",
  "Section 10.01 Notices. All notices shall be in writing.",
  "",
  "Section 10.02 Counterparts. This Agreement may be executed in counterparts.",
  "",
].join("\n");

function fakeCustomerStore(): CustomerStore & { runs: Array<Record<string, unknown>> } {
  const runs: Array<Record<string, unknown>> = [];
  const store: CustomerStore & { runs: typeof runs } = {
    runs,
    async $transaction(fn) { return fn(store); },
    customerAgreementRun: {
      async create({ data }) {
        const id = `run-${runs.length + 1}`;
        runs.push({ id, ...data });
        return { id };
      },
      async findUnique({ where }) {
        const hit = runs.find((r) => r.runKey === where.runKey);
        return hit ? { id: String(hit.id), status: String(hit.status) } : null;
      },
      async update({ where, data }) {
        const hit = runs.find((r) => r.id === where.id)!;
        Object.assign(hit, data);
        return { id: String(hit.id) };
      },
    },
    customerTreeNode: { async createMany({ data }) { return { count: data.length }; } },
    customerTreeXref: { async createMany({ data }) { return { count: data.length }; } },
    customerTreeChecklist: { async createMany({ data }) { return { count: data.length }; } },
  };
  return store;
}

describe("document-scoped absence (package-wide vs this document)", () => {
  it("A: an amendment whose only Liens/Investments text is a table of contents never yields package-wide ABSENT_VERIFIED", () => {
    const t = parseDocumentTree(AMENDMENT_TOC);
    const ck = covenantChecklist(t, t.text);
    // TOC entries are not operative evidence; the family is absent from this document only.
    for (const f of ["LIENS", "INVESTMENTS"] as const) {
      const item = ck.find((c) => c.family === f)!;
      expect(item.status === "ABSENT_VERIFIED" || item.status === "MISSING").toBe(true);
      if (item.status === "ABSENT_VERIFIED") expect(item.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
    }
    const pipe = runAgreementPipeline({ sourceId: "test:amendment-toc", text: AMENDMENT_TOC });
    for (const f of ["LIENS", "INVESTMENTS"] as const) {
      const fam = pipe.families.find((x) => x.family === f)!;
      expect(fam.outcome).not.toBe("ABSENT_VERIFIED");
      expect(fam.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
    }
  });

  it("B: an amendment that incorporates the base agreement's covenants stays unresolved until the base is read", () => {
    const pipe = runAgreementPipeline({ sourceId: "test:amendment-byref", text: AMENDMENT_BY_REF });
    const debt = pipe.families.find((x) => x.family === "DEBT")!;
    expect(debt.outcome).not.toBe("ABSENT_VERIFIED");
    expect(["MISSING", "NEEDS_INPUT"]).toContain(debt.outcome);
    expect(debt.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
  });

  it("C: a complete agreement with a real absence keeps package-wide ABSENT_VERIFIED", () => {
    const pipe = runAgreementPipeline({ sourceId: "test:full-agmt", text: COMPLETE_AGREEMENT });
    const debt = pipe.families.find((x) => x.family === "DEBT")!;
    expect(debt.outcome).toBe("ABSENT_VERIFIED");
    expect(debt.absentScope).toBeUndefined();
    const ck = pipe.checklist.find((c) => c.family === "DEBT")!;
    expect(ck.status).toBe("ABSENT_VERIFIED");
    expect(ck.absentScope).toBeUndefined();
  });

  it("D: document-only scope on a family summary survives customer persistence round-trip", async () => {
    const store = fakeCustomerStore();
    const pipe = runAgreementPipeline({ sourceId: "customer:doc-1", text: AMENDMENT_BY_REF });
    const before = pipe.families.find((x) => x.family === "LIENS")!;
    expect(before.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
    const out = await persistCustomerAgreementRun(
      store,
      { companyId: "co-1", documentId: "doc-1", sourceId: "customer:doc-1" },
      () => pipe,
    );
    expect(out.status).toBe("OK");
    const saved = store.runs[0]!;
    const families = JSON.parse(JSON.stringify(saved.families)) as typeof pipe.families;
    const after = families.find((x) => x.family === "LIENS")!;
    expect(after.absentScope).toBe("DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE");
    expect(after.outcome).not.toBe("ABSENT_VERIFIED");
  });
});
