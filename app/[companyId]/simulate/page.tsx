import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { VerifiedSimulatePanel } from "@/components/VerifiedSimulatePanel";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { parseSimulateHandoffSearchParams } from "@/lib/product/unified-position/simulate-handoff";
import {
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { requireAssembledCfoWorkflow } from "@/lib/customer-workflow/require-workflow-access";
import { ns4EvidenceLines } from "@/lib/customer-workflow/assemble-cfo-workflow";
import { SeparatedCapacityPanel } from "@/components/customer-workflow/SeparatedCapacityPanel";
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
  const asOfDate = handoff.evaluationDate ? new Date(`${handoff.evaluationDate}T12:00:00.000Z`) : new Date();
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

  const [readiness, data, documents, definedTermsByProvision, solverContext, verified] =
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
    ]);
  const verifiedSummary = summarizeVerifiedSimulate(verified);
  const simView = workflow.simulate;
  const authoritative = workflow.authoritativeCapacity;
  const ns4Lines = ns4EvidenceLines(authoritative);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Simulate</div>
        <WorkflowJourney companyId={companyId} current="simulate" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          {readiness.headline} Uses the <strong>same capacity state</strong> as Position, including NS-4
          APPROVED snapshot evidence. Cross-domain verified simulation runs through the shared gates
          (VEP + cutoff + 4C + REQUIRE) — never invents a package. Simulations never modify the live
          customer ledger.
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
        <div className="card-title">NS-4 / North-Star financial evidence</div>
        <div className="card-subtitle">
          Same APPROVED snapshots and cutoff identity as Position. Cross-domain verified simulate
          refuses AVAILABLE without VEP + certified gates — NS-4 alone never upgrades remaining.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Authoritative status</div>
          <div className="row-value">
            <Chip tone={authoritative.status === "CERTIFIED_EXECUTED" ? "pass" : "tight"}>
              {authoritative.status}
            </Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Authority</div>
          <div className="row-value">{authoritative.authority}</div>
        </div>
        <div className="row">
          <div className="row-label">Transaction kind</div>
          <div className="row-value">{kind}</div>
        </div>
        <div className="row">
          <div className="row-label">Evaluation date</div>
          <div className="row-value">{evaluationDate}</div>
        </div>
        <div className="row">
          <div className="row-label">APPROVED snapshots</div>
          <div className="row-value">{authoritative.approvedSnapshotCount}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Active 4C ledger usages</div>
          <div className="row-value">{authoritative.activeLedgerUsageCount}</div>
        </div>
        {ns4Lines.map((line, i) => (
          <div key={`ns4-${i}`} className="row-note">
            · {line}
          </div>
        ))}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/position`}>
            Position (shared NS-4 identity)
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity / North-Star
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
