/**
 * Unified CFO workflow state — which step is current / blocked and why.
 * Orchestrates Upload → Analyze → Review → Position → Simulate → Audit.
 */

import type { WorkflowStepId } from "./journey";
import { canonicalizeWorkflowStepId, customerWorkflowJourney } from "./journey";
import type { CustomerStatusCode } from "./status-contract";
import type { UploadPackageView } from "./upload-view";
import type { AnalyzeViewModel } from "./analyze-view";
import type { ReviewViewModel } from "./review-view";
import type { PositionViewModel } from "./position-view";
import type { SimulateViewModel } from "./simulate-view";
import type { AuditViewModel } from "./audit-view";
import type { SeparatedCapacityClaims } from "./capacity-state";

export interface WorkflowStepState {
  id: ReturnType<typeof canonicalizeWorkflowStepId>;
  label: string;
  href: string;
  status: CustomerStatusCode;
  blockers: string[];
  ready: boolean;
}

export interface CfoWorkflowState {
  companyId: string;
  steps: WorkflowStepState[];
  currentStep: WorkflowStepState["id"];
  capacity: SeparatedCapacityClaims | null;
  productionReady: false;
  productionBlockers: string[];
}

export function buildCfoWorkflowState(args: {
  companyId: string;
  upload: UploadPackageView;
  analyze: AnalyzeViewModel;
  review: ReviewViewModel;
  position: PositionViewModel | null;
  simulate: SimulateViewModel | null;
  audit: AuditViewModel | null;
  capacity: SeparatedCapacityClaims | null;
  preferredStep?: WorkflowStepId;
}): CfoWorkflowState {
  const journey = customerWorkflowJourney(args.companyId);

  const uploadReady = args.upload.documentsReceived.length > 0;
  const analyzeReady = args.analyze.analyzedCount > 0;
  const reviewReady =
    args.review.approvals.some((a) => a.hasRecordedDecision) ||
    args.review.executableRuleCoverage.interpreted > 0;
  const positionReady = args.position != null;
  const simulateReady = args.simulate != null;
  const auditReady = args.audit != null;

  const stepStatus = (id: WorkflowStepState["id"]): Omit<WorkflowStepState, "id" | "label" | "href"> => {
    switch (id) {
      case "upload":
        return {
          status: args.upload.overallStatus,
          blockers: [
            ...args.upload.missingDocuments.map((m) => `Missing document role: ${m}`),
            ...args.upload.extractionErrors,
          ],
          ready: uploadReady,
        };
      case "analyze":
        return {
          status: args.analyze.overallStatus,
          blockers: [
            ...args.analyze.extractionErrors,
            ...(args.analyze.compilationLimitation ? [args.analyze.compilationLimitation] : []),
          ],
          ready: analyzeReady,
        };
      case "review":
        return {
          status: args.review.overallStatus,
          blockers: args.review.outstandingBlockers,
          ready: reviewReady,
        };
      case "position":
        return {
          status: args.position?.overallStatus ?? "NEEDS_INPUT",
          blockers: [
            ...(args.position?.missingInputs ?? []),
            ...(args.position?.reviewBlockers ?? []),
          ],
          ready: positionReady,
        };
      case "simulate":
        return {
          status: args.simulate?.overallStatus ?? "HYPOTHETICAL",
          blockers: [
            ...(args.simulate?.missingInputs ?? []),
            ...(args.simulate?.unsupportedEffects ?? []),
          ],
          ready: simulateReady,
        };
      case "audit":
        return {
          status: args.audit?.publishability.overallStatus ?? "NOT_PRODUCTION_AUTHORITATIVE",
          blockers: args.audit?.publishability.reasons ?? ["Audit not assembled"],
          ready: auditReady,
        };
    }
  };

  const steps: WorkflowStepState[] = journey.map((s) => ({
    id: s.id,
    label: s.label,
    href: s.href,
    ...stepStatus(s.id),
  }));

  const preferred = args.preferredStep
    ? canonicalizeWorkflowStepId(args.preferredStep)
    : null;
  const firstBlocked = steps.find((s) => !s.ready || s.blockers.length > 0);
  const currentStep = preferred ?? firstBlocked?.id ?? "upload";

  const productionBlockers = [
    "Trusted identity production activation BLOCKED",
    ...(args.capacity && !args.capacity.remainingAuthoritative
      ? ["Verified remaining not authoritative"]
      : []),
    ...args.review.outstandingBlockers.slice(0, 5),
  ];

  return {
    companyId: args.companyId,
    steps,
    currentStep,
    capacity: args.capacity,
    productionReady: false,
    productionBlockers: [...new Set(productionBlockers)],
  };
}
