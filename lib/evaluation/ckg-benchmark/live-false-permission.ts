/**
 * Live production-path false-permission probe.
 *
 * Distinct from CKG's SYNTHETIC_ADVERSARIAL_OUTPUT control (which injects a
 * deliberate false PERMITTED to prove the metric can catch failures).
 *
 * This module runs the real Ask → complete retrieval → representation →
 * adversarial verify → certification bridge path on the same micro-excerpts
 * and records whether an affirmative permission reaches customers.
 */

import { buildDocumentCovenantSummary } from "../../product/covenant-intelligence/summarize";
import { runLegalExcellence } from "../../product/covenant-intelligence/legal-excellence";
import type { CovenantCandidateRecord } from "../../knowledge-factory/types";

export interface FalsePermissionControlCase {
  caseId: string;
  excerpt: string;
  shouldDeny: boolean;
  notes: string;
}

export const FALSE_PERMISSION_CONTROL_CASES: FalsePermissionControlCase[] = [
  {
    caseId: "syn-false-perm-general-prohibition",
    excerpt:
      "The Borrower shall not incur any Indebtedness. There are no enumerated exceptions in this micro-agreement.",
    shouldDeny: true,
    notes: "General prohibition with explicit absence of exceptions — must not invent a general basket.",
  },
  {
    caseId: "syn-false-perm-carveout-present",
    excerpt: "The Borrower shall not incur any Indebtedness except Indebtedness under this Agreement.",
    shouldDeny: false,
    notes: "Agreement-debt carve-out is a correct affirmative permission, not a false permission.",
  },
];

export interface LiveFalsePermissionOutcome {
  caseId: string;
  shouldDeny: boolean;
  /** True when the live path affirmatively permits unsafely (only relevant when shouldDeny). */
  systemPermitted: boolean;
  falsePermission: boolean;
  analyzerPermissionCount: number;
  askKind: string;
  verifierVerdict: string;
  permissionAuthority: string;
  usableByPhase4A: boolean;
  usableByPhase4E: boolean;
  detailSnippet: string;
  gateBlocksCustomerExecutable: boolean;
}

function buildItem(caseId: string, excerpt: string) {
  const sourceId = `synthetic:${caseId}`;
  const candidate: CovenantCandidateRecord = {
    candidateId: `${caseId}:cand`,
    sourceId,
    nodeId: "n1",
    families: ["INDEBTEDNESS"],
    signals: ["live-false-permission-probe"],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 8,
  };
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: "Synthetic micro-agreement (evaluation only)",
    issuerCik: "0000000000",
    documentClass: "CREDIT_AGREEMENT",
    candidates: [candidate],
    definitions: [],
    structuralNodes: [
      {
        nodeId: "n1",
        sourceId,
        nodeType: "SECTION",
        sectionRef: "6.01",
        heading: "Indebtedness",
        charStart: 0,
        charEnd: excerpt.length,
        ambiguous: false,
      },
    ],
    crossReferences: [],
  });
  const item = summary.items[0]!;
  return { ...item, sourceId };
}

/**
 * Affirmative unsafe permission for false-permission scoring when shouldDeny:
 * inventing enumerated baskets / dollar capacity, OR Phase-4 executable without certification,
 * OR unprotected "is permitted" language in the Ask detail.
 */
function detectsUnsafeAffirmativePermission(params: {
  shouldDeny: boolean;
  analysisPermissions: string[];
  excellence: ReturnType<typeof runLegalExcellence>;
}): boolean {
  const { shouldDeny, analysisPermissions, excellence } = params;
  if (!shouldDeny) return false;
  const inventsBasket = analysisPermissions.some((p) =>
    /general basket|\$\s*[\d,]+|unlimited|may freely/i.test(p),
  );
  const phase4Executable =
    excellence.bridged.usableByPhase4A === true || excellence.bridged.usableByPhase4E === true;
  const askClaimsAllowed =
    /\b(?:is permitted|transaction is allowed|may freely|capacity of \$)\b/i.test(
      excellence.bridged.ask.detail,
    ) &&
    !/will not invent|not a determination|Independent verification gate|not Phase 4 executable/i.test(
      excellence.bridged.ask.detail,
    );
  return inventsBasket || phase4Executable || askClaimsAllowed;
}

export function probeLiveFalsePermission(
  cases: FalsePermissionControlCase[] = FALSE_PERMISSION_CONTROL_CASES,
): {
  outcomes: LiveFalsePermissionOutcome[];
  incidence: { failures: number; evaluated: number; rate: number };
  adversarialControlNote: string;
} {
  const outcomes: LiveFalsePermissionOutcome[] = [];
  for (const c of cases) {
    const item = buildItem(c.caseId, c.excerpt);
    const excellence = runLegalExcellence({
      question: "Can the Borrower incur additional Indebtedness under a general basket?",
      items: [item],
      researchOnly: true,
      transactionDescription: "Incur $25 million of unsecured Indebtedness under a general basket.",
    });
    const systemPermitted = detectsUnsafeAffirmativePermission({
      shouldDeny: c.shouldDeny,
      analysisPermissions: item.permissions ?? [],
      excellence,
    });
    const falsePermission = c.shouldDeny && systemPermitted;
    outcomes.push({
      caseId: c.caseId,
      shouldDeny: c.shouldDeny,
      systemPermitted,
      falsePermission,
      analyzerPermissionCount: (item.permissions ?? []).length,
      askKind: excellence.bridged.ask.kind,
      verifierVerdict: excellence.verification.verdict,
      permissionAuthority: excellence.bridged.permissionAuthority,
      usableByPhase4A: excellence.bridged.usableByPhase4A,
      usableByPhase4E: excellence.bridged.usableByPhase4E,
      detailSnippet: excellence.bridged.ask.detail.slice(0, 280),
      gateBlocksCustomerExecutable:
        !excellence.bridged.usableByPhase4A &&
        !excellence.bridged.usableByPhase4E &&
        excellence.bridged.permissionAuthority === "DISCOVERY_NON_AUTHORITATIVE",
    });
  }
  const failures = outcomes.filter((o) => o.falsePermission).length;
  const evaluated = outcomes.length;
  return {
    outcomes,
    incidence: {
      failures,
      evaluated,
      rate: evaluated === 0 ? 0 : failures / evaluated,
    },
    adversarialControlNote:
      "CKG offline false_permission_rate (1/2 = 50%) scores SYNTHETIC_ADVERSARIAL_OUTPUT fixtures that intentionally inject a false PERMITTED. That control proves the scorer catches unsafe outputs; it is not a live production-path measurement. Use this live probe for reachability.",
  };
}
