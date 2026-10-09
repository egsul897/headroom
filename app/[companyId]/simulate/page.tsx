import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { UnifiedSimulateClient } from "@/components/product/UnifiedSimulateClient";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import {
  loadVerifiedCustomerState,
  structuredTransactionFromSearchParams,
  type StructuredTransactionKind,
} from "@/lib/product/unified-customer";

export const metadata = { title: "Headroom — Simulate" };
export const dynamic = "force-dynamic";

/**
 * Simulate — runs the shared covenant engine via /api/product/simulate.
 * A simulation is not a legal approval. Amount changes clear stale evidence.
 */
export default async function SimulatePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const sp = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const handoff = structuredTransactionFromSearchParams(qs);

  const [readiness, state] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadVerifiedCustomerState(companyId, {
      evaluationDate: handoff?.evaluationDate ?? null,
    }),
  ]);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Simulation readiness</div>
        <div className="card-subtitle">{readiness.headline}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Status</div>
          <div className="row-value">
            <Chip tone={readiness.canEvaluateExecutableCapacity ? "pass" : "tight"}>{readiness.status}</Chip>
          </div>
        </div>
        <div className="row">
          <div className="row-label">Verified state</div>
          <div className="row-value mono" style={{ fontSize: 12 }}>
            {state.stateFingerprint}
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
              The form below still runs the <strong>real</strong> shared simulation engine via the product API.
              Without capacity formulas and an approved financial snapshot, expect{" "}
              <Chip tone="tight">NOT DETERMINABLE</Chip> / unmet input results — not a fabricated pass.
              Simulations never modify the live transaction ledger.
            </div>
          </>
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/position`}>
            Position
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity status
          </Link>
        </div>
      </Card>

      <UnifiedSimulateClient
        companyId={companyId}
        stateFingerprint={state.stateFingerprint}
        asOfDateIso={state.asOfDateIso}
        initialKind={(handoff?.kind as StructuredTransactionKind | undefined) ?? undefined}
        initialAmount={handoff?.amountMillions ?? undefined}
        initialSecured={handoff?.secured ?? null}
        initialDate={handoff?.evaluationDate ?? state.asOfDateIso}
        initialCurrency={handoff?.currency ?? "USD"}
        handoffId={handoff?.handoffId ?? null}
        handoffQuestion={handoff?.rawQuestion ?? null}
      />
    </div>
  );
}
