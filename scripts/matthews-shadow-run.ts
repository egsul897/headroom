/**
 * Matthews International (MATW) — shadow-run / live-solver-path verification.
 *
 * Mirrors scripts/coherent-shadow-run.ts's pattern: drives Matthews' real
 * financial state through the SAME live application path
 * (`simulateDebtIncurrence` with `solverContext` — the same function
 * app/simulate/SimulateClient.tsx calls) that Coherent uses, proving the
 * generalized solver actually works for a second, structurally different
 * company. Unlike Coherent, Matthews has ZERO legacy CovenantProvision rows
 * (going solver-native from the start — see
 * scripts/populate-matthews-solver-native.ts's header), so there is no
 * legacy-vs-solver-native comparison to make here; this script instead
 * confirms routing (LEGACY/NOT_TESTED/SOLVER_NATIVE) for every declared
 * scope and reports the actual computed capacity figures this task's golden
 * questions cite.
 *
 * Read-only. Run: npx tsx scripts/matthews-shadow-run.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  computeCovenantPosition,
  loadCompanyCovenantData,
  loadCompanySolverStaticData,
  simulateDebtIncurrence,
  type CompanyCovenantData,
  type CovenantPosition,
  type SolverNativeCompanyContext,
} from "../lib/covenant-engine";

const prisma = new PrismaClient();
const COMPANY_ID = "matthews";
const IND_ID = "matw-2027-second-lien-notes-indenture";
const CA_ID = "matw-credit-agreement-2020";
const AS_OF = new Date("2024-12-31");

function money(n: number | undefined | null): string {
  if (n === undefined || n === null) return "n/a";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
}

async function main() {
  console.log("=".repeat(100));
  console.log("HEADROOM — MATTHEWS INTERNATIONAL (MATW) SHADOW-RUN VERIFICATION");
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
    incurringEntity: { id: "matw-borrower", name: "Matthews International Corporation (Borrower)" },
    guarantorStatus: "GUARANTOR",
    collateralPools: [],
    requestedLienPriority: [],
  };

  console.log(`\nStatic solver-native rows loaded: ${staticData.permissions.length} permissions, ${staticData.relationships.length} relationships, ${staticData.sharedConstraints.length} shared constraints, ${staticData.coverageDeclarations.length} coverage declarations.`);
  console.log(`Financials as of ${AS_OF.toISOString().slice(0, 10)}: EBITDA=${money(data.financials.ebitda)} cash=${money(data.financials.cash)} totalDebt=${money(data.financials.totalDebt)} securedDebt=${money(data.financials.securedDebt)} interestExpense=${money(data.financials.interestExpense)}\n`);

  // ---------------------------------------------------------------------
  // Routing confirmation
  // ---------------------------------------------------------------------
  console.log("-".repeat(100));
  console.log("ROUTING CONFIRMATION (live, via simulateDebtIncurrence + solverContext)");
  console.log("-".repeat(100));
  const probeSecured = simulateDebtIncurrence(data, position, 1, true, solverContext);
  const probeUnsecured = simulateDebtIncurrence(data, position, 1, false, solverContext);
  for (const [label, sim, docId] of [
    ["Indenture / secured / debt+lien", probeSecured, IND_ID],
    ["Indenture / unsecured / debt", probeUnsecured, IND_ID],
    ["Credit Agreement / secured / debt+lien", probeSecured, CA_ID],
    ["Credit Agreement / unsecured / debt", probeUnsecured, CA_ID],
  ] as const) {
    const perDoc = sim.perDocument.find((d) => d.documentId === docId);
    console.log(`  ${label.padEnd(42)} -> ${perDoc?.solverCoverage?.status ?? "n/a"}   (${perDoc?.solverCoverage?.reason?.slice(0, 110) ?? ""})`);
  }
  console.log(
    "\nExpected: Indenture secured/unsecured -> SOLVER_NATIVE (declared+MODELED). Credit Agreement secured -> SOLVER_NATIVE for the LIEN side " +
      "(only §6.01(j) exists) but the document/side is reported through DEBT_INCURRENCE coverage, which has no declaration for the CA at all " +
      "(no debt-incurrence covenant exists in the CA — see populate script header item 1) -> expect NOT_TESTED/LEGACY-fallback for CA scopes.\n"
  );

  // ---------------------------------------------------------------------
  // Maximum capacity per document/side
  // ---------------------------------------------------------------------
  console.log("-".repeat(100));
  console.log("MAXIMUM ADDITIONAL CAPACITY");
  console.log("-".repeat(100));
  for (const [label, sim, docId] of [
    ["Indenture, secured", probeSecured, IND_ID],
    ["Indenture, unsecured", probeUnsecured, IND_ID],
  ] as const) {
    const perDoc = sim.perDocument.find((d) => d.documentId === docId);
    const mc = perDoc?.solverResult?.overall.maximumCapacity;
    console.log(`  ${label.padEnd(28)} solver-native status=${perDoc?.status ?? "n/a"}   maxCapacity=${mc?.kind === "EXACT" ? money(mc.amount) : mc?.kind ?? "n/a"}`);
  }

  // ---------------------------------------------------------------------
  // Fixed scenario matrix
  // ---------------------------------------------------------------------
  console.log("\n" + "-".repeat(100));
  console.log("SCENARIO MATRIX");
  console.log("-".repeat(100));

  function run(id: string, description: string, amount: number, secured: boolean) {
    const solver = simulateDebtIncurrence(data, position, amount, secured, solverContext);
    const indDoc = solver.perDocument.find((d) => d.documentId === IND_ID);
    const caDoc = solver.perDocument.find((d) => d.documentId === CA_ID);
    const pathUsed = indDoc?.solverResult?.permissionPathUsed;
    console.log(`\n[${id}] ${description}  (amount=${money(amount)} secured=${secured})`);
    console.log(`    overall=${solver.status}`);
    console.log(`    Indenture: status=${indDoc?.status ?? "n/a"} coverage=${indDoc?.solverCoverage?.status ?? "n/a"} path=${pathUsed?.legs.map((l) => l.permissionId).join(" + ") ?? "n/a"}`);
    console.log(`    Credit Agreement: status=${caDoc?.status ?? "n/a"} coverage=${caDoc?.solverCoverage?.status ?? "n/a"}`);
    return solver;
  }

  run("A", "$50M secured — well inside flat cl.(1)(a) headroom", 50, true);
  run("B", "$500M secured — near the reconstructed Secured Net Leverage ratio limit", 500, true);
  run("C", "$1,000M secured — should BLOCK (exceeds reconstructed capacity)", 1000, true);
  run("D", "$50M unsecured — Ratio Debt (FCCR-gated) path", 50, false);
  run("E", "$500M unsecured", 500, false);

  // Binary-search the Indenture secured maximum for golden-test expectedAnswer values
  console.log("\n" + "-".repeat(100));
  console.log("BINARY SEARCH — Indenture secured maximum (for golden-test expectedAnswer)");
  console.log("-".repeat(100));
  let lo = 0;
  let hi = 2000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const sim = simulateDebtIncurrence(data, position, mid, true, solverContext);
    const indStatus = sim.perDocument.find((d) => d.documentId === IND_ID)?.status;
    if (indStatus === "clear") lo = mid;
    else hi = mid;
  }
  console.log(`Indenture secured maximum (binary-search converged): ${money(lo)}`);

  console.log("\nBINARY SEARCH — Indenture unsecured maximum");
  let lo2 = 0;
  let hi2 = 5000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo2 + hi2) / 2;
    const sim = simulateDebtIncurrence(data, position, mid, false, solverContext);
    const indStatus = sim.perDocument.find((d) => d.documentId === IND_ID)?.status;
    if (indStatus === "clear") lo2 = mid;
    else hi2 = mid;
  }
  console.log(`Indenture unsecured maximum (binary-search converged): ${money(lo2)}`);

  await prisma.$disconnect();

  console.log("\n" + "=".repeat(100));
  console.log("END OF SHADOW RUN. PROVISIONAL — ENGINEERING-VERIFIED ONLY.");
  console.log("=".repeat(100));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
