/**
 * Product path: authentic / uploaded compliance-certificate text → FCE extract
 * → NS-4 DRAFT|REVIEW_REQUIRED proposal. Never auto-approves.
 *
 * Issuer fixtures are labeled (AUTHENTIC_SOURCE_DERIVED / SEED_ALIGNED_MODELED).
 * No issuer-specific production branching beyond selecting committed fixture text.
 */

import {
  proposeFinancialSnapshotLifecycle,
  approveProposedFinancialSnapshot,
  type FinancialInputAuthorityLabel,
  type ReconciliationReport,
} from "@/lib/financial-certificate-engine";
import {
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
  MATTHEWS_AS_OF_Q1,
  MATTHEWS_FIXTURE_AUTHORITY,
} from "@/lib/financial-certificate-engine/fixtures/authentic-matthews-q1-fy2025";
import {
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
  COHERENT_AS_OF,
  COHERENT_FIXTURE_AUTHORITY,
} from "@/lib/financial-certificate-engine/fixtures/authentic-coherent-fy2026";

export type CertificateFixtureIssuer = "matthews_q1_fy2025" | "coherent_fy2026";

export interface ProposeCertificateTextResult {
  ok: boolean;
  companyId: string;
  snapshotId: string | null;
  status: string;
  authoritative: false;
  fixtureAuthority: FinancialInputAuthorityLabel | null;
  reconciliationDisposition: string | null;
  factKeys: string[];
  issues: string[];
  label: string;
  sourceDocuments: Array<{ documentId: string; role: string }>;
}

/** Propose from caller-supplied certificate (+ optional statement) text. Never APPROVED. */
export async function proposeCertificateTextForCompany(args: {
  companyId: string;
  certificateText: string;
  statementText?: string;
  certificateDocumentId?: string;
  statementDocumentId?: string;
  now?: string;
  fixtureAuthority?: FinancialInputAuthorityLabel | null;
  label?: string;
}): Promise<ProposeCertificateTextResult> {
  const certText = args.certificateText.trim();
  if (!certText) {
    return {
      ok: false,
      companyId: args.companyId,
      snapshotId: null,
      status: "REJECTED",
      authoritative: false,
      fixtureAuthority: args.fixtureAuthority ?? null,
      reconciliationDisposition: null,
      factKeys: [],
      issues: ["certificateText is required"],
      label: "certificate text missing",
      sourceDocuments: [],
    };
  }

  const certificateDocumentId =
    args.certificateDocumentId ?? `upload-cert-${args.companyId}-${Date.now().toString(36)}`;
  const statementDocumentId =
    args.statementDocumentId ?? `upload-stmt-${args.companyId}-${Date.now().toString(36)}`;

  const proposed = await proposeFinancialSnapshotLifecycle({
    companyId: args.companyId,
    certificate: {
      documentId: certificateDocumentId,
      text: certText,
      declaredType: "COMPLIANCE_CERTIFICATE",
    },
    statement: args.statementText?.trim()
      ? {
          documentId: statementDocumentId,
          text: args.statementText.trim(),
          declaredType: "FINANCIAL_STATEMENT",
        }
      : undefined,
    now: args.now ? new Date(args.now) : undefined,
  });

  const factKeys = proposed.proposal?.facts.map((f) => f.key) ?? [];
  const sourceDocuments: ProposeCertificateTextResult["sourceDocuments"] = [
    { documentId: certificateDocumentId, role: "COMPLIANCE_CERTIFICATE" },
  ];
  if (args.statementText?.trim()) {
    sourceDocuments.push({ documentId: statementDocumentId, role: "FINANCIAL_STATEMENT" });
  }

  if (!proposed.propose.ok || !proposed.propose.snapshotId) {
    return {
      ok: false,
      companyId: args.companyId,
      snapshotId: proposed.propose.snapshotId ?? null,
      status: proposed.propose.status ?? "REJECTED",
      authoritative: false,
      fixtureAuthority: args.fixtureAuthority ?? null,
      reconciliationDisposition: proposed.run.reconciliation.disposition,
      factKeys,
      issues: [proposed.propose.reason ?? "NS-4 proposal refused"],
      label: args.label ?? "FCE proposal refused",
      sourceDocuments,
    };
  }

  return {
    ok: true,
    companyId: args.companyId,
    snapshotId: proposed.propose.snapshotId,
    status: proposed.propose.status ?? "DRAFT",
    authoritative: false,
    fixtureAuthority: args.fixtureAuthority ?? null,
    reconciliationDisposition: proposed.run.reconciliation.disposition,
    factKeys,
    issues: [],
    label:
      args.label ??
      `FCE proposal ${proposed.propose.status} — not approved (extractor cannot grant authority)`,
    sourceDocuments,
  };
}

/** Seed committed Matthews / Coherent certificate reconstructions through the same FCE path. */
export async function proposeAuthenticCertificateFixtureForCompany(
  companyId: string,
  issuer: CertificateFixtureIssuer,
): Promise<ProposeCertificateTextResult> {
  if (issuer === "matthews_q1_fy2025") {
    return proposeCertificateTextForCompany({
      companyId,
      certificateText: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
      statementText: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
      certificateDocumentId: `matthews-cert-q1-fy2025-${companyId}`,
      statementDocumentId: `matthews-stmt-q1-fy2025-${companyId}`,
      now: "2025-02-15T00:00:00Z",
      fixtureAuthority: MATTHEWS_FIXTURE_AUTHORITY,
      label: `Matthews Q1 FY2025 fixture (${MATTHEWS_AS_OF_Q1}) — ${MATTHEWS_FIXTURE_AUTHORITY.kind}; DRAFT only`,
    });
  }

  return proposeCertificateTextForCompany({
    companyId,
    certificateText: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
    statementText: COHERENT_FINANCIAL_STATEMENT_FY2026,
    certificateDocumentId: `coherent-cert-fy2026-${companyId}`,
    statementDocumentId: `coherent-stmt-fy2026-${companyId}`,
    now: "2026-08-20T00:00:00Z",
    fixtureAuthority: COHERENT_FIXTURE_AUTHORITY,
    label: `Coherent FY2026 fixture (${COHERENT_AS_OF}) — ${COHERENT_FIXTURE_AUTHORITY.kind}; DRAFT only`,
  });
}

/**
 * Attributable approve of an FCE-proposed snapshot.
 * Requires reviewedBy; never used by extractors. BLOCKED reconciliation refuses.
 */
export async function approveFceProposedCertificate(args: {
  companyId: string;
  snapshotId: string;
  reviewedBy: string;
  approvalRef: string;
  reconciliation?: ReconciliationReport;
  /** ISO approval time — not delivery evidence; defaults to now. */
  reviewedAt?: string;
  /**
   * Certificate delivery date (ISO). Required for authoritative cutoff bind.
   * Never defaults to reviewedAt or reporting-period asOf.
   */
  deliveredAsOfDate?: string;
}): Promise<{
  ok: boolean;
  snapshotId: string;
  status: string;
  authoritative: boolean;
  issues: string[];
  authorityDisclosure: string;
}> {
  const reviewedBy = args.reviewedBy.trim();
  if (!reviewedBy) {
    return {
      ok: false,
      snapshotId: args.snapshotId,
      status: "REJECTED",
      authoritative: false,
      issues: ["reviewedBy is required — never auto-approve"],
      authorityDisclosure: "UNAPPROVED_EXTRACTION — missing attributable reviewer.",
    };
  }

  const reconciliation: ReconciliationReport =
    args.reconciliation ??
    ({
      companyId: args.companyId,
      statementDocumentId: null,
      certificateDocumentId: null,
      asOfDate: null,
      reportingPeriod: null,
      findings: [],
      matchedMetricCount: 0,
      discrepancyCount: 0,
      missingInputKeys: [],
      disposition: "REVIEW_REQUIRED",
      dispositionReason: "Product attributable approve without live reconciliation replay",
    } satisfies ReconciliationReport);

  const result = await approveProposedFinancialSnapshot({
    companyId: args.companyId,
    snapshotId: args.snapshotId,
    reviewedBy,
    approvalRef: args.approvalRef.trim() || `apr-${args.snapshotId}`,
    reconciliation,
    reviewedAt: args.reviewedAt,
    deliveredAsOfDate: args.deliveredAsOfDate,
  });

  return {
    ok: result.approve.ok === true && result.authoritative,
    snapshotId: args.snapshotId,
    status: result.approve.status ?? (result.approve.ok ? "APPROVED" : "REJECTED"),
    authoritative: result.authoritative,
    issues: result.approve.ok ? [] : [result.approve.reason ?? "approve refused"],
    authorityDisclosure:
      "Attributable reviewedBy approval of an FCE proposal. Extractor never auto-approves. CI/local reviewedBy is TEST_ATTRIBUTED_APPROVAL, not production REAL_REVIEWER_APPROVED.",
  };
}

export { MATTHEWS_FIXTURE_AUTHORITY, COHERENT_FIXTURE_AUTHORITY };
