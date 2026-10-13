import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { CapacityClaimRow } from "@/components/customer-workflow/CapacityClaimRow";
import { SeparatedCapacityPanel } from "@/components/customer-workflow/SeparatedCapacityPanel";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { FinancialIdentityError } from "@/lib/financial-identity";
import { fmtM } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { runPackageLegalPath } from "@/lib/product/legal-intelligence/run-package-path";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { buildPositionView } from "@/lib/customer-workflow/position-view";
import { presentCapacityClaim } from "@/lib/customer-workflow/status-contract";
import { separateCapacityClaimsFromProductView } from "@/lib/customer-workflow/capacity-state";
import { assertCfoPageAccessOrNotFound } from "@/lib/customer-workflow/assert-page-access";
import {
  grossCandidatesFromVerifiedExecutableCompile,
  selectSourceBackedGrossMm,
} from "@/lib/customer-workflow/select-source-backed-gross";
import { loadAuthenticDashboardSlice } from "@/lib/product/real-dashboard-vertical-slice";
import { loadSharedNs4FinancialIdentity } from "@/lib/product/ns4-shared-financial-identity";
import { loadAuthoritativeCapacity } from "@/lib/product/north-star-workflow/authoritative-capacity";

export const metadata = { title: "Headroom — Position" };

/**
 * Position — debt / covenant capacity workspace.
 * Consumes the shared capacity engine + readiness loaders. Never hardcodes
 * issuer arithmetic. Dashboard authority flags alone never publish AVAILABLE.
 * Access-gated before sensitive loaders. Authentic VE slice supplies
 * SOURCE_BACKED_COMPILED_GROSS presentation when registered (#304/#310).
 * APPROVED NS-4 financials (when cutoff-bound) are the reusable input identity
 * for capacity/simulation — never Dashboard-only leverage.
 */
export default async function PositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<{ evaluationDate?: string }>;
}) {
  const { companyId } = await params;
  const sp = searchParams ? await searchParams : {};
  await assertCfoPageAccessOrNotFound({ companyId });
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;

  if (isConmed) {
    const path = await runPackageLegalPath(CONMED_DEMO_COMPANY_ID);
    const blockers = path.challenges.filter((c) => c.severity === "BLOCKER");
    const facts = path.conclusions.filter((c) => c.kind === "PACKAGE_FACT");

    return (
      <div className="stack">
        <Card>
          <div className="card-title">Position</div>
          <WorkflowJourney companyId={companyId} current="position" />
          <div className="card-subtitle" style={{ marginTop: 8 }}>
            CONMED authentic package — integrated legal path + autonomous challenge. Capacity is{" "}
            <strong>not determinable</strong>.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <StatusChip code="UNKNOWN" />
            </div>
          </div>
          <div className="row">
            <div className="row-label">Executable conclusions surviving challenge</div>
            <div className="row-value">{path.survivingExecutableConclusions}</div>
          </div>
          <div className="row">
            <div className="row-label">Path</div>
            <div className="row-value" style={{ fontSize: 12 }}>
              {path.pathExecuted.join(" → ")}
            </div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Utilized capacity</div>
            <div className="row-value">
              <StatusChip code="UNKNOWN" compact /> — not defaulted to zero
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/covenants`}>
              Explore covenants
            </Link>
            <Link className="button" href={`/${companyId}/simulate`}>
              Open simulate
            </Link>
            <Link className="button" href={`/${companyId}/evidence`}>
              Evidence & review
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-title">Challenge findings (blockers)</div>
          <div className="card-subtitle">
            Autonomous challenge against proposed conclusions — not a research memo.
          </div>
          {blockers.slice(0, 8).map((b) => (
            <div className="row" key={b.id}>
              <div>
                <div className="row-label">{b.category}</div>
                <div className="row-note">{b.statement}</div>
              </div>
              <Chip tone="tight">BLOCKER</Chip>
            </div>
          ))}
        </Card>

        <Card>
          <div className="card-title">Package facts (source-backed)</div>
          <div className="card-subtitle">Not capacity determinations.</div>
          {facts.slice(0, 6).map((f) => (
            <div className="row" key={f.id}>
              <div className="row-note">{f.statement}</div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  // Authentic evidence → Position bridge (fixture-backed; no Neon writes).
  // VE feed uses compileOperativeCovenantPackage (generic discovery).
  // Access-gated above — package registry lookup only, no tenant DB scrape.
  const authenticSlice = await loadAuthenticDashboardSlice(companyId);

  let readiness: Awaited<ReturnType<typeof loadCapacityReadiness>> | null = null;
  let rulebook: Awaited<ReturnType<typeof loadRulebookReadiness>> | null = null;
  let dashboard = null;
  let dashboardError: string | null = null;
  try {
    [readiness, rulebook] = await Promise.all([
      loadCapacityReadiness(companyId),
      loadRulebookReadiness(companyId),
    ]);
  } catch {
    dashboardError =
      "Live readiness loaders unavailable — fail closed on Neon path; authentic slice used when registered.";
  }
  try {
    dashboard = await getCompanyDashboard(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError) {
      dashboardError =
        err.code === "AMBIGUOUS"
          ? "Financial identity AMBIGUOUS — competing same-date snapshots; capacity withheld."
          : "No authenticated financial snapshot — engine position unavailable (not zero).";
    } else {
      dashboardError =
        dashboardError ?? "Position dashboard unavailable — fail closed; no invented figures.";
    }
  }

  // Provision-identity-aware GROSS selection — never first non-null metric.
  // Validates instrument, covenant family, entity scope, and governing source.
  // Distinct eligible amounts → AMBIGUOUS (null amount, fail closed).
  const grossSelection = selectSourceBackedGrossMm(
    grossCandidatesFromVerifiedExecutableCompile(authenticSlice?.verifiedExecutableCompile),
    {
      instrumentKey: authenticSlice?.verifiedExecutableCompile.instrumentKey ?? "",
      covenantFamily: "INDEBTEDNESS",
      requireOperativeSourceOnGoverning: true,
    },
  );
  const sourceBackedGrossMm =
    grossSelection.status === "RESOLVED" ? grossSelection.amountMillions : null;

  const missingForClaims = [
    ...(readiness?.blockers ?? []),
    ...(dashboardError ? [dashboardError] : []),
    ...(authenticSlice?.missingInputs ?? []),
    ...(grossSelection.status === "AMBIGUOUS" ? [grossSelection.reason] : []),
    ...(grossSelection.status === "NONE" && authenticSlice?.verifiedExecutableCompile
      ? [grossSelection.reason]
      : []),
  ];

  const securedSeparatedBase = separateCapacityClaimsFromProductView(null, {
    modeledAmountMillions: dashboard?.capacity.secured.remainingCapacity ?? null,
    bindingRestrictions: [
      dashboard?.capacity.secured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.secured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missingInputs: missingForClaims,
  });
  // Overlay SOURCE_BACKED_COMPILED_GROSS from the authentic VE feed when present.
  // Never promotes verified remaining / AVAILABLE from dashboard flags alone.
  const securedSeparated =
    sourceBackedGrossMm != null
      ? {
          ...securedSeparatedBase,
          grossContractual: presentCapacityClaim({
            claimKind: "GROSS_CONTRACTUAL",
            amountMillions: sourceBackedGrossMm,
            publicationLabel: "SOURCE_BACKED_COMPILED_GROSS",
          }),
          sourceEvidence: [
            ...securedSeparatedBase.sourceEvidence,
            ...(authenticSlice?.verifiedExecutableMetrics
              .map((m) => m.operativeSection)
              .filter((x): x is string => Boolean(x)) ?? []),
          ],
          missingInputs: [
            ...securedSeparatedBase.missingInputs,
            "SOURCE_BACKED_COMPILED_GROSS from authentic VE Position feed — verified remaining refused.",
          ],
          remainingAuthoritative: false,
        }
      : securedSeparatedBase;
  const unsecuredSeparated = separateCapacityClaimsFromProductView(null, {
    modeledAmountMillions: dashboard?.capacity.unsecured.remainingCapacity ?? null,
    bindingRestrictions: [
      dashboard?.capacity.unsecured.packageAuthoritative?.bindingProvisionCode,
      dashboard?.capacity.unsecured.binding?.documentName,
    ].filter((x): x is string => Boolean(x)),
    missingInputs: missingForClaims,
  });

  const fallbackReadiness = {
    companyId,
    status: "NO_FINANCIAL_SNAPSHOT" as const,
    canEvaluateExecutableCapacity: false,
    capacityAuthority: "NONE" as const,
    analyzedDocumentCount: 0,
    summaryCount: 0,
    permissionCount: 0,
    unverifiedPermissionCount: 0,
    provisionCount: 0,
    hasFinancialSnapshot: false,
    ns4ApprovedSnapshotCount: 0,
    approvedNorthStarSnapshotCount: 0,
    contractLedgerActiveCount: 0,
    phase3TrustedUnitCount: 0,
    phase3TrustedRuleCount: 0,
    headline: "No capacity path available",
    blockers: [dashboardError ?? "No financial snapshot"],
    guidance: "Provide authenticated evidence before publishing capacity.",
  };
  const fallbackRulebook = {
    companyId,
    stage: "DISCOVERED" as const,
    discoveredSummaries: 0,
    interpretedProvisions: 0,
    reviewedPermissions: 0,
    executablePermissions: 0,
    provisionRows: 0,
    blockers: ["Rulebook readiness unavailable"],
    headline: "Rulebook unavailable",
    note: "Fail closed",
  };

  // Prefer live dashboard + separated claims; otherwise authentic slice Position view;
  // always attach #311 separated claims when we build the live view.
  const view =
    readiness && rulebook && (dashboard != null || !authenticSlice)
      ? buildPositionView({
          companyId,
          dashboard,
          readiness,
          rulebook,
          dashboardError,
          separatedClaims: { secured: securedSeparated, unsecured: unsecuredSeparated },
        })
      : authenticSlice?.positionView
        ? {
            ...authenticSlice.positionView,
            separatedClaims: { secured: securedSeparated, unsecured: unsecuredSeparated },
          }
        : buildPositionView({
            companyId,
            dashboard: null,
            readiness: readiness ?? fallbackReadiness,
            rulebook: rulebook ?? fallbackRulebook,
            dashboardError,
            separatedClaims: { secured: securedSeparated, unsecured: unsecuredSeparated },
          });

  // Legacy package figures — MODELED / NOT VERIFIED. Dashboard utilizationRemainingAuthority
  // alone must NEVER publish AVAILABLE (#311 security remediation).
  const securedModeledAmount =
    dashboard?.capacity.secured.packageAuthoritative?.remainingCapacity ??
    authenticSlice?.positionView.sides[0]?.remaining.amountMillions ??
    null;
  const unsecuredModeledAmount =
    dashboard?.capacity.unsecured.packageAuthoritative?.remainingCapacity ?? null;
  const securedModeled = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: securedModeledAmount,
    remainingIsAuthoritative: false,
    publicationLabel:
      dashboard?.capacity.secured.packageAuthoritative?.label ?? "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: "Modeled package capacity not published for secured side.",
  });
  const unsecuredModeled = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: unsecuredModeledAmount,
    remainingIsAuthoritative: false,
    publicationLabel:
      dashboard?.capacity.unsecured.packageAuthoritative?.label ?? "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: "Modeled package capacity not published for unsecured side.",
  });
  const grossUnavailable = presentCapacityClaim({
    claimKind: sourceBackedGrossMm != null ? "GROSS_CONTRACTUAL" : "UNAVAILABLE",
    amountMillions: sourceBackedGrossMm,
    publicationLabel:
      sourceBackedGrossMm != null
        ? "SOURCE_BACKED_COMPILED_GROSS"
        : grossSelection.status === "AMBIGUOUS"
          ? "AMBIGUOUS"
          : "GROSS_CONTRACTUAL",
    unavailableReason:
      grossSelection.status === "AMBIGUOUS"
        ? grossSelection.reason
        : sourceBackedGrossMm == null
          ? grossSelection.reason ||
            "No provision-identity-resolved SOURCE_BACKED_COMPILED_GROSS for the applicable instrument/family/governing source — never invented."
          : null,
  });

  // Shared APPROVED NS-4 financial identity (same binder as capacity / simulation / Dashboard).
  const evaluationDate = sp.evaluationDate?.trim() || view.asOfDate || undefined;
  const authoritative = await loadAuthoritativeCapacity({
    companyId,
    evaluationDate,
  });
  const ns4Identity = await loadSharedNs4FinancialIdentity({
    companyId,
    evaluationDate,
    authoritative,
  });
  const ns4Financial = ns4Identity.bundle;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Position</div>
        <WorkflowJourney companyId={companyId} current="position" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Debt instruments, applicable permissions, and capacity claims from the shared engine — not hardcoded
          arithmetic. {view.authorityNote}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Overall claim status</div>
          <div className="row-value">
            <StatusChip code={view.overallStatus} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">As of</div>
          <div className="row-value">{view.asOfDate ?? "—"}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Last verified evidence date</div>
          <div className="row-value">
            {view.lastVerifiedEvidenceDate ?? (
              <StatusChip code="UNKNOWN" compact />
            )}
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {view.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/dashboard`}>
            Open full position dashboard
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
          <Link className="button" href={`/${companyId}/audit`}>
            Audit
          </Link>
          <Link className="button" href={`/${companyId}/certificates`}>
            Certificates
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title" data-slot="ns4-approved-financial-inputs">
          APPROVED NS-4 financial inputs (shared)
        </div>
        <div className="card-subtitle">
          Cutoff-bound certificate facts reused by debt/liens/investments/RP capacity and transaction
          simulation — not a Dashboard-only leverage tile. Gross IR ratio ≠ verified remaining.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Binder status</div>
          <div className="row-value">
            <Chip tone={ns4Financial.status === "APPROVED_BOUND" ? "pass" : "tight"}>{ns4Financial.status}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Authority</div>
          <div className="row-value" style={{ fontSize: 12 }}>
            {ns4Financial.authority.kind}
          </div>
        </div>
        <div className="row-note">{ns4Financial.authority.disclosure}</div>
        <div className="row-note">
          Bound snapshot: {ns4Financial.boundSnapshotId ?? "—"}
          {ns4Financial.financialInputFingerprint
            ? ` · fingerprint ${ns4Financial.financialInputFingerprint.slice(0, 16)}…`
            : ""}
          {ns4Financial.leverageIr.computedRatio
            ? ` · IR TNL ${ns4Financial.leverageIr.computedRatio}`
            : ""}
        </div>
        <div className="row-note">
          Identity vs authoritative capacity:{" "}
          {ns4Identity.identityConsistentWithAuthoritative == null
            ? "—"
            : ns4Identity.identityConsistentWithAuthoritative
              ? "consistent"
              : "MISMATCH"}
          {authoritative.certified.packagePresent
            ? " · VEP present"
            : " · VEP absent (certified execution blocked)"}
        </div>
        {ns4Financial.missingInputs.slice(0, 4).map((m) => (
          <div className="row-note" key={m}>
            • Missing: {m}
          </div>
        ))}
        <div className="row-note" style={{ marginTop: 8 }}>
          Reusable for: {ns4Financial.reusableFor.join(", ")}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/dashboard`}>
            Dashboard (same NS-4 identity)
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate (same NS-4 identity)
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Debt instruments</div>
        <div className="card-subtitle">From the shared financial-core capital structure — principal outstanding.</div>
        {view.instruments.length === 0 ? (
          <div className="row-note">
            <StatusChip code="NEEDS_INPUT" compact /> No instruments on an authenticated financial snapshot.
          </div>
        ) : (
          view.instruments.map((inst) => (
            <div className="row" key={inst.id}>
              <div>
                <div className="row-label">{inst.name}</div>
                <div className="row-note">
                  {inst.facilityType} · {inst.secured ? "secured" : "unsecured"}
                  {inst.governingDocumentId ? ` · doc ${inst.governingDocumentId}` : ""}
                </div>
              </div>
              <div className="row-value">
                {inst.amountMillions != null ? fmtM(inst.amountMillions) : "—"}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Applicable covenant permissions</div>
        <div className="row">
          <div className="row-label">Permission rows</div>
          <div className="row-value">{view.permissions.total}</div>
        </div>
        <div className="row">
          <div className="row-label">Counsel-verified (legal review)</div>
          <div className="row-value">{view.permissions.verified}</div>
        </div>
        <div className="row">
          <div className="row-label">Unverified promoted</div>
          <div className="row-value">{view.permissions.unverified}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Executable reported (rulebook)</div>
          <div className="row-value">{view.permissions.executableReported}</div>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Open verified rulebook
          </Link>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant discovery
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Capacity claims by side</div>
        <div className="card-subtitle">
          Separated claims from the shared capacity result. Gross ≠ modeled ≠ verified remaining.
          Null remaining is never converted into a modeled number. Legacy figures are MODELED / NOT
          VERIFIED — never labeled AVAILABLE. Source-backed VE GROSS (when registered) is
          SOURCE_BACKED_COMPILED_GROSS only.
        </div>
        <SeparatedCapacityPanel
          title="Secured"
          claims={
            view.separatedClaims?.secured ??
            separateCapacityClaimsFromProductView(null, {
              modeledAmountMillions: dashboard?.capacity.secured.remainingCapacity ?? null,
              bindingRestrictions: view.sides[0]?.sourceCitations ?? [],
              missingInputs: view.missingInputs,
            })
          }
        />
        <div style={{ marginTop: 16 }} />
        <SeparatedCapacityPanel
          title="Unsecured"
          claims={
            view.separatedClaims?.unsecured ??
            separateCapacityClaimsFromProductView(null, {
              modeledAmountMillions: dashboard?.capacity.unsecured.remainingCapacity ?? null,
              bindingRestrictions: view.sides[1]?.sourceCitations ?? [],
              missingInputs: view.missingInputs,
            })
          }
        />
        <div style={{ marginTop: 12 }}>
          <CapacityClaimRow
            label={
              sourceBackedGrossMm != null
                ? "Gross contractual (SOURCE_BACKED_COMPILED_GROSS)"
                : "Gross contractual (engine field absent)"
            }
            claim={grossUnavailable}
          />
          <CapacityClaimRow label="Secured — legacy side remaining (non-authoritative)" claim={securedModeled} />
          <CapacityClaimRow
            label="Unsecured — legacy side remaining (non-authoritative)"
            claim={unsecuredModeled}
          />
        </div>
        {view.sides.flatMap((s) => s.methodNotes).slice(0, 6).map((note, i) => (
          <div key={i} className="row-note">
            · {note}
          </div>
        ))}
      </Card>

      {authenticSlice ? (
        <Card>
          <div className="card-title">Source-backed covenant calculations</div>
          <div className="card-subtitle">
            Authentic EDGAR-backed package ({authenticSlice.packageKey}). Leaf rows are MODELED_LEAF
            fixtures quarantined from production calculation. Modeled vs remaining are distinct; null
            remaining is UNKNOWN (not zero). Hypothetical secured composition unpublished. Never AVAILABLE.
          </div>
          {authenticSlice.connectedMetrics.map((m) => (
            <div className="row" key={m.code}>
              <div>
                <div className="row-label">{m.label}</div>
                <div className="row-note">
                  {m.operativeSection} · {m.valueProvenance}
                  {m.quarantinedFromProductionCalculation ? " · QUARANTINED" : ""} ·{" "}
                  {m.authorityStatus} · modeled {m.claim.claimLabel}
                  {m.modeledCapacityMm != null ? ` ${fmtM(m.modeledCapacityMm)}` : " —"} · remaining{" "}
                  {m.remainingClaim.claimLabel}
                  {m.remainingCapacityMm != null ? ` ${fmtM(m.remainingCapacityMm)}` : " —"}
                  {m.refusalReason ? ` — ${m.refusalReason}` : ""}
                </div>
              </div>
              <div className="row-value">
                {m.amountMillions != null ? fmtM(m.amountMillions) : <StatusChip code="UNKNOWN" compact />}
              </div>
            </div>
          ))}
          <div className="row-note" style={{ marginTop: 8 }}>
            Production remaining published: {authenticSlice.productionRemainingPublished ? "yes" : "no"} ·
            Missing evidence rows: {authenticSlice.missingInputs.length}
          </div>
        </Card>
      ) : null}

      {authenticSlice?.verifiedExecutableCompile ? (
        <Card>
          <div className="card-title">Verified executable compile → Position (gross)</div>
          <div className="card-subtitle">
            Operative clause → compileFixedDollarBasket → evaluateVerifiedCapacity. Feeding Position:{" "}
            {authenticSlice.verifiedExecutableUnitsFeedingPosition}. Figures are
            SOURCE_BACKED_COMPILED_GROSS (not netted remaining; not customer AVAILABLE). Production
            capacity published:{" "}
            {authenticSlice.verifiedExecutableCompile.productionCapacityPublished ? "yes" : "no"}.
          </div>
          {authenticSlice.verifiedExecutableCompile.verifiedExecutableUnits.map((u) => (
            <div className="row" key={u.candidateId}>
              <div>
                <div className="row-label">
                  {u.sourceSectionRef} · {u.valueClass}
                </div>
                <div className="row-note">
                  {u.documentId} · fidelity={u.fidelityVerdict ?? "—"} · hypo={u.hypotheticalOutcome} ·
                  prod={u.productionOutcome}
                  {u.feedsPosition ? " · feeds Position" : " · refuse Position feed"}
                </div>
              </div>
              <div className="row-value">
                {u.sourceBackedGrossCapacityMm != null ? (
                  fmtM(u.sourceBackedGrossCapacityMm)
                ) : (
                  <Chip tone="navy">REFUSED</Chip>
                )}
              </div>
            </div>
          ))}
          {authenticSlice.verifiedExecutableMetrics.map((m) => (
            <div className="row" key={`ve-metric-${m.code}`}>
              <div>
                <div className="row-label">{m.label}</div>
                <div className="row-note">
                  {m.valueProvenance} · {m.claim.claimLabel}
                </div>
              </div>
              <div className="row-value">
                {m.amountMillions != null ? fmtM(m.amountMillions) : <StatusChip code="UNKNOWN" compact />}
              </div>
            </div>
          ))}
          <div className="row-note" style={{ marginTop: 8 }}>
            Path: {authenticSlice.verifiedExecutableCompile.path.join(" → ")} · trustedIdentity={" "}
            {authenticSlice.verifiedExecutableCompile.trustedIdentityActivation}
          </div>
        </Card>
      ) : null}

      {authenticSlice?.phase3Compile ? (
        <Card>
          <div className="card-title">Autonomous Phase 3 compile → dashboard</div>
          <div className="card-subtitle">
            Source excerpt → structure → package-graph → operative authority → deterministic
            extraction. Displayed: {authenticSlice.autonomouslyCompiledDisplayedCount}. Fact
            extraction only — not verified executable capacity IR. Not package CERTIFIED; not
            production AVAILABLE.
          </div>
          {authenticSlice.phase3Compile.compiledCovenants.map((c, i) => (
            <div className="row" key={`${c.documentId}-${i}`}>
              <div>
                <div className="row-label">
                  {c.documentId}
                  {c.sectionHint ? ` · §${c.sectionHint}` : ""}
                </div>
                <div className="row-note">
                  families: {c.familySignals.join(", ") || "—"} · thresholds:{" "}
                  {c.thresholdSignals.slice(0, 3).join(", ") || "—"} · OA:{" "}
                  {c.operativeAuthorityClassification ?? "—"} · governing:{" "}
                  {c.governingDocumentId ?? "null"}
                </div>
              </div>
              <Chip tone="navy">COMPILED</Chip>
            </div>
          ))}
          <div className="row-note" style={{ marginTop: 8 }}>
            Path: {authenticSlice.phase3Compile.path.join(" → ")} · productionAuthorityActive={" "}
            {String(authenticSlice.phase3Compile.productionAuthorityActive)} · trustedIdentity={" "}
            {authenticSlice.phase3Compile.trustedIdentityActivation}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="card-title">Missing inputs</div>
        {view.missingInputs.length === 0 ? (
          <div className="row-note">No readiness blockers reported.</div>
        ) : (
          view.missingInputs.map((m, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="NEEDS_INPUT" compact /> {m}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Review blockers</div>
        {view.reviewBlockers.length === 0 ? (
          <div className="row-note">No open review blockers from rulebook readiness.</div>
        ) : (
          view.reviewBlockers.map((b, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="REVIEW_REQUIRED" compact /> {b}
            </div>
          ))
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence & review journey
          </Link>
        </div>
      </Card>
    </div>
  );
}
