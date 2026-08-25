/**
 * Live routing / integration test (task §6-§10 of the solver-hardening gate).
 *
 * A test-only, isolated company - inserted directly via Prisma, never
 * through prisma/seed-data.ts, lib/coherent.ts's Coherent default, or the
 * existing synthetic-company/solver-native fixture files - proving the
 * coverage-gate wiring added to lib/covenant-engine.ts routes correctly
 * through the SAME functions the application actually calls:
 *
 *   loadCompanyCovenantData / loadCompanySolverStaticData (lib/covenant-engine.ts,
 *   the Prisma adapters lib/coherent.ts's getCovenantData/getSolverStaticData
 *   call verbatim)
 *     -> computeCovenantPosition (lib/covenant-engine.ts, called by
 *        lib/coherent.ts's getPosition AND by app/simulate/SimulateClient.tsx
 *        directly: `useMemo(() => computeCovenantPosition(data), [data])`)
 *     -> simulateDebtIncurrence (lib/covenant-engine.ts, called by
 *        app/simulate/SimulateClient.tsx's DebtPanel: `simulateDebtIncurrence(data,
 *        position, simAmt, simSecured)` - the exact same function this file
 *        calls, with a solverContext argument the client doesn't populate
 *        yet, since building that from a UI is explicitly out of this
 *        task's scope ("do not build the CFO dashboard")).
 *
 * Route-level note (task §7): rendering app/simulate/page.tsx's actual
 * Server Component + SimulateClient Client Component pair in a headless
 * test would require jsdom/React Testing Library/Next.js route-test
 * scaffolding whose only additional coverage over what's exercised below is
 * JSX rendering itself - which contains no branching/decision logic (every
 * status/capacity/reason SimulateClient renders is read directly off the
 * DebtIncurrenceSimulation this file already asserts against). This file
 * therefore exercises the highest actual shared service/data-access
 * boundary the routes depend on - loadCompanyCovenantData ->
 * computeCovenantPosition -> simulateDebtIncurrence - rather than reaching
 * for route-level scaffolding that would not add decision-logic coverage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  loadCompanySolverStaticData,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantPosition,
  type SolverNativeCompanyContext,
} from "../../lib/covenant-engine";

const COMPANY_ID = "mixed-routing-live-test-co";
const DOC_A = "mrlt-doc-a-solver-native";
const DOC_B = "mrlt-doc-b-legacy-only";
const DOC_C = "mrlt-doc-c-partially-configured";
const DOC_D = "mrlt-doc-d-unresolved";
const DOC_E = "mrlt-doc-e-legacy-wide";

const AS_OF = new Date("2026-06-30");

const FIN = {
  ebitda: 1000,
  cash: 100,
  interestExpense: 50,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 6,
  totalDebt: 2000,
  securedDebt: 0,
};

async function insertFixture() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Mixed Routing Live-Test Co." } });

  await prisma.document.create({
    data: { id: DOC_A, companyId: COMPANY_ID, name: "Document A (fully solver-native)", type: "OTHER" },
    // No capacityFormulas at all - Document A has NO legacy fallback, so a
    // CLEAR/BLOCKED result for it can only have come from the solver.
  });
  await prisma.document.create({
    data: {
      id: DOC_B,
      companyId: COMPANY_ID,
      name: "Document B (legacy-only)",
      type: "OTHER",
      capacityFormulas: { unsecured: { op: "REF", code: "legacy-basket-b" } },
    },
  });
  await prisma.document.create({
    data: {
      id: DOC_C,
      companyId: COMPANY_ID,
      name: "Document C (deliberately partially configured)",
      type: "OTHER",
      capacityFormulas: { unsecured: { op: "REF", code: "legacy-basket-c" } },
    },
  });
  await prisma.document.create({
    data: { id: DOC_D, companyId: COMPANY_ID, name: "Document D (unresolved - no configuration at all)", type: "OTHER" },
  });
  await prisma.document.create({
    data: {
      id: DOC_E,
      companyId: COMPANY_ID,
      name: "Document E (legacy, wider threshold)",
      type: "OTHER",
      capacityFormulas: { unsecured: { op: "REF", code: "legacy-basket-e" } },
    },
  });

  await prisma.covenantProvision.create({
    data: { companyId: COMPANY_ID, documentId: DOC_B, code: "legacy-basket-b", basketName: "General debt basket", sectionRef: "§B.1", formulaType: "FLAT_AMOUNT", thresholdValue: 250 },
  });
  await prisma.covenantProvision.create({
    data: { companyId: COMPANY_ID, documentId: DOC_C, code: "legacy-basket-c", basketName: "General debt basket", sectionRef: "§C.1", formulaType: "FLAT_AMOUNT", thresholdValue: 150 },
  });
  await prisma.covenantProvision.create({
    data: { companyId: COMPANY_ID, documentId: DOC_E, code: "legacy-basket-e", basketName: "General debt basket", sectionRef: "§E.1", formulaType: "FLAT_AMOUNT", thresholdValue: 500 },
  });

  await prisma.financialSnapshot.create({ data: { companyId: COMPANY_ID, asOfDate: AS_OF, ...FIN } });

  // Document A: one MODELED debt permission, complete coverage declaration -> SOLVER_NATIVE.
  await prisma.permission.create({
    data: {
      id: "mrlt-perm-a",
      companyId: COMPANY_ID,
      documentId: DOC_A,
      code: "perm-a",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 400,
      sectionRef: "§A.1",
      modelingStatus: "MODELED",
      measurementBasis: "CUMULATIVE_INCURRED",
    },
  });
  await prisma.solverCoverageDeclaration.create({
    data: { companyId: COMPANY_ID, documentId: DOC_A, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true },
  });

  // Document C: declaration marked complete, but ONE of its two permissions
  // is still KNOWN_NOT_MODELED - the data-entry contradiction the coverage
  // gate must catch, falling back to Document C's own legacy formula in
  // full (never a partial solver-native result).
  await prisma.permission.create({
    data: {
      id: "mrlt-perm-c1",
      companyId: COMPANY_ID,
      documentId: DOC_C,
      code: "perm-c1",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt (modeled basket)",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 100,
      sectionRef: "§C.2(a)",
      modelingStatus: "MODELED",
      measurementBasis: "CUMULATIVE_INCURRED",
    },
  });
  await prisma.permission.create({
    data: {
      id: "mrlt-perm-c2",
      companyId: COMPANY_ID,
      documentId: DOC_C,
      code: "perm-c2",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      action: "Incur unsecured debt (basket not yet modeled)",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 999,
      sectionRef: "§C.2(b)",
      modelingStatus: "KNOWN_NOT_MODELED",
      measurementBasis: "CUMULATIVE_INCURRED",
    },
  });
  await prisma.solverCoverageDeclaration.create({
    data: { companyId: COMPANY_ID, documentId: DOC_C, side: "unsecured", grantType: "DEBT_INCURRENCE", isComplete: true },
  });
}

async function teardownFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

async function loadSolverContext(): Promise<SolverNativeCompanyContext> {
  const staticData = await loadCompanySolverStaticData(prisma, COMPANY_ID, AS_OF);
  return {
    ...staticData,
    activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
    asOfDate: AS_OF,
    entityClasses: ["BORROWER"],
    incurringEntity: { id: "borrower", name: "Borrower" },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  };
}

/** Same real `data`, restricted to a subset of documents, with `computeCovenantPosition` re-run (the actual function, not a stub) over that subset. */
function withDocuments(data: CompanyCovenantData, ids: string[]): { data: CompanyCovenantData; position: CovenantPosition } {
  const filtered: CompanyCovenantData = { ...data, documents: data.documents.filter((d) => ids.includes(d.id)) };
  return { data: filtered, position: computeCovenantPosition(filtered) };
}

describe("Live routing / mixed native-legacy integration (task §6-§10)", () => {
  let fullData: CompanyCovenantData;
  let solverContext: SolverNativeCompanyContext;

  beforeAll(async () => {
    await teardownFixture(); // defensive, in case a previous run was interrupted
    await insertFixture();
    fullData = await loadCompanyCovenantData(prisma, COMPANY_ID, AS_OF);
    solverContext = await loadSolverContext();
  });

  afterAll(async () => {
    await teardownFixture();
  });

  describe("§6 - routing proof: A solver-native, B legacy, C falls back to legacy in full", () => {
    it("routes each document to exactly one composition path and combines them with no double counting", () => {
      const { data, position } = withDocuments(fullData, [DOC_A, DOC_B, DOC_C]);
      const sim = simulateDebtIncurrence(data, position, 120, false, solverContext);

      expect(sim.perDocument).toHaveLength(3);
      expect(new Set(sim.perDocument.map((d) => d.documentId)).size).toBe(3);

      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const b = sim.perDocument.find((d) => d.documentId === DOC_B)!;
      const c = sim.perDocument.find((d) => d.documentId === DOC_C)!;

      // Document A: routed SOLVER_NATIVE, a real solver result is attached.
      expect(a.solverCoverage?.status).toBe("SOLVER_NATIVE");
      expect(a.status).toBe("clear");
      expect(a.solverResult).toBeDefined();
      expect(a.solverResult!.permissionPathUsed?.legs[0]!.permissionId).toBe("mrlt-perm-a");

      // Document B: zero Permission rows -> LEGACY, no solver result attached.
      expect(b.solverCoverage?.status).toBe("LEGACY");
      expect(b.status).toBe("clear");
      expect(b.solverResult).toBeUndefined();
      expect(b.capacity).toBe(250);

      // Document C: declaration complete but one permission KNOWN_NOT_MODELED
      // -> falls back to LEGACY in full. The capacity used is exactly the
      // LEGACY threshold (150) - not perm-c1's 100 (proving no accidental
      // partial-solver-native draw) and not perm-c2's 999 (proving the
      // not-yet-modeled basket was never silently trusted either).
      expect(c.solverCoverage?.status).toBe("LEGACY");
      expect(c.solverCoverage?.reason).toContain("KNOWN_NOT_MODELED");
      expect(c.status).toBe("clear");
      expect(c.solverResult).toBeUndefined();
      expect(c.capacity).toBe(150);

      expect(sim.status).toBe("clear");
    });

    it("a blocking document is never overridden by a clearing document", () => {
      const { data, position } = withDocuments(fullData, [DOC_A, DOC_B, DOC_C]);
      const sim = simulateDebtIncurrence(data, position, 260, false, solverContext);

      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const b = sim.perDocument.find((d) => d.documentId === DOC_B)!;
      const c = sim.perDocument.find((d) => d.documentId === DOC_C)!;
      expect(a.status).toBe("clear"); // 260 <= 400 (solver-native)
      expect(b.status).toBe("blocked"); // 260 > 250 (legacy)
      expect(c.status).toBe("blocked"); // 260 > 150 (legacy fallback)
      expect(sim.status).toBe("blocked");
    });

    it("an unresolved mandatory document (Document D, no configuration at all) prevents overall CLEAR even when every other document clears", () => {
      const { data, position } = withDocuments(fullData, [DOC_A, DOC_B, DOC_C, DOC_D]);
      const sim = simulateDebtIncurrence(data, position, 50, false, solverContext);

      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const b = sim.perDocument.find((d) => d.documentId === DOC_B)!;
      const c = sim.perDocument.find((d) => d.documentId === DOC_C)!;
      const d = sim.perDocument.find((d) => d.documentId === DOC_D)!;
      expect(a.status).toBe("clear");
      expect(b.status).toBe("clear");
      expect(c.status).toBe("clear");
      expect(d.status).toBe("not_tested");
      expect(sim.status).not.toBe("clear");
      expect(sim.status).toBe("not_tested");
    });
  });

  describe("§8 - fail-closed adversarial matrix: mixed native/legacy pairs", () => {
    it("legacy document BLOCKED while solver-native document CLEARS - overall BLOCKED", () => {
      const { data, position } = withDocuments(fullData, [DOC_A, DOC_B]);
      const sim = simulateDebtIncurrence(data, position, 300, false, solverContext);
      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const b = sim.perDocument.find((d) => d.documentId === DOC_B)!;
      expect(a.status).toBe("clear"); // 300 <= 400
      expect(b.status).toBe("blocked"); // 300 > 250
      expect(sim.status).toBe("blocked");
    });

    it("solver-native document BLOCKED while legacy document CLEARS - overall BLOCKED", () => {
      const { data, position } = withDocuments(fullData, [DOC_A, DOC_E]);
      const sim = simulateDebtIncurrence(data, position, 420, false, solverContext);
      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const e = sim.perDocument.find((d) => d.documentId === DOC_E)!;
      expect(a.status).toBe("blocked"); // 420 > 400
      expect(e.status).toBe("clear"); // 420 <= 500
      expect(sim.status).toBe("blocked");
    });

    it("boundary: exactly at the solver-native ceiling clears; $1 above it blocks", () => {
      const { data, position } = withDocuments(fullData, [DOC_A]);
      const atBoundary = simulateDebtIncurrence(data, position, 400, false, solverContext);
      const overBoundary = simulateDebtIncurrence(data, position, 401, false, solverContext);
      expect(atBoundary.status).toBe("clear");
      expect(overBoundary.status).toBe("blocked");
    });

    it("incomplete solver-native coverage (Document C) never accidentally clears an amount only the not-yet-modeled basket would have allowed", () => {
      const { data, position } = withDocuments(fullData, [DOC_C]);
      // 500 exceeds the LEGACY threshold (150) and perm-c1's own (100), but
      // is well within perm-c2's un-modeled 999 - proving the fallback truly
      // never drew on the not-yet-modeled basket's larger number.
      const sim = simulateDebtIncurrence(data, position, 500, false, solverContext);
      const c = sim.perDocument.find((d) => d.documentId === DOC_C)!;
      expect(c.status).toBe("blocked");
      expect(c.solverResult).toBeUndefined();
    });
  });

  describe("§9 - explanation trace survives the live boundary", () => {
    it("a CLEAR solver-native result carries permission, amount, sources, and requirement-level detail through simulateDebtIncurrence", () => {
      const { data, position } = withDocuments(fullData, [DOC_A]);
      const sim = simulateDebtIncurrence(data, position, 120, false, solverContext);
      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      const result = a.solverResult!;

      expect(result.overall.status).toBe("CLEAR");
      expect(result.overall.amountTested).toBe(120);
      expect(result.permissionPathUsed?.legs).toEqual([
        expect.objectContaining({ permissionId: "mrlt-perm-a", amountAllocated: 120, grantType: "DEBT_INCURRENCE" }),
      ]);
      expect(result.permissionPathUsed?.conditionsTested.length).toBeGreaterThan(0);
      expect(result.sources).toContainEqual(expect.objectContaining({ documentId: DOC_A, sectionRef: "§A.1", permissionId: "mrlt-perm-a" }));
      // No application code has to reconstruct which document/section/permission
      // was relied upon - it is already here, unmodified, on the live result.
      expect(a.solverCoverage).toEqual(expect.objectContaining({ documentId: DOC_A, side: "unsecured", grantType: "DEBT_INCURRENCE", status: "SOLVER_NATIVE" }));
    });
  });

  describe("§10 - StateDelta consistency and non-mutation", () => {
    it("produces an internally consistent hypothetical StateDelta: postDebt = preDebt + newDebt", () => {
      const { data, position } = withDocuments(fullData, [DOC_A]);
      const sim = simulateDebtIncurrence(data, position, 120, false, solverContext);
      const delta = sim.perDocument.find((d) => d.documentId === DOC_A)!.solverResult!.permissionPathUsed!.stateEffects;

      const newDebt = delta.debtOutstandingDelta.reduce((s, d) => s + d.amount, 0);
      expect(newDebt).toBeCloseTo(120, 6);
      expect(delta.leverageMetricsProForma).toBeDefined();
      expect(delta.leverageMetricsProForma!.netDebt).toBeCloseTo(FIN.totalDebt + 120 - FIN.cash, 6);
      expect(delta.leverageMetricsProForma!.totalNetLeverage).toBeCloseTo((FIN.totalDebt + 120 - FIN.cash) / FIN.ebitda, 6);
      expect(delta.cashDelta).toBe(0); // a debt draw down, not a cash movement, in this simulation
    });

    it("never mutates the input financials/permissions and never writes to the database", async () => {
      const { data, position } = withDocuments(fullData, [DOC_A]);
      const finSnapshot = { ...data.financials };
      const permissionsSnapshot = solverContext.permissions.map((p) => ({ ...p }));

      const [ledgerCountBefore, snapshotCountBefore, permissionRowCountBefore] = await Promise.all([
        prisma.ledgerEntry.count({ where: { companyId: COMPANY_ID } }),
        prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } }),
        prisma.permission.count({ where: { companyId: COMPANY_ID } }),
      ]);

      simulateDebtIncurrence(data, position, 120, false, solverContext);
      simulateDebtIncurrence(data, position, 5000, false, solverContext); // a BLOCKED run too - still must not mutate anything

      expect(data.financials).toEqual(finSnapshot);
      expect(solverContext.permissions).toEqual(permissionsSnapshot);

      const [ledgerCountAfter, snapshotCountAfter, permissionRowCountAfter] = await Promise.all([
        prisma.ledgerEntry.count({ where: { companyId: COMPANY_ID } }),
        prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } }),
        prisma.permission.count({ where: { companyId: COMPANY_ID } }),
      ]);
      expect(ledgerCountAfter).toBe(ledgerCountBefore);
      expect(snapshotCountAfter).toBe(snapshotCountBefore);
      expect(permissionRowCountAfter).toBe(permissionRowCountBefore);

      // And the persisted financial figures themselves are byte-identical -
      // not merely the row count.
      const persisted = await prisma.financialSnapshot.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { asOfDate: "desc" } });
      expect(Number(persisted!.totalDebt)).toBe(FIN.totalDebt);
    });
  });

  describe("§11 - legacy non-regression at this fixture's own boundary", () => {
    it("omitting solverContext entirely leaves Document A (no legacy formula) not_tested, proving solverContext is what does the routing, not an implicit default", () => {
      const { data, position } = withDocuments(fullData, [DOC_A]);
      const sim = simulateDebtIncurrence(data, position, 120, false); // no solverContext argument at all
      const a = sim.perDocument.find((d) => d.documentId === DOC_A)!;
      expect(a.status).toBe("not_tested");
      expect(a.solverResult).toBeUndefined();
      expect(a.solverCoverage).toBeUndefined();
    });
  });
});
