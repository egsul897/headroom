/**
 * End-to-end multi-covenant transaction demonstration (provider-free).
 *
 * Prints exact citations, financial inputs, utilization evidence status, and
 * 10-step trace for a Coherent secured debt-funded acquisition.
 *
 * Usage: npx tsx scripts/mission-proof-package-transaction.ts
 */

import { executePackageTransaction } from "@/lib/product/package-transaction-execution";
import {
  coherentDebtFundedAcquisition,
  coherentPackageData,
} from "@/lib/product/cross-domain-scenarios";
import { covenantDomainCoverage } from "@/lib/product/cross-domain-transaction";
import {
  COHERENT_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";

const data = coherentPackageData();
const tx = coherentDebtFundedAcquisition(150);
const result = executePackageTransaction({
  packageIdentity: {
    companyId: data.companyId,
    evaluationDate: "2026-06-30",
    documentIds: data.documents.map((d) => d.id),
    approvedSnapshotId: null,
  },
  data,
  transaction: tx,
  ebitdaDerivation: resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE),
  utilizationAuthority: null,
});

const coverage = covenantDomainCoverage();

console.log("=== PACKAGE-WIDE MULTI-COVENANT TRANSACTION DEMO ===");
console.log(
  JSON.stringify(
    {
      version: result.version,
      crossDomainVersion: result.crossDomainVersion,
      packageIdentity: result.packageIdentity,
      scenario: result.evaluation.scenario.label,
      overallStatus: result.overallStatus,
      packagePermitted: result.packagePermitted,
      financialInputs: {
        contractualEbitda: result.evaluation.contractualComputation.contractualEbitda,
        ebitdaDerivation: result.evaluation.contractualComputation.ebitdaDerivation?.kind,
        leverage: result.evaluation.contractualComputation.leverage,
        fingerprint: result.evaluation.approvedFinancialIdentity?.inputFingerprint,
      },
      utilization: {
        authoritySupplied: false,
        verifiedRemainingPublished: result.evaluation.domains.some(
          (d) => d.verifiedRemainingMillions != null,
        ),
        note: "Verified remaining withheld — no canonical utilization authority",
      },
      applicableDomains: result.applicableDomains,
      irrelevantDomains: result.irrelevantDomains,
      perCovenant: result.supportByDomain.filter((s) => s.applicable),
      citations: result.citations,
      missingInputs: result.missingInputs,
      assumptions: result.assumptions,
      limitations: result.limitations.slice(0, 8),
      unresolvedBlockers: result.unresolvedBlockers,
      hypotheticalPostState: result.hypotheticalPostState,
      steps: result.steps.map((s) => ({
        index: s.index,
        id: s.id,
        status: s.status,
        detail: s.detail,
      })),
      coverageCounts: {
        PARTIAL: coverage.filter((r) => r.support === "PARTIAL").length,
        UNSUPPORTED: coverage.filter((r) => r.support === "UNSUPPORTED").length,
        EXECUTABLE: coverage.filter((r) => r.support === "EXECUTABLE").length,
      },
      debtBinding: result.evaluation.debtSimulation?.binding
        ? {
            document: result.evaluation.debtSimulation.binding.documentName,
            provision:
              result.evaluation.debtSimulation.binding.bindingProvision?.sectionRef,
            status: result.evaluation.debtSimulation.status,
            grossCapacity: result.evaluation.debtSimulation.overallCapacity,
          }
        : null,
      rpSteps: result.evaluation.rpSimulation?.steps.map((s) => ({
        sectionRef: s.sectionRef,
        basketName: s.basketName,
        allocated: s.allocated,
      })),
      trace: result.trace,
    },
    null,
    2,
  ),
);
