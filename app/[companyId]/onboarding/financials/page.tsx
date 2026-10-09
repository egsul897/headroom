import Link from "next/link";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtM } from "@/lib/format";
import { submitFinancialsAction } from "./actions";

export const metadata = { title: "Headroom — Onboarding financials" };
export const dynamic = "force-dynamic";

const FIELDS: { name: string; label: string; step?: string; required?: boolean }[] = [
  { name: "ebitda", label: "Headline EBITDA ($M) — confirm against contractual definition", required: true },
  { name: "restrictedGroupEbitda", label: "Restricted-group / Consolidated EBITDA ($M, optional if same as headline)", required: false },
  { name: "ebitdaAdjustmentsAmount", label: "Contractual EBITDA addbacks / adjustments ($M, optional)", required: false },
  { name: "cash", label: "Unrestricted cash & cash equivalents ($M)", required: true },
  { name: "totalDebtPrincipal", label: "Total debt principal ($M)", required: true },
  { name: "securedDebtPrincipal", label: "Secured debt principal ($M)", required: true },
  { name: "firstLienDebtPrincipal", label: "First-lien debt principal ($M, optional)", required: false },
  { name: "cumulativeNetIncomeSinceIssue", label: "Cumulative net income since issue ($M)", required: true },
  { name: "equityProceedsSinceIssue", label: "Equity proceeds since issue ($M)", required: true },
  { name: "interestExpense", label: "Interest expense ($M)", required: true },
  { name: "assumedNewDebtRatePct", label: "Assumed new-debt coupon (%)", step: "0.01", required: true },
  { name: "fixedCharges", label: "Fixed charges ($M, optional)", required: false },
  { name: "totalAssets", label: "Consolidated total assets ($M, optional — growers)", required: false },
];

export default async function OnboardingFinancialsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const submit = submitFinancialsAction.bind(null, companyId);
  const snapshots = await prisma.financialSnapshot.findMany({ where: { companyId }, orderBy: { asOfDate: "desc" } });

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Confirm financials</div>
        <div className="card-subtitle">
          Prefer figures proposed from a compliance certificate or CSV (Review → Promote). Use this form when those facts are
          missing. Headroom does not invent EBITDA, debt, or cash. This writes the snapshot the dashboard reads. GAAP figures
          are not assumed to equal contractually defined metrics (e.g. Consolidated EBITDA) — confirm definitional alignment
          before treating capacity as supported. Capacity remains NOT DETERMINABLE without an executable rulebook even after
          financials are saved.
        </div>
        <form action={submit} className="stack" style={{ gap: 10 }}>
          <div className="field">
            <div className="field-label">As of date</div>
            <div className="field-control">
              <input type="date" name="asOfDate" required style={{ fontFamily: "var(--font-mono)", fontSize: 14, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4, width: "100%" }} />
            </div>
          </div>
          {FIELDS.map((f) => (
            <div className="field" key={f.name}>
              <div className="field-label">{f.label}</div>
              <div className="field-control">
                <input
                  type="number"
                  name={f.name}
                  step={f.step ?? "0.01"}
                  required={f.required !== false}
                />
              </div>
            </div>
          ))}
          <div className="field">
            <div className="field-label">Contractual EBITDA defined term (optional)</div>
            <div className="field-control">
              <input
                type="text"
                name="contractualEbitdaTerm"
                placeholder="e.g. Consolidated EBITDA (Credit Agreement §1.01)"
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Testing period / date label (optional)</div>
            <div className="field-control">
              <input type="text" name="testingPeriod" placeholder="e.g. LTM ended 2026-06-30" style={{ width: "100%" }} />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Pro forma transaction / EBITDA adjustments narrative (optional)</div>
            <div className="field-control">
              <textarea
                name="proFormaAdjustments"
                rows={3}
                placeholder="Describe contractual addbacks, restricted-subsidiary scope, and pro forma transaction adjustments. GAAP ≠ contract metrics."
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
            Save financial state
          </button>
        </form>
      </Card>

      {snapshots.length > 0 && (
        <Card>
          <div className="card-title">Recorded snapshots</div>
          {snapshots.map((s) => (
            <div className="row" key={s.id}>
              <div className="row-label">{fmtDate(s.asOfDate)}</div>
              <div className="row-value">
                EBITDA {fmtM(Number(s.ebitda))} · Debt {fmtM(Number(s.totalDebt))} ({fmtM(Number(s.securedDebt))} secured) · Cash {fmtM(Number(s.cash))}
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="button-row">
          <Link href={`/${companyId}/onboarding/facilities`} className="button button-primary" style={{ textDecoration: "none" }}>
            Continue to Facility Mapping
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>
    </div>
  );
}
