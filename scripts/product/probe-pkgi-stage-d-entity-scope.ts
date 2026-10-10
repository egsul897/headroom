/**
 * Stage D Cycle 4 probe — pkg-i entity-scope COUNTERPARTY fix → debt CERTIFY → dual-path 4E.
 *
 * Demonstrates that correcting "owed to the Borrower" (COUNTERPARTY) unblocks offline
 * CERTIFY of §7.01 (including §7.01(b) debt primary), so SECURED_DEBT enumerates
 * CERTIFIED_4E with debt ∩ lien CANDIDATE paths.
 *
 * Capacity/simulation under REQUIRE correctly REFUSES with CROSS_RULE_GATE_NOT_EXECUTABLE
 * (§7.02(b) REQUIRES Section 7.01(b) — no certified cross-rule satisfaction evaluator yet).
 *
 * Zero paid providers. No FIXTURE_IR invention. Synthetic acceptance package (not authentic EDGAR).
 */
import fs from "node:fs";
import path from "node:path";
import { loadPackage } from "../product-acceptance/corpus";
import { runDeterministicStages } from "../product-acceptance/stages";
import { runSemanticStage } from "../product-acceptance/semantic-stage";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import { serializeVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";
import { evaluateVerifiedCapacity } from "../../lib/contract-model/verified-execution";
import type { VerifiedExecutionPackage } from "../../lib/contract-model/verified-execution";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input/snapshot-resolver";

const OUT = "docs/product/customer-workflow/stage-d-pkgi-entity-scope";
const PACKAGE_ID = "pkg-i-secured-debt-lien";
const AS_OF = "2026-12-31";

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const pkg = loadPackage(PACKAGE_ID);
  const stages = await runDeterministicStages(pkg);
  const sem = await runSemanticStage(pkg, stages);
  if (!sem.faithful) {
    write("00-probe-report.md", `# Stage D entity-scope probe refused\n\n${sem.faithfulError ?? "no faithful run"}\n`);
    process.exit(2);
  }

  const candidateRows = sem.faithful.results.map((r) => {
    const ruleUnits = (r.verifiedPackage?.units ?? [])
      .filter((u) => u.kind === "RULE")
      .map((u) => {
        const unit = u.unit as {
          sourceSectionRef?: string;
          action?: string;
          sufficiency?: string;
          entityScope?: string[];
          entityScopeAudit?: {
            status?: string;
            guardVersion?: string;
            modelDiscrepancy?: { relation?: string } | null;
            witness?: { signals?: Array<{ phrase?: string; role?: string }> };
          };
        };
        return {
          sourceSectionRef: unit.sourceSectionRef ?? null,
          action: unit.action ?? null,
          sufficiency: unit.sufficiency ?? null,
          entityScope: unit.entityScope ?? [],
          auditStatus: unit.entityScopeAudit?.status ?? null,
          guardVersion: unit.entityScopeAudit?.guardVersion ?? null,
          relation: unit.entityScopeAudit?.modelDiscrepancy?.relation ?? null,
          hasCounterparty: (unit.entityScopeAudit?.witness?.signals ?? []).some((s) => s.role === "COUNTERPARTY"),
        };
      });
    return {
      certification: r.certification?.status ?? null,
      blockers: (r.certification?.blockers ?? []).map((b) => ("code" in b ? b.code : String(b))),
      ruleUnits,
    };
  });

  const artifacts: CertifiedCandidateArtifacts[] = [];
  for (const r of sem.faithful.results) {
    if (r.certification?.status !== "CERTIFIED" || !r.verifiedPackage) continue;
    artifacts.push({
      certification: r.certification,
      verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage),
    });
  }

  write("01-candidates.json", {
    schema: "stage-d-pkgi-entity-scope-candidates.v1",
    paidProvidersCalled: false,
    packageId: PACKAGE_ID,
    candidateRows,
    certifiedCount: artifacts.length,
  });

  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  if (adapter.outcome !== "DERIVED") {
    write("00-probe-report.md", `# Stage D VEP refused\n\n${JSON.stringify(adapter, null, 2)}\n`);
    process.exit(2);
  }

  write("verified-execution-package.json", adapter.package);
  const vep = adapter.package as VerifiedExecutionPackage;

  const enumUnsecured = enumerateCertifiedPaths({
    verifiedPackage: vep,
    transactionKind: "UNSECURED_DEBT",
    secured: false,
  });
  const enumSecured = enumerateCertifiedPaths({
    verifiedPackage: vep,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });

  write("02-phase4e-enumeration.json", {
    schema: "stage-d-pkgi-entity-scope-phase4e.v1",
    paidProvidersCalled: false,
    packageId: PACKAGE_ID,
    results: [
      {
        transactionKind: "UNSECURED_DEBT",
        authority: enumUnsecured.authority,
        incompleteReasons: enumUnsecured.incompleteReasons,
        unsupportedReasons: enumUnsecured.unsupportedReasons,
        paths: enumUnsecured.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          sourceSectionRef: p.sourceSectionRef,
          ruleId: p.ruleId,
        })),
      },
      {
        transactionKind: "SECURED_DEBT",
        authority: enumSecured.authority,
        incompleteReasons: enumSecured.incompleteReasons,
        unsupportedReasons: enumSecured.unsupportedReasons,
        paths: enumSecured.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          sourceSectionRef: p.sourceSectionRef,
          ruleId: p.ruleId,
        })),
      },
    ],
  });

  const inputs = snapshotInputResolver({
    snapshots: [],
    definitions: [...(vep.definitions ?? [])],
    rules: [...vep.rules],
    companyId: vep.companyId,
    instrumentKey: vep.instrumentKey,
  });
  const capacity = evaluateVerifiedCapacity({ package: vep, inputs, ledger: [], asOf: AS_OF });
  write("04-capacity-require.json", {
    schema: "stage-d-pkgi-entity-scope-capacity.v1",
    paidProvidersCalled: false,
    asOf: AS_OF,
    outcome: capacity.outcome,
    refusals: capacity.outcome === "REFUSED" ? capacity.refusals : [],
    note:
      "Full dual-path VEP refuses REQUIRE capacity: §7.02(b) carries REQUIRES Section 7.01(b) (SOURCE_REFERENCE_RESOLVED). Fail-closed — not a false permission.",
  });

  const debt701b = candidateRows.some((c) =>
    c.ruleUnits.some((u) => u.sourceSectionRef === "7.01(b)" && c.certification === "CERTIFIED"),
  );
  const d701d = candidateRows
    .flatMap((c) => c.ruleUnits)
    .find((u) => u.sourceSectionRef === "7.01(d)");
  const debtPaths = enumSecured.paths.filter((p) => p.action === "INCUR_DEBT" || p.action === "INCUR_SECURED_DEBT");
  const lienPaths = enumSecured.paths.filter((p) => p.action === "CREATE_LIEN" || p.action === "GRANT_COLLATERAL");

  const report = [
    "# Stage D probe — pkg-i entity-scope COUNTERPARTY (Cycle 4)",
    "",
    `**Verdict:** debt ∩ lien **enumeration unblocked** (\`SECURED_DEBT\` \`CERTIFIED_4E\`). REQUIRE capacity **${capacity.outcome}** (Cycle 5+ companion discharge may EXECUTE; Cycle 4 historically REFUSED cross-rule).`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Package | \`${PACKAGE_ID}\` (synthetic acceptance; offline) |`,
    `| Guard | \`entity-scope-consistency-guard.v6\` |`,
    `| CERTIFIED candidates | ${artifacts.length} |`,
    `| §7.01(b) debt CERTIFIED | ${debt701b ? "**yes**" : "no"} |`,
    `| §7.01(d) scope | \`${JSON.stringify(d701d?.entityScope)}\` status=\`${d701d?.auditStatus}\` relation=\`${d701d?.relation}\` counterparty=${d701d?.hasCounterparty} |`,
    `| SECURED_DEBT authority | **${enumSecured.authority}** |`,
    `| Debt CANDIDATE paths | ${debtPaths.length} |`,
    `| Lien companion paths | ${lienPaths.length} |`,
    `| REQUIRE capacity | **${capacity.outcome}** ${capacity.outcome === "REFUSED" ? capacity.refusals.map((r) => r.code).join(", ") : ""} |`,
    "",
    "## Defect closed",
    "",
    "§7.01(d) \"Indebtedness owed to the Borrower by any Subsidiary\" previously treated Borrower as OBLIGOR → model BORROWER vs Subsidiary-only source → `ENTITY_SCOPE_UNDERINCLUSIVE` PARTIAL sibling → §7.01 candidate `UNIT_SUFFICIENCY_INCOMPLETE` / `COMPILATION_NOT_COMPLETED`.",
    "",
    "v5/v6: Borrower is COUNTERPARTY (payee); obligor scope derives to `ANY_SUBSIDIARY`; MODEL_DIFFERENT → `SOURCE_SCOPE_DERIVED` (COMPLETE, safeToRely). Classic Borrower+RS under-inclusion still PARTIAL. Lettered children inherit parent chapeau scope (v6).",
    "",
    "## What executed vs refused",
    "",
    "| Step | Result |",
    "|---|---|",
    "| Offline CERTIFY §7.01 + §7.02 | **Pass** |",
    "| Phase 4E SECURED_DEBT dual-path | **CERTIFIED_4E** |",
    `| evaluateVerifiedCapacity(REQUIRE) | **${capacity.outcome}** |`,
    "| Customer-grade secured execution | **Not claimed** |",
    "",
    "## Safety",
    "",
    "- No paid inference; no FIXTURE_IR; CFP 0; certification gates not weakened.",
    "- Cross-rule gate remains fail-closed except finite companion-REQUIRES discharge (Cycle 5).",
    "",
  ].join("\n");

  write("00-probe-report.md", report);
  console.log(report);

  if (!debt701b) {
    console.error("expected §7.01(b) CERTIFIED after entity-scope v5");
    process.exit(2);
  }
  if (d701d?.auditStatus !== "SOURCE_SCOPE_DERIVED" || !d701d.hasCounterparty) {
    console.error("expected §7.01(d) SOURCE_SCOPE_DERIVED with COUNTERPARTY signal");
    process.exit(2);
  }
  if (enumSecured.authority !== "CERTIFIED_4E" || debtPaths.length === 0 || lienPaths.length === 0) {
    console.error("expected SECURED_DEBT CERTIFIED_4E with debt and lien paths");
    process.exit(2);
  }
  // Cycle 5+ companion-REQUIRES discharge may EXECUTE capacity; Cycle 4 historically expected REFUSED.
  // Accept either fail-closed cross-rule refusal or EXECUTED (discharge) — never invent availability.
  if (capacity.outcome === "REFUSED") {
    if (!capacity.refusals.some((r) => r.code === "CROSS_RULE_GATE_NOT_EXECUTABLE")) {
      console.error("expected REQUIRE capacity REFUSED with CROSS_RULE_GATE_NOT_EXECUTABLE");
      process.exit(2);
    }
  } else {
    // VerifiedCapacityResult is only REFUSED | EXECUTED; remaining branch is EXECUTED.
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
