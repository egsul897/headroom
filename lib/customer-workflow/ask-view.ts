/**
 * Ask answer presentation — status, selected path, permissions, conditions,
 * missing inputs, utilization completeness, citations, limitations.
 * No legal inference in the UI layer.
 */

import {
  mapAskAnswerKindToCustomerStatus,
  presentCustomerStatus,
  type CustomerStatusCode,
} from "./status-contract";

export interface AskAnswerPresentation {
  answerStatus: CustomerStatusCode;
  answerStatusLabel: string;
  selectedLegalPath: string | null;
  debtLienPermissions: string[];
  requiredConditions: string[];
  missingFinancialInputs: string[];
  utilizationCompleteness: string;
  sourceCitations: Array<{ label: string; excerpt?: string; epistemicStatus?: string }>;
  explicitLimitations: string[];
  /** True when the engine did not establish permission. */
  permissionNotEstablished: boolean;
  guidance: string;
}

export function presentAskAnswer(args: {
  answerKind?: string | null;
  verifiedExecutable?: boolean;
  selectedPathId?: string | null;
  selectedPathResult?: string | null;
  permissions?: string[];
  conditions?: string[];
  missingInputs?: string[];
  missingConfirmations?: string[];
  utilizationVerdict?: string | null;
  utilizationSummary?: string | null;
  citations?: Array<{
    governingAgreement?: string;
    sectionRef?: string;
    excerpt?: string;
    epistemicStatus?: string;
    posture?: string | null;
  }>;
  limitations?: string[];
  verifiedBlockers?: string[];
}): AskAnswerPresentation {
  const answerStatus = mapAskAnswerKindToCustomerStatus(args.answerKind, {
    verifiedExecutable: args.verifiedExecutable,
  });
  const presented = presentCustomerStatus(answerStatus);

  const selectedLegalPath =
    args.selectedPathId || args.selectedPathResult
      ? [args.selectedPathId, args.selectedPathResult].filter(Boolean).join(" · ")
      : null;

  const missingFinancialInputs = [
    ...(args.missingInputs ?? []),
    ...(args.missingConfirmations ?? []),
  ];

  const utilizationCompleteness =
    args.utilizationVerdict || args.utilizationSummary
      ? `${args.utilizationVerdict ?? "—"}${args.utilizationSummary ? ` — ${args.utilizationSummary}` : ""}`
      : "UNKNOWN — utilization completeness not established (not zero)";

  const sourceCitations = (args.citations ?? []).map((c) => ({
    label: [c.governingAgreement, c.sectionRef, c.posture ? `[${c.posture}]` : null]
      .filter(Boolean)
      .join(" — "),
    excerpt: c.excerpt,
    epistemicStatus: c.epistemicStatus,
  }));

  const permissionNotEstablished =
    answerStatus !== "VERIFIED_EXECUTABLE" || args.verifiedExecutable !== true;

  const explicitLimitations = [
    ...(args.limitations ?? []),
    ...(args.verifiedBlockers ?? []).map((b) => `Verified path blocker: ${b}`),
    ...(permissionNotEstablished
      ? ["Engine has not established verified legal permission for this question."]
      : []),
  ];

  return {
    answerStatus,
    answerStatusLabel: presented.label,
    selectedLegalPath,
    debtLienPermissions: args.permissions ?? [],
    requiredConditions: args.conditions ?? [],
    missingFinancialInputs: [...new Set(missingFinancialInputs)],
    utilizationCompleteness,
    sourceCitations,
    explicitLimitations: [...new Set(explicitLimitations)],
    permissionNotEstablished,
    guidance: presented.customerGuidance,
  };
}
