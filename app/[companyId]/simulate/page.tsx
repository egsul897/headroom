import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { VerifiedSimulatePanel } from "@/components/VerifiedSimulatePanel";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { FinancialIdentityError } from "@/lib/financial-identity";
import { resolveCanonicalFinancialAsOf } from "@/lib/product/canonical-financial-asof";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { parseSimulateHandoffSearchParams } from "@/lib/product/unified-position/simulate-handoff";
import {
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { requireAssembledCfoWorkflow } from "@/lib/customer-workflow/require-workflow-access";
import { SeparatedCapacityPanel } from "@/components/customer-workflow/SeparatedCapacityPanel";
import { CrossDomainSimulatePanel } from "@/components/CrossDomainSimulatePanel";
import { evaluateSimulateCrossDomainAcquisition } from "@/lib/product/cross-domain-simulate";
import { loadSharedNs4FinancialIdentity } from "@/lib/product/ns4-shared-financial-identity";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * Simulate — runs the shared covenant engine. A simulation is not a legal approval.
 * Without an executable rulebook and financial snapshot, expect NOT DETERMINABLE —
 * never a fabricated pass. Optional ?action=&amount=&secured=&asOf= seeds from Ask.
 * Verified path is attempted via existing gates (no VEP invented); blockers shown precisely.
 * Access-gated before sensitive loaders; capacity state matches Position.
 */
export default async function SimulatePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const sp = searchParams ? await searchParams : {};
  const handoff = parseSimulateHandoffSearchParams(sp);
  // Prefer handoff evaluation date; else shared FinancialState as-of (not wall-clock today when state exists).
  let asOfDate: Date;
  if (handoff.evaluationDate) {
    asOfDate = new Date(`${handoff.evaluationDate}T12:00:00.000Z`);
  } else {
    try {
      asOfDate = await resolveCanonicalFinancialAsOf(companyId);
    } catch (err) {
      if (err instanceof FinancialIdentityError && err.code === "AMBIGUOUS") throw err;
      asOfDate = new Date();
    }
  }
  const evaluationDate =
    handoff.evaluationDate ?? asOfDate.toISOString().slice(0, 10);
  const amountMillions = handoff.amountMillions ?? 0;
  const kind =
    handoff.action === "rp"
      ? "RESTRICTED_PAYMENT"
      : handoff.action === "investment"
        ? "INVESTMENT"
        : handoff.secured === false
          ? "UNSECURED_DEBT"
          : "SECURED_DEBT";

  // Authorize before any parallel sensitive loads (assembler also gates).
  const workflow = await requireAssembledCfoWorkflow({
    companyId,
    simulateAmountMillions: amountMillions,
    simulateKind: kind,
    evaluationDate,
  });

  const [readiness, data, documents, definedTermsByProvision, solverContext, verified, ns4Identity] =
    await Promise.all([
      loadCapacityReadiness(companyId),
      loadCovenantDataOrEmpty(companyId, asOfDate),
      getDocuments(companyId),
      getDefinedTermsByProvision(companyId),
      buildSolverContext(companyId, asOfDate),
      attemptVerifiedSimulate({
        companyId,
        evaluationDate,
        amountMillions,
        kind,
        secured: handoff.secured,
        verifiedPackage: null,
      }),
      loadSharedNs4FinancialIdentity({
        companyId,
        evaluationDate,
        authoritative: workflow.authoritativeCapacity,
      }),
    ]);
  const verifiedSummary = summarizeVerifiedSimulate(verified);
  const simView = workflow.simulate;
  const ns4Financial = ns4Identity.bundle;
  // Same CompanyCovenantData as Position; utilizationAuthority null → verified remaining withheld.
  // PRODUCTION surface — synthetic remaining stripped inside #340 sanitizer.
  const crossDomainAcquisition = evaluateSimulateCrossDomainAcquisition({
    data,
    amountMillions: amountMillions > 0 ? amountMillions : 150,
    evaluationDate,
    utilizationAuthority: null,
  });
  return (
    <div className="stack">
      <Card>
        <div className="card-title">Simulate</div>
        <WorkflowJourney companyId={companyId} current="simulate" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          {readiness.headline} Uses the <strong>same capacity state</strong> as Position. Simulations never modify the live transaction ledger.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Status</div>
          <div className="row-value">
            <Chip tone={readiness.canEvaluateExecutableCapacity ? "pass" : "tight"}>{readiness.status}</Chip>{" "}
            <StatusChip code={simView.overallStatus} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">Selected transaction path</div>
          <div className="row-value">{simView.selectedTransactionPath ?? "— (none selected)"}</div>
        </div>
        <div className="row">
          <div className="row-label">Amount / currency</div>
          <div className="row-value">
            {simView.amountMillions != null ? `${simView.amountMillions} ${simView.currency}` : "—"}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Posts to ledger</div>
          <div className="row-value">
            <Chip tone="pass">false</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Result authority</div>
          <div className="row-value">
            <StatusChip code="HYPOTHETICAL" /> unless verified path is executable
          </div>
        </div>
        {!readiness.canEvaluateExecutableCapacity && (
          <>
            {readiness.blockers.map((b, i) => (
              <div key={i} className="row-note">
                • {b}
              </div>
            ))}
            <div className="row-note" style={{ marginTop: 8 }}>
              The form below still runs the <strong>real</strong> shared simulation engine. Without capacity formulas and
              an approved financial snapshot, expect <Chip tone="tight">NOT DETERMINABLE</Chip> / unmet input results —
              not a fabricated pass.
            </div>
          </>
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/position`}>
            Position
          </Link>
          <Link className="button" href={`/${companyId}/audit`}>
            Audit
          </Link>
          <Link className="button" href={`/${companyId}/review`}>
            Review
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title" data-slot="ns4-approved-financial-inputs">
          APPROVED NS-4 financial inputs (shared with Position / Dashboard)
        </div>
        <div className="card-subtitle">
          Same cutoff-bound snapshot identity feeds Simulate capacity/simulation inputs. Gross IR ≠
          verified remaining. Authority: {ns4Financial.authority.kind}.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Binder status</div>
          <div className="row-value">
            <Chip tone={ns4Financial.status === "APPROVED_BOUND" ? "pass" : "tight"}>{ns4Financial.status}</Chip>
          </div>
        </div>
        <div className="row-note">
          Bound snapshot: {ns4Financial.boundSnapshotId ?? "—"}
          {ns4Financial.financialInputFingerprint
            ? ` · fingerprint ${ns4Financial.financialInputFingerprint.slice(0, 16)}…`
            : ""}
          {ns4Financial.leverageIr.computedRatio
            ? ` · IR TNL ${ns4Financial.leverageIr.computedRatio}`
            : ""}
        </div>
        <div className="row-note">{ns4Financial.authority.disclosure}</div>
        <div className="row-note">
          Identity vs authoritative capacity:{" "}
          {ns4Identity.identityConsistentWithAuthoritative == null
            ? "—"
            : ns4Identity.identityConsistentWithAuthoritative
              ? "consistent"
              : "MISMATCH"}
          {" · fingerprint "}
          {ns4Financial.financialInputFingerprint?.slice(0, 16) ?? "—"}
        </div>
        {ns4Financial.missingInputs.slice(0, 4).map((m) => (
          <div className="row-note" key={m}>
            • Missing: {m}
          </div>
        ))}
        {ns4Financial.missingInputs.length > 4 && (
          <div className="row-note">(+{ns4Financial.missingInputs.length - 4} more missing inputs)</div>
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/dashboard`}>
            Dashboard (same NS-4 identity)
          </Link>
          <Link className="button" href={`/${companyId}/position`}>
            Position (same NS-4 identity)
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Pre-transaction capacity (shared with Position)</div>
        {simView.preTransactionCapacity ? (
          <SeparatedCapacityPanel title="Secured path capacity state" claims={simView.preTransactionCapacity} />
        ) : (
          <div className="row-note">Capacity state unavailable — not invented.</div>
        )}
      </Card>

      <Card>
        <div className="card-title">Preconditions / missing inputs / unsupported effects</div>
        {simView.preconditions.map((p, i) => (
          <div key={`p-${i}`} className="row-note">
            · precondition: {p}
          </div>
        ))}
        {simView.missingInputs.map((m, i) => (
          <div key={`m-${i}`} className="row-note">
            · <StatusChip code="NEEDS_INPUT" compact /> {m}
          </div>
        ))}
        {simView.unsupportedEffects.map((u, i) => (
          <div key={`u-${i}`} className="row-note">
            · <StatusChip code="UNSUPPORTED" compact /> {u}
          </div>
        ))}
        {simView.capacityConsumed && (
          <div className="row-note">· {simView.capacityConsumed}</div>
        )}
      </Card>

      <Card>
        <div className="card-title">Trace & provenance</div>
        {simView.traceAndProvenance.length === 0 ? (
          <div className="row-note">No verified-path trace (package not supplied).</div>
        ) : (
          simView.traceAndProvenance.map((t, i) => (
            <div key={i} className="row-note">
              · {t}
            </div>
          ))
        )}
      </Card>

      <VerifiedSimulatePanel summary={verifiedSummary} evaluationDate={evaluationDate} />

      {/* Rule 86: never silently assume an amount. The cross-domain
          panel models a $150M acquisition when no amount was
          supplied — say so, so the CFO does not read the default
          as their transaction. */}
      {amountMillions <= 0 && (
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Illustrative $150M acquisition below — no amount was supplied, so this panel models a default scenario.
          Enter an amount to model your transaction.
        </div>
      )}
      <CrossDomainSimulatePanel evaluation={crossDomainAcquisition} />

      <SimulateClient
        companyId={companyId}
        data={data}
        documents={documents}
        definedTermsByProvision={definedTermsByProvision}
        initialHandoff={handoff}
        solverContext={{
          ...solverContext,
          activationState: {
            ...solverContext.activationState,
            unknownKeysArray: [...solverContext.activationState.unknownKeys],
          },
        }}
      />
    </div>
  );
}
