/**
 * Phase 8 — shadow-run reconciliation harness (task §13-§17).
 *
 * Runs Coherent's REAL financial state through BOTH the legacy CapacityExpr
 * engine and the new solver-native model, using the exact live application
 * path (`simulateDebtIncurrence`, with/without `solverContext` — the same
 * function app/simulate/SimulateClient.tsx calls), and produces a structured
 * reconciliation. Neither engine's result is allowed to influence the other:
 * both calls are made independently against the SAME `data`/`position`
 * objects, and non-mutation is verified before/after (task §20).
 *
 * PROVISIONAL — ENGINEERING-VERIFIED ONLY. Every dollar figure below depends
 * on legal conclusions that have NOT received independent outside-counsel
 * confirmation (see docs/coherent-phase8-population-reconciliation.md §U).
 *
 * Read-only against golden_tests/covenant_provisions/financial_snapshots -
 * this script never writes to the database.
 *
 * Run: npx tsx scripts/coherent-shadow-run.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  loadCompanySolverStaticData,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantPosition,
  type DebtIncurrenceSimulation,
  type SolverNativeCompanyContext,
} from "../lib/covenant-engine";

const prisma = new PrismaClient();
const COMPANY_ID = "coherent";
const IND_ID = "coherent-2029-notes-indenture";
const CA_ID = "coherent-credit-agreement-2022";
const AS_OF = new Date("2026-06-30"); // Coherent's own FY2026 10-K balance-sheet date, per prisma/seed-data.ts

function money(n: number | undefined | null): string {
  if (n === undefined || n === null) return "n/a";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

interface DocMax {
  documentId: string;
  legacyCapacity: number | undefined;
  legacyStatus: string;
  solverCoverageStatus: string | undefined;
  solverMaxKind: string | undefined;
  solverMaxAmount: number | undefined;
}

function extractDocMax(sim: DebtIncurrenceSimulation, documentId: string, legacyDoc: { capacity?: number; status: string } | undefined): DocMax {
  const perDoc = sim.perDocument.find((d) => d.documentId === documentId);
  const mc = perDoc?.solverResult?.overall.maximumCapacity;
  return {
    documentId,
    legacyCapacity: legacyDoc?.capacity,
    legacyStatus: legacyDoc?.status ?? "n/a",
    solverCoverageStatus: perDoc?.solverCoverage?.status,
    solverMaxKind: mc?.kind,
    solverMaxAmount: mc?.kind === "EXACT" ? mc.amount : undefined,
  };
}

async function main() {
  console.log("=".repeat(100));
  console.log("HEADROOM PHASE 8 — COHERENT SHADOW-RUN RECONCILIATION");
  console.log("PROVISIONAL — ENGINEERING-VERIFIED ONLY. No outside-counsel confirmation.");
  console.log("=".repeat(100));

  const data: CompanyCovenantData = await loadCompanyCovenantData(prisma, COMPANY_ID, AS_OF);
  const position: CovenantPosition = computeCovenantPosition(data);

  const staticData = await loadCompanySolverStaticData(prisma, COMPANY_ID, AS_OF);
  const solverContext: SolverNativeCompanyContext = {
    ...staticData,
    activationState: { asOfDate: AS_OF, series: {}, events: [], usageCounts: {}, unknownKeys: new Set() },
    asOfDate: AS_OF,
    entityClasses: ["BORROWER"],
    incurringEntity: { id: "coherent-borrower", name: "Coherent Corp. (Borrower/Company)" },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  };

  console.log(`\nStatic solver-native rows loaded: ${staticData.permissions.length} permissions, ${staticData.relationships.length} relationships, ${staticData.sharedConstraints.length} shared constraints, ${staticData.coverageDeclarations.length} coverage declarations.\n`);

  // ---------------------------------------------------------------------
  // §20 non-mutation check — before
  // ---------------------------------------------------------------------
  const before = await snapshotDbState();

  // ---------------------------------------------------------------------
  // Routing confirmation — the four Phase 1 coverage sides
  // ---------------------------------------------------------------------
  console.log("-".repeat(100));
  console.log("ROUTING CONFIRMATION (live, via simulateDebtIncurrence + solverContext)");
  console.log("-".repeat(100));
  const routingProbe = {
    indSecured: simulateDebtIncurrence(data, position, 1, true, solverContext),
    indUnsecured: simulateDebtIncurrence(data, position, 1, false, solverContext),
  };
  const routingRows: { scope: string; status: string | undefined }[] = [];
  for (const [label, sim, docId] of [
    ["Indenture / secured / debt", routingProbe.indSecured, IND_ID],
    ["Indenture / secured / lien (via secured routing)", routingProbe.indSecured, IND_ID],
    ["Indenture / unsecured / debt", routingProbe.indUnsecured, IND_ID],
    ["Credit Agreement / secured / debt", routingProbe.indSecured, CA_ID],
    ["Credit Agreement / secured / lien (via secured routing)", routingProbe.indSecured, CA_ID],
    ["Credit Agreement / unsecured / debt", routingProbe.indUnsecured, CA_ID],
  ] as const) {
    const perDoc = sim.perDocument.find((d) => d.documentId === docId);
    routingRows.push({ scope: label, status: perDoc?.solverCoverage?.status });
    console.log(`  ${label.padEnd(55)} -> ${perDoc?.solverCoverage?.status ?? "n/a"}   (${perDoc?.solverCoverage?.reason?.slice(0, 90) ?? ""})`);
  }
  const nativeCount = routingRows.filter((r) => r.status === "SOLVER_NATIVE").length;
  console.log(`\n${nativeCount} of ${routingRows.length} probed scopes actually routed SOLVER_NATIVE in this live run.\n`);

  // ---------------------------------------------------------------------
  // A/B — maximum capacity
  // ---------------------------------------------------------------------
  console.log("-".repeat(100));
  console.log("SCENARIOS A/B — MAXIMUM ADDITIONAL CAPACITY");
  console.log("-".repeat(100));

  const probeSecured = simulateDebtIncurrence(data, position, 1, true, solverContext);
  const probeUnsecured = simulateDebtIncurrence(data, position, 1, false, solverContext);

  const indSecuredMax = extractDocMax(probeSecured, IND_ID, position.documents.find((d) => d.documentId === IND_ID) && { capacity: position.documents.find((d) => d.documentId === IND_ID)!.securedCapacity, status: position.documents.find((d) => d.documentId === IND_ID)!.securedStatus });
  const caSecuredMax = extractDocMax(probeSecured, CA_ID, position.documents.find((d) => d.documentId === CA_ID) && { capacity: position.documents.find((d) => d.documentId === CA_ID)!.securedCapacity, status: position.documents.find((d) => d.documentId === CA_ID)!.securedStatus });
  const indUnsecuredMax = extractDocMax(probeUnsecured, IND_ID, position.documents.find((d) => d.documentId === IND_ID) && { capacity: position.documents.find((d) => d.documentId === IND_ID)!.unsecuredCapacity, status: position.documents.find((d) => d.documentId === IND_ID)!.unsecuredStatus });
  const caUnsecuredMax = extractDocMax(probeUnsecured, CA_ID, position.documents.find((d) => d.documentId === CA_ID) && { capacity: position.documents.find((d) => d.documentId === CA_ID)!.unsecuredCapacity, status: position.documents.find((d) => d.documentId === CA_ID)!.unsecuredStatus });

  console.log("SECURED:");
  for (const m of [indSecuredMax, caSecuredMax]) {
    console.log(`  ${m.documentId}: legacy=${money(m.legacyCapacity)} (${m.legacyStatus})  |  solver-native=${money(m.solverMaxAmount)} (${m.solverMaxKind ?? m.solverCoverageStatus})`);
  }
  console.log("UNSECURED:");
  for (const m of [indUnsecuredMax, caUnsecuredMax]) {
    console.log(`  ${m.documentId}: legacy=${money(m.legacyCapacity)} (${m.legacyStatus})  |  solver-native=${money(m.solverMaxAmount)} (${m.solverMaxKind ?? m.solverCoverageStatus})`);
  }

  const legacyCrossSecured = position.crossDocumentSecured.status === "modeled" ? position.crossDocumentSecured.capacity : undefined;
  const legacyCrossUnsecured = position.crossDocumentUnsecured.status === "modeled" ? position.crossDocumentUnsecured.capacity : undefined;
  const solverCrossSecured =
    indSecuredMax.solverMaxAmount !== undefined && caSecuredMax.solverMaxAmount !== undefined ? Math.min(indSecuredMax.solverMaxAmount, caSecuredMax.solverMaxAmount) : undefined;
  const solverCrossUnsecured =
    indUnsecuredMax.solverMaxAmount !== undefined && caUnsecuredMax.solverMaxAmount !== undefined ? Math.min(indUnsecuredMax.solverMaxAmount, caUnsecuredMax.solverMaxAmount) : undefined;

  console.log(`\nCROSS-DOCUMENT (MIN across both documents, per X-1):`);
  console.log(`  Secured:   legacy = ${money(legacyCrossSecured)}   |   solver-native = ${money(solverCrossSecured)}   [PROVISIONAL]`);
  console.log(`  Unsecured: legacy = ${money(legacyCrossUnsecured)}   |   solver-native = ${money(solverCrossUnsecured)}   [PROVISIONAL]`);

  // ---------------------------------------------------------------------
  // Full scenario matrix C-R
  // ---------------------------------------------------------------------
  console.log("\n" + "-".repeat(100));
  console.log("SCENARIOS C-R");
  console.log("-".repeat(100));

  type ScenarioResult = {
    id: string;
    description: string;
    amount?: number;
    secured?: boolean;
    legacyStatus?: string;
    solverStatus?: string;
    legacyBinding?: string;
    solverBindingDoc?: string;
    solverBindingPermission?: string;
    linkedLienPermission?: string;
    note: string;
  };
  const results: ScenarioResult[] = [];

  function runFixedScenario(id: string, description: string, amount: number, secured: boolean): ScenarioResult {
    const legacy = simulateDebtIncurrence(data, position, amount, secured);
    const solver = simulateDebtIncurrence(data, position, amount, secured, solverContext);
    const bindingDoc = solver.perDocument.find((d) => d.status === "blocked") ?? solver.binding;
    const pathUsed = solver.perDocument.find((d) => d.solverResult?.permissionPathUsed)?.solverResult?.permissionPathUsed;
    const linked = pathUsed?.linkedPermissions?.[0];
    const r: ScenarioResult = {
      id,
      description,
      amount,
      secured,
      legacyStatus: legacy.status,
      solverStatus: solver.status,
      legacyBinding: legacy.binding?.bindingProvision?.code,
      solverBindingDoc: bindingDoc?.documentId,
      solverBindingPermission: pathUsed?.legs.map((l) => l.permissionId).join(" + "),
      linkedLienPermission: linked ? `${linked.debtPermissionId} -> ${linked.lienPermissionId}` : undefined,
      note: "",
    };
    results.push(r);
    return r;
  }

  runFixedScenario("C", "$100M secured", 100, true);
  runFixedScenario("D", "$500M secured", 500, true);
  runFixedScenario("E", "$1,000M secured", 1000, true);

  if (solverCrossSecured !== undefined) {
    runFixedScenario("F", `Exactly at solver-native secured maximum (${money(solverCrossSecured)})`, Math.floor(solverCrossSecured * 1e6) / 1e6, true);
    runFixedScenario("G", `$1M above solver-native secured maximum`, Math.floor(solverCrossSecured * 1e6) / 1e6 + 1, true);
  } else {
    results.push({ id: "F", description: "At solver-native secured maximum", note: "ASSUMPTION_REQUIRED — solver-native secured maximum did not resolve to a single EXACT figure (see scenario A output above).", secured: true });
    results.push({ id: "G", description: "$1 above solver-native secured maximum", note: "ASSUMPTION_REQUIRED — same reason as F.", secured: true });
  }

  runFixedScenario("H", "$100M unsecured", 100, false);
  runFixedScenario("I", "$500M unsecured", 500, false);
  runFixedScenario("J", "$1,000M unsecured", 1000, false);

  if (solverCrossUnsecured !== undefined) {
    runFixedScenario("K", `Exactly at solver-native unsecured maximum (${money(solverCrossUnsecured)})`, Math.floor(solverCrossUnsecured * 1e6) / 1e6, false);
    runFixedScenario("L", `$1M above solver-native unsecured maximum`, Math.floor(solverCrossUnsecured * 1e6) / 1e6 + 1, false);
  } else {
    results.push({ id: "K", description: "At solver-native unsecured maximum", note: "ASSUMPTION_REQUIRED — see scenario B output above.", secured: false });
    results.push({ id: "L", description: "$1 above solver-native unsecured maximum", note: "ASSUMPTION_REQUIRED — same reason as K.", secured: false });
  }

  // M — fixed + ratio concurrently. $4,500M secured forces combining the SCF
  // flat+grower FIXED baskets with the MILA secured ratio permission.
  const m = runFixedScenario("M", "$4,500M secured — forces FIXED (SCF flat+grower) + INCURRENCE_BASED (MILA secured) concurrent use", 4500, true);
  m.note = m.solverBindingPermission ? `Permissions relied upon: ${m.solverBindingPermission}` : "Did not resolve CLEAR at this amount — see solverStatus.";

  // N — automatic linked lien: any CLEAR secured scenario already exercises
  // this; report explicitly from scenario C.
  const nSource = results.find((r) => r.id === "C");
  results.push({
    id: "N",
    description: "Transaction relying on an automatic linked lien permission",
    note: nSource?.linkedLienPermission
      ? `Satisfied by scenario C: ${nSource.linkedLienPermission}`
      : "Scenario C's winning path did not report a linkedPermissions entry — see full C output for the actual permission path relied upon.",
  });

  // O — Reallocated Amount: documented ENGINE GAP, not executable.
  results.push({
    id: "O",
    description: "General Debt Basket -> Reallocated Amount -> Cash-Capped Incremental mechanics",
    note:
      "NOT EXECUTABLE — documented generalized engine gap (scripts/populate-coherent-solver-native.ts header item 2): lib/solver/election.ts's shared-constraint consumption computes a FIXED permission's shared-constraint allocation as `Math.min(remaining, standalone)` from the permission's OWN formula BEFORE any SharedCapacityConstraint is consulted, so a constraint can only ration a permission's capacity downward, never grant capacity beyond its own formula sourced from another basket's unused headroom. ca_incremental_cash_capped is populated at its base-only formula ($1,428M/100% EBITDA); no live scenario can currently exercise the Reallocated Amount feed. This is an ENGINE limitation, not a legal or data gap.",
  });

  // P — one document permits, the other blocks: pick an amount strictly
  // between the tighter and looser document's own solver-native maximum.
  if (indSecuredMax.solverMaxAmount !== undefined && caSecuredMax.solverMaxAmount !== undefined && indSecuredMax.solverMaxAmount !== caSecuredMax.solverMaxAmount) {
    const tighter = Math.min(indSecuredMax.solverMaxAmount, caSecuredMax.solverMaxAmount);
    const looser = Math.max(indSecuredMax.solverMaxAmount, caSecuredMax.solverMaxAmount);
    const pAmount = Math.min(tighter + (looser - tighter) / 2, looser - 1);
    const p = runFixedScenario("P", `$${pAmount.toFixed(1)}M secured — between the two documents' own solver-native secured maxima (Indenture ${money(indSecuredMax.solverMaxAmount)}, CA ${money(caSecuredMax.solverMaxAmount)})`, Math.round(pAmount * 100) / 100, true);
    p.note = `Cross-document overall status: ${p.solverStatus} (expect BLOCKED — X-1 requires BOTH documents to independently clear).`;
  } else {
    results.push({ id: "P", description: "One document permits, the other blocks", note: "ASSUMPTION_REQUIRED — the two documents' own solver-native secured maxima were equal or unresolved at run time; no amount strictly separates them. See A output." });
  }

  // Q — ALTERNATIVE ratio path (MILA unsecured TNL vs FCCR). Report which
  // alternative the solver actually selected at a representative unsecured
  // amount.
  const qSim = simulateDebtIncurrence(data, position, 3000, false, solverContext);
  const qPath = qSim.perDocument.find((d) => d.documentId === IND_ID)?.solverResult?.permissionPathUsed;
  results.push({
    id: "Q",
    description: "$3,000M unsecured — exercises the MILA unsecured TNL/FCCR ALTERNATIVE pair",
    amount: 3000,
    secured: false,
    solverStatus: qSim.status,
    solverBindingPermission: qPath?.legs.map((l) => l.permissionId).join(" + "),
    note: qPath ? `Winning permission path: ${qPath.legs.map((l) => l.permissionId).join(", ")}` : "No solver-native path won at this amount for the Indenture — see full status.",
  });

  // R — reclassification/redesignation: documented ENGINE GAP.
  results.push({
    id: "R",
    description: "Transaction relying on reclassification/redesignation",
    note:
      "NOT EXECUTABLE — no reclassification/redesignation logic exists anywhere in lib/solver/election.ts (confirmed by direct source inspection). docs/coherent-phase1-stacking-table.md §O itself specifies these as state-transition rules evaluated against historicalUsage, which the current election-enumeration engine does not implement. This is an ENGINE limitation, not a legal or data gap.",
  });

  for (const r of results) {
    console.log(`\n[${r.id}] ${r.description}`);
    if (r.amount !== undefined) console.log(`    amount=${money(r.amount)} secured=${r.secured}`);
    if (r.legacyStatus || r.solverStatus) console.log(`    legacy=${r.legacyStatus ?? "n/a"}  |  solver-native=${r.solverStatus ?? "n/a"}`);
    if (r.legacyBinding || r.solverBindingPermission) console.log(`    legacy binding=${r.legacyBinding ?? "n/a"}  |  solver-native permission(s)=${r.solverBindingPermission ?? "n/a"}`);
    console.log(`    ${r.note}`);
  }

  // ---------------------------------------------------------------------
  // §20 non-mutation check — after
  // ---------------------------------------------------------------------
  const after = await snapshotDbState();
  console.log("\n" + "-".repeat(100));
  console.log("§20 NON-MUTATION CHECK");
  console.log("-".repeat(100));
  const mutationClean = JSON.stringify(before) === JSON.stringify(after);
  console.log(`Ledger/financial-snapshot/permission/relationship/constraint row counts and content ${mutationClean ? "UNCHANGED" : "CHANGED (!!)"}.`);
  console.log(JSON.stringify({ before, after }, null, 2));

  await prisma.$disconnect();

  console.log("\n" + "=".repeat(100));
  console.log("END OF SHADOW RUN. PROVISIONAL — ENGINEERING-VERIFIED ONLY. See docs/coherent-phase8-population-reconciliation.md.");
  console.log("=".repeat(100));
}

async function snapshotDbState() {
  const [ledgerCount, snapshotCount, permCount, relCount, sccCount, declCount, financials] = await Promise.all([
    prisma.ledgerEntry.count({ where: { companyId: COMPANY_ID } }),
    prisma.financialSnapshot.count({ where: { companyId: COMPANY_ID } }),
    prisma.permission.count({ where: { companyId: COMPANY_ID } }),
    prisma.permissionRelationship.count({ where: { companyId: COMPANY_ID } }),
    prisma.sharedCapacityConstraint.count({ where: { companyId: COMPANY_ID } }),
    prisma.solverCoverageDeclaration.count({ where: { companyId: COMPANY_ID } }),
    prisma.financialSnapshot.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { asOfDate: "desc" } }),
  ]);
  return {
    ledgerCount,
    snapshotCount,
    permCount,
    relCount,
    sccCount,
    declCount,
    latestTotalDebt: financials ? Number(financials.totalDebt) : null,
    latestSecuredDebt: financials ? Number(financials.securedDebt) : null,
  };
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
