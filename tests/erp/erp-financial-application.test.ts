/**
 * ERP-2 application layer tests (lib/erp/**) against an in-memory fake
 * implementing the structural ErpApplicationDb — the same no-real-DB
 * pattern lib/covenant-engine.ts's adapter tests use. One test goes
 * further and feeds the fake into the REAL loadCompanyCovenantData to
 * prove an ERP-applied ledger row lands in the engine's dataset (i.e.
 * remaining basket capacity actually reflects ERP usage).
 */

import { describe, expect, it } from "vitest";
import {
  applyErpBasketTransaction,
  listErpAddbackEvidence,
  listErpFactApplications,
  recordErpAddbackEvidence,
  type ErpApplicationDb,
  type ErpNormalizedFact,
} from "@/lib/erp";
import { loadCompanyCovenantData } from "@/lib/covenant-engine";

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

interface FakeLedgerRow {
  id: string;
  companyId: string;
  documentId: string | null;
  date: Date;
  description: string;
  basket: string;
  amount: number;
  direction: string;
  source: string | null;
  createdBy: string | null;
  status: string;
}

class FakeDb implements ErpApplicationDb {
  connections: Array<{ id: string; companyId: string }> = [];
  applications: any[] = [];
  ledger: FakeLedgerRow[] = [];
  provisions: any[] = [];
  permissions: any[] = [];
  documents: any[] = [];
  snapshots: any[] = [];
  private seq = 0;

  private nextId(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  companySourceConnection = {
    findUnique: async ({ where }: any) => this.connections.find((c) => c.id === where.id) ?? null,
  };

  erpFactApplication = {
    findUnique: async ({ where }: any) => {
      const key = where.companyId_connectionId_externalId;
      return (
        this.applications.find(
          (a) => a.companyId === key.companyId && a.connectionId === key.connectionId && a.externalId === key.externalId,
        ) ?? null
      );
    },
    create: async ({ data }: any) => {
      const row = { id: this.nextId("app"), deliveryCount: 1, createdAt: new Date(), updatedAt: new Date(), ...data };
      this.applications.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.applications.find((a) => a.id === where.id);
      if (!row) throw new Error(`no application ${where.id}`);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    findMany: async ({ where }: any = {}) => {
      const w = where ?? {};
      return this.applications.filter(
        (a) =>
          (w.companyId === undefined || a.companyId === w.companyId) &&
          (w.kind === undefined || a.kind === w.kind) &&
          (w.disposition === undefined || a.disposition === w.disposition),
      );
    },
  };

  ledgerEntry = {
    create: async ({ data }: any) => {
      const row: FakeLedgerRow = { id: this.nextId("led"), status: "ACTIVE", ...data };
      this.ledger.push(row);
      return row;
    },
    findMany: async ({ where }: any = {}) => {
      const w = where ?? {};
      return this.ledger.filter(
        (e) =>
          (w.companyId === undefined || e.companyId === w.companyId) &&
          (w.status === undefined || e.status === w.status) &&
          (w.date?.lte === undefined || e.date.getTime() <= new Date(w.date.lte).getTime()),
      );
    },
  };

  covenantProvision = {
    findMany: async ({ where }: any = {}) => this.provisions.filter((p) => !where?.companyId || p.companyId === where.companyId),
  };
  permission = {
    findMany: async ({ where }: any = {}) => this.permissions.filter((p) => !where?.companyId || p.companyId === where.companyId),
  };
  document = {
    findMany: async ({ where }: any = {}) => this.documents.filter((d) => !where?.companyId || d.companyId === where.companyId),
  };
  financialSnapshot = {
    findMany: async ({ where }: any = {}) => {
      const w = where ?? {};
      return this.snapshots.filter(
        (s) => (w.companyId === undefined || s.companyId === w.companyId) && (w.asOfDate?.lte === undefined || s.asOfDate.getTime() <= new Date(w.asOfDate.lte).getTime()),
      );
    },
  };

  async $transaction<T>(fn: (tx: ErpApplicationDb) => Promise<T>): Promise<T> {
    return fn(this as unknown as ErpApplicationDb);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const CONN_A = "conn-a";
const DOC_A = "doc-a";

function seededDb(): FakeDb {
  const db = new FakeDb();
  db.connections.push({ id: CONN_A, companyId: COMPANY_A });
  db.documents.push({
    id: DOC_A,
    companyId: COMPANY_A,
    name: "Company A Credit Agreement",
    type: "CREDIT_AGREEMENT",
    governs: null,
    capacityFormulas: { secured: null, unsecured: null },
    rpWaterfall: { steps: [] },
    assetSale: null,
    effectiveFrom: null,
    effectiveTo: null,
  });
  db.snapshots.push({
    companyId: COMPANY_A,
    asOfDate: new Date("2026-06-30T00:00:00Z"),
    ebitda: 300,
    cash: 50,
    interestExpense: 20,
    cumulativeNetIncome: 100,
    equityProceedsSinceIssue: 40,
    assumedNewDebtRatePct: 6,
    totalDebt: 400,
    securedDebt: 250,
  });
  return db;
}

function dividendFact(overrides: Partial<ErpNormalizedFact> = {}): ErpNormalizedFact {
  return {
    source: "ERP",
    companyId: COMPANY_A,
    connectionId: CONN_A,
    externalId: "erp-div-1",
    factKey: "basket_transaction.dividend",
    asOf: "2026-07-15",
    amount: 25,
    currency: "USD",
    transactionKind: "DIVIDEND",
    description: "Q2 dividend per board resolution",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Basket usage application
// ---------------------------------------------------------------------------

describe("applyErpBasketTransaction", () => {
  it("applies a dividend once — and an identical re-delivery never double-consumes", async () => {
    const db = seededDb();
    const first = await applyErpBasketTransaction(db, COMPANY_A, dividendFact());
    expect(first.disposition).toBe("APPLIED");
    expect(first.duplicate).toBe(false);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ basket: "DIVIDEND", direction: "DEBIT", amount: 25, source: `erp:${CONN_A}` });

    const again = await applyErpBasketTransaction(db, COMPANY_A, dividendFact());
    expect(again.disposition).toBe("APPLIED");
    expect(again.duplicate).toBe(true);
    expect(again.applicationId).toBe(first.applicationId);
    expect(db.ledger).toHaveLength(1);
    const rows = await listErpFactApplications(db, COMPANY_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deliveryCount).toBe(2);

    // The engine's own dataset sees exactly one $25M DEBIT — remaining
    // RP capacity is reduced once, not twice.
    const data = await loadCompanyCovenantData(db as any, COMPANY_A, new Date("2026-07-20T00:00:00Z"));
    const rpDebits = data.ledger.filter((e) => e.basket === "DIVIDEND" && e.direction === "DEBIT");
    expect(rpDebits).toEqual([{ basket: "DIVIDEND", amount: 25, direction: "DEBIT" }]);
  });

  it("matches a hinted debt incurrence to the hinted provision's basket and document", async () => {
    const db = seededDb();
    db.provisions.push({
      id: "prov-1",
      companyId: COMPANY_A,
      documentId: DOC_A,
      code: "debt_general",
      basketName: "General Debt Basket",
      sectionRef: "7.02(u)",
      effectiveFrom: null,
      effectiveTo: null,
    });
    const result = await applyErpBasketTransaction(
      db,
      COMPANY_A,
      dividendFact({
        externalId: "erp-debt-1",
        factKey: "basket_transaction.debt_incurrence",
        transactionKind: "DEBT_INCURRENCE",
        amount: 80,
        basketHint: { sectionRef: "7.02(u)" },
        description: "Term loan draw",
      }),
    );
    expect(result.disposition).toBe("APPLIED");
    expect(db.ledger[0]).toMatchObject({ basket: "DEBT_INCUR", direction: "DEBIT", amount: 80, documentId: DOC_A });
    const rows = await listErpFactApplications(db, COMPANY_A);
    expect(rows[0]!.matchedProvisionId).toBe("prov-1");
    expect(rows[0]!.matchedDocumentId).toBe(DOC_A);
  });

  it("records an unmatched transaction as UNMATCHED and surfaces it — never dropped, never force-matched", async () => {
    const db = new FakeDb();
    db.connections.push({ id: CONN_A, companyId: COMPANY_A });
    // No documents, no provisions, no permissions: nothing to match against.
    const result = await applyErpBasketTransaction(db, COMPANY_A, dividendFact());
    expect(result.disposition).toBe("UNMATCHED");
    expect(result.reasons.join(" ")).toMatch(/UNMATCHED/);
    expect(db.ledger).toHaveLength(0);
    const surfaced = await listErpFactApplications(db, COMPANY_A, "UNMATCHED");
    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]!.externalId).toBe("erp-div-1");
  });

  it("a hint that matches nothing is UNMATCHED, not approximated to the nearest basket", async () => {
    const db = seededDb();
    const result = await applyErpBasketTransaction(
      db,
      COMPANY_A,
      dividendFact({ basketHint: { basketName: "Nonexistent Basket" } }),
    );
    expect(result.disposition).toBe("UNMATCHED");
    expect(db.ledger).toHaveLength(0);
  });

  it("a hint pointing at a permission of a different family is UNMATCHED (conflicting ERP mapping)", async () => {
    const db = seededDb();
    db.permissions.push({
      id: "perm-debt",
      companyId: COMPANY_A,
      documentId: DOC_A,
      code: "debt_perm",
      grantType: "DEBT_INCURRENCE",
      sectionRef: "7.02(a)",
      effectiveFrom: null,
      effectiveTo: null,
    });
    const result = await applyErpBasketTransaction(
      db,
      COMPANY_A,
      dividendFact({ basketHint: { permissionCode: "debt_perm" } }),
    );
    expect(result.disposition).toBe("UNMATCHED");
    expect(result.reasons.join(" ")).toMatch(/not the RESTRICTED_PAYMENT family/);
    expect(db.ledger).toHaveLength(0);
  });

  it("a conflicting re-delivery (same external id, different amount) fails closed and applies nothing new", async () => {
    const db = seededDb();
    const first = await applyErpBasketTransaction(db, COMPANY_A, dividendFact({ amount: 50 }));
    expect(first.disposition).toBe("APPLIED");

    const conflict = await applyErpBasketTransaction(db, COMPANY_A, dividendFact({ amount: 75 }));
    expect(conflict.disposition).toBe("CONFLICT");
    expect(conflict.duplicate).toBe(false);
    // The original $50M application stands; no $75M entry exists.
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]!.amount).toBe(50);
    const rows = await listErpFactApplications(db, COMPANY_A, "CONFLICT");
    expect(rows).toHaveLength(1);
    expect((rows[0]!.conflictPayload as any).amount).toBe(75);
    expect(rows[0]!.detail).toMatch(/left in place/);
  });

  it("refuses cross-company facts: a fact claiming another company, and a connection owned by another company", async () => {
    const db = seededDb();
    db.connections.push({ id: "conn-b", companyId: COMPANY_B });

    const claiming = await applyErpBasketTransaction(db, COMPANY_A, dividendFact({ companyId: COMPANY_B, externalId: "x-1" }));
    expect(claiming.disposition).toBe("REJECTED");
    expect(claiming.reasons.join(" ")).toMatch(/claims company/);

    const foreignConn = await applyErpBasketTransaction(
      db,
      COMPANY_A,
      dividendFact({ connectionId: "conn-b", externalId: "x-2" }),
    );
    expect(foreignConn.disposition).toBe("REJECTED");
    expect(foreignConn.reasons.join(" ")).toMatch(/belongs to a different company/);

    expect(db.ledger).toHaveLength(0);
    // Nothing was recorded under company B either.
    expect(await listErpFactApplications(db, COMPANY_B)).toHaveLength(0);
  });

  it("refuses an invalid amount before any matching or writing", async () => {
    const db = seededDb();
    const result = await applyErpBasketTransaction(db, COMPANY_A, dividendFact({ amount: 0 }));
    expect(result.disposition).toBe("REJECTED");
    expect(db.ledger).toHaveLength(0);
  });

  it("a fact refused before its connection was registered is re-processed on identical re-delivery", async () => {
    const db = seededDb();
    const fact = dividendFact({ connectionId: "conn-late", externalId: "late-1" });
    const refused = await applyErpBasketTransaction(db, COMPANY_A, fact);
    expect(refused.disposition).toBe("REJECTED");

    db.connections.push({ id: "conn-late", companyId: COMPANY_A });
    const applied = await applyErpBasketTransaction(db, COMPANY_A, fact);
    expect(applied.disposition).toBe("APPLIED");
    expect(applied.applicationId).toBe(refused.applicationId);
    expect(db.ledger).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Add-back evidence intake
// ---------------------------------------------------------------------------

function addbackFact(overrides: Partial<ErpNormalizedFact> = {}): ErpNormalizedFact {
  return {
    source: "ERP",
    companyId: COMPANY_A,
    connectionId: CONN_A,
    externalId: "erp-ab-1",
    factKey: "ebitda_addback.restructuring_charges",
    asOf: "2026-06-30",
    periodStart: "2026-04-01",
    periodEnd: "2026-06-30",
    amount: 12.5,
    currency: "USD",
    addbackCategory: "Restructuring charges",
    ...overrides,
  };
}

describe("recordErpAddbackEvidence", () => {
  it("creates an UNCONFIRMED evidence item with full provenance — and it touches no computation", async () => {
    const db = seededDb();
    const applied = await applyErpBasketTransaction(db, COMPANY_A, dividendFact());
    expect(applied.disposition).toBe("APPLIED");
    const ledgerBefore = db.ledger.length;

    const result = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact());
    expect(result.disposition).toBe("EVIDENCE_RECORDED");
    expect(result.ledgerEntryId).toBeNull();

    const evidence = await listErpAddbackEvidence(db, COMPANY_A);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      addbackCategory: "Restructuring charges",
      amount: 12.5,
      currency: "USD",
      status: "UNCONFIRMED",
      reviewStatus: "UNVERIFIED",
      provenance: { source: "ERP", connectionId: CONN_A, externalId: "erp-ab-1", factKey: "ebitda_addback.restructuring_charges" },
    });

    // Excluded from every computed total: no ledger row was written, and
    // the engine's dataset is byte-identical to before the evidence.
    expect(db.ledger).toHaveLength(ledgerBefore);
    const data = await loadCompanyCovenantData(db as any, COMPANY_A, new Date("2026-07-20T00:00:00Z"));
    expect(data.financials.ebitda).toBe(300);
    expect(data.ledger).toEqual([{ basket: "DIVIDEND", amount: 25, direction: "DEBIT" }]);
  });

  it("evidence intake needs no covenant state at all — an unmodeled company still gets its evidence queue", async () => {
    const db = new FakeDb();
    db.connections.push({ id: CONN_A, companyId: COMPANY_A });
    const result = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact());
    expect(result.disposition).toBe("EVIDENCE_RECORDED");
    expect(await listErpAddbackEvidence(db, COMPANY_A)).toHaveLength(1);
  });

  it("evidence re-delivery is idempotent, and a changed amount is a CONFLICT, not a silent edit", async () => {
    const db = seededDb();
    await recordErpAddbackEvidence(db, COMPANY_A, addbackFact());
    const dup = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact());
    expect(dup.duplicate).toBe(true);
    expect(await listErpAddbackEvidence(db, COMPANY_A)).toHaveLength(1);

    const conflict = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact({ amount: 99 }));
    expect(conflict.disposition).toBe("CONFLICT");
    const evidence = await listErpAddbackEvidence(db, COMPANY_A);
    expect(evidence).toHaveLength(0); // the disputed item leaves the clean queue and surfaces as CONFLICT
    expect(await listErpFactApplications(db, COMPANY_A, "CONFLICT")).toHaveLength(1);
  });

  it("refuses evidence with no add-back category and evidence from another company's connection", async () => {
    const db = seededDb();
    const noCategory = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact({ addbackCategory: undefined, externalId: "ab-x" }));
    expect(noCategory.disposition).toBe("REJECTED");

    const foreign = await recordErpAddbackEvidence(db, COMPANY_A, addbackFact({ companyId: COMPANY_B, externalId: "ab-y" }));
    expect(foreign.disposition).toBe("REJECTED");
    expect(await listErpAddbackEvidence(db, COMPANY_A)).toHaveLength(0);
    expect(await listErpAddbackEvidence(db, COMPANY_B)).toHaveLength(0);
  });
});
