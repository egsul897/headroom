/**
 * Document-to-answer acceptance harness — NON_AUTHORITATIVE by default.
 *
 * Traces: source documents → compilation → operative authority → financial
 * state → capacity/simulation → output. Every stage preserves upstream
 * refusal / uncertainty; AVAILABLE is never published from this harness.
 */

import { compileOperativeCovenantPackage } from "@/lib/contract-model/analysis/operative-covenant-package";
import { createProviderFreeStageCaller } from "@/lib/contract-model/compiler/llm-caller";
import type {
  DocumentToAnswerQuestion,
  DocumentToAnswerTrace,
  HarnessMode,
  HarnessStageResult,
  StageDisposition,
} from "./types";

export const DOCUMENT_TO_ANSWER_HARNESS_VERSION = "document-to-answer-harness.v1";

function worstDisposition(a: StageDisposition, b: StageDisposition): StageDisposition {
  const rank: Record<StageDisposition, number> = {
    PASS: 0,
    SKIPPED: 1,
    NEEDS_INPUT: 2,
    AMBIGUOUS: 3,
    UNSUPPORTED: 4,
    REFUSE: 5,
  };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Run a representative question through the compile→authority→capacity path.
 * Mode PRODUCTION_AUTHORITY is accepted as a parameter but always refused —
 * this harness never activates production authority.
 */
export async function runDocumentToAnswerTrace(
  question: DocumentToAnswerQuestion,
  options?: {
    mode?: HarnessMode;
    startingSha?: string | null;
  },
): Promise<DocumentToAnswerTrace> {
  const mode: HarnessMode = options?.mode ?? "NON_AUTHORITATIVE";
  const stages: HarnessStageResult[] = [];
  const blockers: string[] = [];
  const provenance: string[] = [];

  // --- source_documents ----------------------------------------------------
  if (!question.documents.length) {
    stages.push({
      stage: "source_documents",
      disposition: "REFUSE",
      detail: "No source documents supplied",
      uncertaintyCodes: ["missing_source_documents"],
      citations: [],
      numericClaims: [],
    });
    blockers.push("missing_source_documents");
  } else {
    const empty = question.documents.filter((d) => d.text.trim().length === 0);
    stages.push({
      stage: "source_documents",
      disposition: empty.length > 0 ? "REFUSE" : "PASS",
      detail: `${question.documents.length} document(s); empty=${empty.length}`,
      uncertaintyCodes: empty.length > 0 ? ["empty_source_document"] : [],
      citations: question.documents.map((d) => d.documentId),
      numericClaims: [],
    });
    if (empty.length > 0) blockers.push("empty_source_document");
    provenance.push(...question.documents.map((d) => `doc:${d.documentId}`));
  }

  // --- compilation + operative authority -----------------------------------
  let grossUsd: number | null = null;
  let modeledUsd: number | null = null;
  let compileDisposition: StageDisposition = "REFUSE";
  let oaDisposition: StageDisposition = "REFUSE";
  const uncertaintyCodes: string[] = [];

  if (blockers.includes("missing_source_documents") || blockers.includes("empty_source_document")) {
    stages.push({
      stage: "compilation",
      disposition: "SKIPPED",
      detail: "Skipped — source documents refused",
      uncertaintyCodes: [...blockers],
      citations: [],
      numericClaims: [],
    });
    stages.push({
      stage: "operative_authority",
      disposition: "SKIPPED",
      detail: "Skipped — source documents refused",
      uncertaintyCodes: [...blockers],
      citations: [],
      numericClaims: [],
    });
  } else {
    const result = await compileOperativeCovenantPackage({
      companyId: question.companyId,
      packageKey: question.packageKey,
      instrumentKey: question.instrumentKey,
      asOfDate: question.asOfDate,
      documents: question.documents.map((d) => ({
        documentId: d.documentId,
        text: d.text,
        label: d.label ?? d.documentId,
      })),
      executionMode: "PROVIDER_FREE",
      discoveryCaller: createProviderFreeStageCaller(),
      amendmentCaller: createProviderFreeStageCaller(),
    });

    const exec = result.executableUnits;
    const grossUnits = exec.filter(
      (u) =>
        u.capacityClass === "SOURCE_BACKED_GROSS_CONTRACTUAL" &&
        u.sourceBackedGrossCapacityUsd != null,
    );
    const modeledUnits = exec.filter(
      (u) =>
        u.capacityClass === "MODELED_HYPOTHETICAL" &&
        u.modeledHypotheticalCapacityUsd != null,
    );

    if (result.diagnostics.operativeAuthorityCalculationMismatches > 0) {
      compileDisposition = "REFUSE";
      blockers.push("oa_calculation_mismatch");
      uncertaintyCodes.push("oa_calculation_mismatch");
    } else if (grossUnits.length + modeledUnits.length === 0) {
      compileDisposition = "UNSUPPORTED";
      uncertaintyCodes.push("no_source_backed_capacity_units");
    } else {
      compileDisposition = "PASS";
      // Prefer a single representative gross unit; do not sum unrelated baskets.
      grossUsd = grossUnits[0]?.sourceBackedGrossCapacityUsd ?? null;
      modeledUsd = modeledUnits[0]?.modeledHypotheticalCapacityUsd ?? null;
    }

    stages.push({
      stage: "compilation",
      disposition: compileDisposition,
      detail: `executable=${exec.length}; gross=${grossUnits.length}; modeled=${modeledUnits.length}; oaMismatches=${result.diagnostics.operativeAuthorityCalculationMismatches}`,
      uncertaintyCodes: [...uncertaintyCodes],
      citations: exec.map((u) => `${u.governingDocumentId}:${u.sourceRef}`),
      numericClaims: [
        {
          label: "representative_gross",
          amountUsd: grossUsd,
          claimKind: grossUsd != null ? "GROSS_CONTRACTUAL" : "NONE",
          authoritative: false,
        },
        {
          label: "representative_modeled",
          amountUsd: modeledUsd,
          claimKind: modeledUsd != null ? "MODELED_HYPOTHETICAL" : "NONE",
          authoritative: false,
        },
      ],
    });
    provenance.push(`compile:${result.version}`);

    const confirmed = exec.filter((u) => u.governingAuthorityConfirmed);
    const mismatchedDocs = exec.filter(
      (u) =>
        (u.sourceBackedGrossCapacityUsd != null || u.modeledHypotheticalCapacityUsd != null) &&
        u.documentId !== u.governingDocumentId,
    );
    if (mismatchedDocs.length > 0) {
      oaDisposition = "REFUSE";
      blockers.push("operative_text_document_ne_governing_document");
      uncertaintyCodes.push("operative_text_document_ne_governing_document");
    } else if (confirmed.length === 0 && exec.length > 0) {
      oaDisposition = "AMBIGUOUS";
      uncertaintyCodes.push("governing_authority_not_confirmed_for_production");
    } else if (exec.length === 0) {
      oaDisposition = "UNSUPPORTED";
      uncertaintyCodes.push("no_executable_units_for_authority");
    } else {
      oaDisposition = "PASS";
    }

    stages.push({
      stage: "operative_authority",
      disposition: oaDisposition,
      detail: `confirmed=${confirmed.length}/${exec.length}; gate=${result.offlineCompile.stages.operativeHandoff.authorityGate}`,
      uncertaintyCodes: uncertaintyCodes.filter((c) =>
        c.includes("authority") || c.includes("governing") || c.includes("operative_text"),
      ),
      citations: exec.map((u) => `${u.governingDocumentId}:${u.operativeAuthorityClassification}`),
      numericClaims: [],
    });
  }

  // --- financial_state -----------------------------------------------------
  let financialDisposition: StageDisposition = "NEEDS_INPUT";
  const facts = question.approvedFinancialFacts ?? [];
  const approved = facts.filter((f) => f.approvalStatus === "APPROVED");
  if (facts.length === 0) {
    financialDisposition = "NEEDS_INPUT";
    uncertaintyCodes.push("missing_approved_financial_snapshot");
  } else if (approved.length === 0) {
    financialDisposition = "REFUSE";
    blockers.push("financial_facts_not_approved");
    uncertaintyCodes.push("financial_facts_not_approved");
  } else {
    financialDisposition = "PASS";
    provenance.push(...approved.map((f) => `fact:${f.key}@${f.asOfDate}`));
  }
  stages.push({
    stage: "financial_state",
    disposition: financialDisposition,
    detail: `facts=${facts.length}; approved=${approved.length}`,
    uncertaintyCodes: uncertaintyCodes.filter((c) => c.includes("financial")),
    citations: approved.map((f) => `${f.key}:${f.asOfDate}`),
    numericClaims: approved.map((f) => ({
      label: f.key,
      amountUsd: f.amountUsd,
      claimKind: "NONE" as const,
      authoritative: false,
    })),
  });

  // --- capacity_simulation -------------------------------------------------
  // Remaining / AVAILABLE require ledger + approved financials + confirmed OA.
  // This harness never publishes AVAILABLE.
  let simDisposition: StageDisposition = "UNSUPPORTED";
  const ledger = question.ledgerUsageUsd;
  if (grossUsd == null && modeledUsd == null) {
    simDisposition = "UNSUPPORTED";
    uncertaintyCodes.push("no_gross_or_modeled_capacity");
  } else if (ledger == null) {
    simDisposition = "NEEDS_INPUT";
    uncertaintyCodes.push("missing_ledger_usage");
  } else if (financialDisposition !== "PASS" || oaDisposition === "REFUSE") {
    simDisposition = "REFUSE";
    blockers.push("cannot_compute_remaining_without_oa_and_financials");
  } else {
    // Disclose modeled remaining only as non-authoritative diagnostic.
    simDisposition = "PASS";
  }

  const contemplated = question.contemplatedAmountUsd ?? null;
  const diagnosticRemaining =
    simDisposition === "PASS" && grossUsd != null && ledger != null
      ? Math.max(0, grossUsd - ledger)
      : null;

  if (
    contemplated != null &&
    diagnosticRemaining != null &&
    contemplated > diagnosticRemaining
  ) {
    uncertaintyCodes.push("contemplated_exceeds_diagnostic_remaining");
  }

  stages.push({
    stage: "capacity_simulation",
    disposition: simDisposition,
    detail: `gross=${grossUsd}; ledger=${ledger}; diagnosticRemaining=${diagnosticRemaining}; contemplated=${contemplated}; AVAILABLE refused`,
    uncertaintyCodes: uncertaintyCodes.filter(
      (c) => c.includes("ledger") || c.includes("remaining") || c.includes("gross") || c.includes("contemplated"),
    ),
    citations: provenance.slice(),
    numericClaims: [
      {
        label: "diagnostic_remaining_gross_minus_ledger",
        amountUsd: diagnosticRemaining,
        claimKind: "NONE",
        authoritative: false,
      },
      {
        label: "available",
        amountUsd: null,
        claimKind: "AVAILABLE",
        authoritative: false,
      },
    ],
  });

  // --- output --------------------------------------------------------------
  let outputDisposition: StageDisposition = "PASS";
  for (const s of stages) {
    outputDisposition = worstDisposition(outputDisposition, s.disposition);
  }
  if (mode === "PRODUCTION_AUTHORITY") {
    outputDisposition = "REFUSE";
    blockers.push("harness_refuses_production_authority_mode");
  }

  const authoritative = false; // harness never authoritative
  stages.push({
    stage: "output",
    disposition: outputDisposition === "PASS" ? "PASS" : outputDisposition,
    detail: `mode=${mode}; authoritative=${authoritative}; blockers=${blockers.length}`,
    uncertaintyCodes: [...new Set(uncertaintyCodes)],
    citations: provenance.slice(),
    numericClaims: [
      {
        label: "gross_contractual",
        amountUsd: outputDisposition === "REFUSE" ? null : grossUsd,
        claimKind: "GROSS_CONTRACTUAL",
        authoritative: false,
      },
      {
        label: "available",
        amountUsd: null,
        claimKind: "AVAILABLE",
        authoritative: false,
      },
    ],
  });

  const uncertaintyPreserved =
    stages.every((s) => s.disposition !== "PASS" || s.numericClaims.every((n) => !n.authoritative)) &&
    stages.some(
      (s) =>
        s.uncertaintyCodes.length > 0 ||
        s.disposition === "REFUSE" ||
        s.disposition === "NEEDS_INPUT" ||
        s.disposition === "UNSUPPORTED" ||
        s.disposition === "AMBIGUOUS" ||
        // Clean path still preserves non-authoritative flag on output.
        (s.stage === "output" && s.numericClaims.every((n) => !n.authoritative)),
    );

  return {
    version: DOCUMENT_TO_ANSWER_HARNESS_VERSION,
    mode,
    questionId: question.questionId,
    startingSha: options?.startingSha ?? null,
    stages,
    answer: {
      disposition: outputDisposition,
      summary:
        outputDisposition === "PASS"
          ? "Non-authoritative trace completed; AVAILABLE refused; gross/modeled disclosed only when compile+OA consistent."
          : `Trace disposition ${outputDisposition}; blockers=${blockers.join(",") || "none"}`,
      availableCapacityUsd: null,
      grossContractualUsd: outputDisposition === "REFUSE" ? null : grossUsd,
      modeledHypotheticalUsd: outputDisposition === "REFUSE" ? null : modeledUsd,
      authoritative,
      blockers: [...new Set(blockers)],
      provenance,
    },
    integrity: {
      uncertaintyPreserved,
      refusedAuthoritativeWhenBlocked:
        blockers.length === 0 || authoritative === false,
      productionAuthorityPublished: false,
    },
  };
}
