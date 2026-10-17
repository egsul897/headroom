import Link from "next/link";
import { ActionMenu } from "@/components/ActionMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { Card, Chip } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtM, maxCapacityDetail } from "@/lib/format";
import { STRUCTURAL_UNRESOLVED_NOTICE, type PerDocumentRemainingCapacity } from "@/lib/covenant-engine";
import { FinancialIdentityError } from "@/lib/financial-identity";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { loadStructuralUnresolvedPermissionIds } from "@/lib/product/customer-intelligence/structural-flags";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { loadAuthoritativeCapacity, type AuthoritativeCapacityResult } from "@/lib/product/north-star-workflow";

export const metadata = { title: "Headroom — Capacity" };

/**
 * The North-Star authoritative read must never take the whole page down
 * behind the generic error boundary, and must never be replaced with
 * invented figures either: on failure the card renders NEEDS_INPUT with
 * the load failure disclosed as evidence, and the readiness / rulebook
 * sections below still render from their own loaders. Certified capacity
 * is unavailable — never zero, never unlimited.
 */
function unavailableAuthoritativeCapacity(companyId: string, err: unknown): AuthoritativeCapacityResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    companyId,
    evaluationDate: null,
    status: "NEEDS_INPUT",
    authority: "NOT_CERTIFIED_4E",
    cutoff: {
      state: "UNAVAILABLE",
      reportingPeriodKey: null,
      asOf: null,
      approvedSnapshotId: null,
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
    },
    approvedSnapshotCount: 0,
    activeLedgerUsageCount: 0,
    ledgerUsages: [],
    snapshotFactKeys: [],
    certified: {
      packagePresent: false,
      capacityOutcome: null,
      blockers: ["AUTHORITATIVE_CAPACITY_LOAD_FAILED"],
      authorityNote:
        "Authoritative capacity could not be loaded, so no certified capacity is asserted. The load failure is disclosed below; treat certified capacity as unavailable, not as zero.",
    },
    legacy: {
      capacityAuthority: "NONE",
      canEvaluateExecutableCapacity: false,
      note: "Authoritative capacity loader failed; no North-Star capacity conclusion is drawn from this card.",
    },
    missingInputs: ["authoritative_capacity_load"],
    evidence: [`loadAuthoritativeCapacity failed: ${message}`],
  };
}

function methodLabel(method: PerDocumentRemainingCapacity["method"]): string {
  switch (method) {
    case "SOLVER_NATIVE_RECOMPUTED":
      return "Solver-native (full recomputation)";
    case "LEGACY_DECLARED_MINUS_TESTED_AMOUNT":
      return "Legacy (declared ceiling)";
    case "SOLVER_CLAMPED_TO_LEGACY":
      return "Solver clamped to legacy ceiling (fail-closed)";
    case "NOT_DETERMINABLE":
      return "Not determinable";
    case "SKIPPED_AMENDMENT":
      return "Amendment — no standalone capacity (effect via base)";
  }
}

function capacityClause(d: PerDocumentRemainingCapacity): string | null {
  const cites = (d.bindingConstraint ?? [])
    .map((c) => `${c.sectionRef}${c.permissionId ? ` (${c.permissionId})` : ""}`)
    .filter((cite) => cite.trim().length > 0);
  if (cites.length === 0) return null;
  return `${cites.join("; ")}. Clause text is not loaded.`;
}

function DocumentCapacityRow({
  d,
  structuralUnresolvedIds,
}: {
  d: PerDocumentRemainingCapacity;
  /** Phase E: permissions whose source provision's structural relationship is unresolved (display only). */
  structuralUnresolvedIds: Set<string>;
}) {
  const bindingStructurallyUnresolved = (d.bindingConstraint ?? []).some(
    (c) => c.permissionId != null && structuralUnresolvedIds.has(c.permissionId),
  );
  return (
    <div className="row" key={d.documentId}>
      <div>
        <div className="row-label">{d.documentName}</div>
        <div className="row-note">
          {methodLabel(d.method)}
          {d.reason ? ` — ${d.reason}` : ""}
        </div>
        {d.bindingConstraint && d.bindingConstraint.length > 0 && (
          <div className="row-note">
            Binding:{" "}
            {d.bindingConstraint
              .map((c) => `${c.documentId} ${c.sectionRef}${c.permissionId ? ` (${c.permissionId})` : ""}`)
              .join("; ")}
          </div>
        )}
        {bindingStructurallyUnresolved && <div className="row-note">{STRUCTURAL_UNRESOLVED_NOTICE}</div>}
        {maxCapacityDetail(d.maximumCapacity) && <div className="row-note">{maxCapacityDetail(d.maximumCapacity)}</div>}
      </div>
      <ProofTrigger
        className="row-value num figure-hit"
        proof={unloadedProof(
          d.documentName || "Capacity",
          d.remainingCapacity !== undefined ? fmtM(d.remainingCapacity) : null,
          FIGURE_INPUTS.capacityRemaining,
          { clause: capacityClause(d), review: methodLabel(d.method) },
        )}
      >
        {d.remainingCapacity !== undefined ? fmtM(d.remainingCapacity) : "Not evaluated"}
      </ProofTrigger>
    </div>
  );
}

function ReadinessBanner({
  readiness,
}: {
  readiness: Awaited<ReturnType<typeof loadCapacityReadiness>>;
}) {
  return (
    <Card>
      <div className="card-title">Capacity determination status</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Status</div>
        <div className="row-value">
          <StatusBadge status={readiness.status} />
        </div>
      </div>
      <div className="row-note" style={{ marginTop: 8 }}>
        Analyzed documents: {readiness.analyzedDocumentCount} · Summaries: {readiness.summaryCount} · Permissions:{" "}
        {readiness.permissionCount} · Provisions: {readiness.provisionCount} · Legacy FinancialState:{" "}
        {readiness.hasFinancialSnapshot ? "yes" : "no"} · NS-4 APPROVED: {readiness.approvedNorthStarSnapshotCount} ·
        4C ledger active: {readiness.contractLedgerActiveCount} · Authority:{" "}
        <StatusBadge status={readiness.capacityAuthority} />
      </div>
      {readiness.blockers.map((b, i) => (
        <div key={i} className="row-note">
          • {b}
        </div>
      ))}
      <div className="row-note" style={{ marginTop: 8 }}>
        {readiness.guidance}
      </div>
    </Card>
  );
}

/**
 * Capacity/Headroom page. Shows engine figures only when an executable rulebook
 * and financial snapshot exist. Otherwise fail-closed: never invents $0 or Unlimited.
 */
export default async function CapacityPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [readiness, rulebook, authoritative] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadRulebookReadiness(companyId),
    loadAuthoritativeCapacity({ companyId }).catch((err) => unavailableAuthoritativeCapacity(companyId, err)),
  ]);

  const northStarCard = (
    <Card>
      <div className="card-title">Provenance</div>
      <div className="card-subtitle">
        What this number is allowed to rest on: an APPROVED snapshot, an attributed ledger, and a verified path. Legacy
        engine figures stay labeled separately and are not the same claim.
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Status</div>
        <div className="row-value">
          <StatusBadge status={authoritative.status} />
        </div>
      </div>
      <div className="row">
        <div className="row-label">Authority</div>
        <div className="row-value">
          <StatusBadge status={authoritative.authority} />
        </div>
      </div>
      <div className="row-note" style={{ marginTop: 8 }}>
        Cutoff: {authoritative.cutoff.state}
        {authoritative.cutoff.reportingPeriodKey ? ` · ${authoritative.cutoff.reportingPeriodKey}` : ""}
        {authoritative.cutoff.cutoffSnapshotId
          ? ` · snapshot ${authoritative.cutoff.cutoffSnapshotId} (${authoritative.cutoff.cutoffSnapshotStatus})`
          : ""} ·
        APPROVED snapshots: {authoritative.approvedSnapshotCount} · Active 4C usages:{" "}
        {authoritative.activeLedgerUsageCount}
      </div>
      {authoritative.missingInputs.map((m, i) => (
        <div key={i} className="row-note">
          • Missing: {m}
        </div>
      ))}
      {authoritative.evidence.map((e, i) => (
        <div key={`e-${i}`} className="row-note">
          • {e}
        </div>
      ))}
      <div className="row-note" style={{ marginTop: 8 }}>
        {authoritative.certified.authorityNote}
      </div>
      <div className="row-note">{authoritative.legacy.note}</div>
    </Card>
  );

  const toolbar = (
    <header className="page-head">
      <div>
        <p className="page-kicker">Capacity</p>
        <h1 className="page-question">How much capacity can we rely on?</h1>
        <p className="page-answer">{readiness.headline}</p>
      </div>
      <div className="page-toolbar">
        <Link className="button button-primary" href={`/${companyId}/covenants`}>
          Covenant review
        </Link>
        <ActionMenu
          label="More actions"
          items={[
            { href: `/${companyId}/certificates`, label: "Certificates" },
            { href: `/${companyId}/ledger`, label: "Ledger" },
            { href: `/${companyId}/ask`, label: "Ask Headroom" },
            { href: `/${companyId}/onboarding/documents`, label: "Upload documents" },
          ]}
        />
      </div>
    </header>
  );

  if (!readiness.canEvaluateExecutableCapacity) {
    return (
      <div className="page-frame">
        {toolbar}
        {northStarCard}
        <ReadinessBanner readiness={readiness} />
        <Card>
          <div className="card-title">Legal rulebook stage</div>
          <div className="card-subtitle">{rulebook.headline}</div>
          <div className="row">
            <div className="row-label">Stage</div>
            <div className="row-value">
              <StatusBadge status={rulebook.stage} />
            </div>
          </div>
          <div className="row-note" style={{ marginTop: 8 }}>
            Discovered summaries: {rulebook.discoveredSummaries} · Interpreted: {rulebook.interpretedProvisions} ·
            Reviewed permissions: {rulebook.reviewedPermissions} · Executable permissions:{" "}
            {rulebook.executablePermissions}
          </div>
          {rulebook.blockers.map((b, i) => (
            <div key={i} className="row-note">
              • {b}
            </div>
          ))}
          <div className="row-note" style={{ marginTop: 8 }}>
            {rulebook.note}
          </div>
        </Card>
        <Card>
          <div className="card-title">Secured / unsecured debt capacity</div>
          <div className="card-subtitle">
            <StatusBadge status="NOT DETERMINABLE" /> — no executable capacity evaluation for this workspace.
          </div>
          <ProofTrigger proof={unloadedProof("Secured / unsecured debt capacity", null, FIGURE_INPUTS.capacityRemaining, { review: "Not determinable" })}>
            How we got this
          </ProofTrigger>
          <div className="row-note" style={{ marginTop: 8 }}>
            Discovery-level covenant summaries (if any) explain restrictions and baskets in text; they do not establish
            remaining contractual headroom. Required for a supported capacity figure: (1) operative amendment resolution,
            (2) approved executable rulebook, (3) approved financial snapshot, (4) ledger utilization where baskets are
            usage-tracked.
          </div>
        </Card>
      </div>
    );
  }

  let dash: Awaited<ReturnType<typeof getCompanyDashboard>>;
  try {
    dash = await getCompanyDashboard(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError) {
      return (
        <div className="page-frame">
          {toolbar}
          <ReadinessBanner
            readiness={{
              ...readiness,
              canEvaluateExecutableCapacity: false,
              status: "NO_FINANCIAL_SNAPSHOT",
              headline: "Financial identity unresolved — capacity cannot be evaluated without inventing inputs.",
              blockers: [...readiness.blockers, err.message],
            }}
          />
          <Card>
            <div className="card-subtitle">
              <StatusBadge status="NOT DETERMINABLE" /> — {err.message}
            </div>
          </Card>
        </div>
      );
    }
    throw err;
  }

  const { capacity } = dash;
  // Phase E provenance for the binding citations below (display only —
  // no figure on this page reads this set).
  const structuralUnresolvedIds = await loadStructuralUnresolvedPermissionIds(companyId);

  return (
    <div className="page-frame">
      {toolbar}
      {northStarCard}
      <ReadinessBanner readiness={readiness} />
      <Card>
        <div className="card-title">Legacy engine capacity (LEGACY_ENGINE · NOT_CERTIFIED_4E)</div>
        <div className="card-subtitle">
          Figures below use counsel-compiled Permissions + covenant-engine against dated FinancialState — not Phase 4B
          APPROVED snapshots or certified 4A–4E.
        </div>
      </Card>

      <Card>
        <div className="card-title">Secured debt capacity</div>
        <div className="card-subtitle">
          Overall:{" "}
          {capacity.secured.remainingCapacity !== undefined ? fmtM(capacity.secured.remainingCapacity) : "Not evaluated"}{" "}
          {capacity.secured.binding && <Chip tone="navy">binding: {capacity.secured.binding.documentName}</Chip>}
        </div>
        <ProofTrigger
          proof={unloadedProof(
            "Secured debt capacity",
            capacity.secured.remainingCapacity !== undefined ? fmtM(capacity.secured.remainingCapacity) : null,
            FIGURE_INPUTS.capacityRemaining,
            { review: "Legacy engine" },
          )}
        >
          How we got this
        </ProofTrigger>
        {capacity.secured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} structuralUnresolvedIds={structuralUnresolvedIds} />
        ))}
      </Card>

      <Card>
        <div className="card-title">Unsecured debt capacity</div>
        <div className="card-subtitle">
          Overall:{" "}
          {capacity.unsecured.remainingCapacity !== undefined
            ? fmtM(capacity.unsecured.remainingCapacity)
            : "Not evaluated"}{" "}
          {capacity.unsecured.binding && <Chip tone="navy">binding: {capacity.unsecured.binding.documentName}</Chip>}
        </div>
        <ProofTrigger
          proof={unloadedProof(
            "Unsecured debt capacity",
            capacity.unsecured.remainingCapacity !== undefined ? fmtM(capacity.unsecured.remainingCapacity) : null,
            FIGURE_INPUTS.capacityRemaining,
            { review: "Legacy engine" },
          )}
        >
          How we got this
        </ProofTrigger>
        {capacity.unsecured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} structuralUnresolvedIds={structuralUnresolvedIds} />
        ))}
      </Card>

      <Card>
        <div className="card-title">How to read this page</div>
        <div className="row-note">
          &ldquo;Maximum capacity&rdquo; is the document/side&apos;s own request-amount-independent ceiling, recomputed
          fresh (never a stored figure minus an amount). &ldquo;Not evaluated&rdquo; means the engine has no governing
          configuration to test against for this side — it is never rendered as $0 or Unlimited. See Simulate for a
          specific hypothetical transaction&apos;s full contractual result and explainability trace.
        </div>
      </Card>
    </div>
  );
}
