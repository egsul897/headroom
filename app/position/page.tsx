import { Banner, Card, Row } from "@/components/ui";
import { ProvisionTrace } from "@/components/ProvisionTrace";
import {
  getCompany,
  getDebtTranches,
  getDefinedTermsByProvision,
  getFinancialSnapshot,
  getPosition,
} from "@/lib/coherent";
import { fmtCapacity, fmtM, fmtX } from "@/lib/format";
import {
  documentsWithRpWaterfall,
  simulateRestrictedPayment,
  type CapacityExpr,
  type CompanyCovenantData,
  type CovenantPosition,
  type LabeledSubtotal,
} from "@/lib/covenant-engine";
import type { DefinedTermLite } from "@/lib/coherent";

export const metadata = { title: "Headroom — Position" };
// Vercel deployment fix: see app/page.tsx's identical comment - this page
// queries Prisma directly with no dynamic route segment above it.
export const dynamic = "force-dynamic";

/** Every provision code a capacity expression tree references, in first-appearance order - the generic replacement for hardcoding a document's basket codes into the page. */
function collectRefCodes(expr: CapacityExpr | undefined, seen: Set<string>, order: string[]) {
  if (!expr) return;
  if (expr.op === "REF") {
    if (!seen.has(expr.code)) {
      seen.add(expr.code);
      order.push(expr.code);
    }
    return;
  }
  for (const item of expr.items) collectRefCodes(item, seen, order);
}

function dedupeLabeled(subtotals: LabeledSubtotal[]): LabeledSubtotal[] {
  const seen = new Set<string>();
  const out: LabeledSubtotal[] = [];
  for (const s of subtotals) {
    if (seen.has(s.label)) continue;
    seen.add(s.label);
    out.push(s);
  }
  return out;
}

/** Restricted-payment headroom across every document with a modeled RP waterfall, net of ledger usage - generic over however many such documents exist (0, 1, or more), never assuming exactly one. */
function summarizeRpHeadroom(data: CompanyCovenantData, position: CovenantPosition): { display: string; note?: string } {
  const rpDocs = documentsWithRpWaterfall(data);
  if (rpDocs.length === 0) return { display: "Not tested" };

  // amount=0 just walks the waterfall to report basket capacity remaining / gate status, without allocating anything.
  const results = rpDocs.map((doc) => simulateRestrictedPayment(data, position, doc.id, 0, "dividend"));
  if (results.some((r) => r.status === "review_required")) return { display: "Review required" };
  if (results.some((r) => r.status === "not_tested")) return { display: "Not tested" };

  const gateOpen = rpDocs.some((doc) => {
    const gateCode = doc.rpWaterfall?.ratioGateCodeByKind.dividend;
    const evaluated = gateCode ? position.provisionCapacities.get(`${doc.id}:${gateCode}`) : undefined;
    return evaluated?.gate?.open ?? false;
  });
  if (gateOpen) return { display: "Open", note: "ratio prong satisfied" };

  const remaining = results.reduce(
    (sum, r) => sum + Object.values(r.stepCapacitiesRemaining).reduce((s, v) => s + v, 0),
    0
  );
  return { display: fmtM(remaining) };
}

export default async function PositionPage() {
  const [{ data, position }, tranches, company, definedTermsByProvision, snapshot] = await Promise.all([
    getPosition(),
    getDebtTranches(),
    getCompany(),
    getDefinedTermsByProvision(),
    getFinancialSnapshot(),
  ]);
  const fin = data.financials;
  const { metrics } = position;
  const termsFor = (documentId: string, code: string): DefinedTermLite[] => definedTermsByProvision[`${documentId}:${code}`] ?? [];

  const totalDebt = tranches.reduce((s, t) => s + Number(t.amount), 0);
  const securedDebt = tranches.filter((t) => t.secured).reduce((s, t) => s + Number(t.amount), 0);
  const rpSummary = summarizeRpHeadroom(data, position);

  return (
    <div className="stack">
      <div className="summary-band">
        <div className="summary-band-title">
          Maximum incremental debt — the most {company.name.replace(/ Corp\.?$/, "")} can incur without tripping
          any governing document
        </div>
        <div className="summary-band-stats">
          <div>
            <div className="summary-stat-value">{fmtCapacity(position.crossDocumentSecured.status, position.crossDocumentSecured.capacity)}</div>
            <div className="summary-stat-label">secured</div>
          </div>
          <div>
            <div className="summary-stat-value">{fmtCapacity(position.crossDocumentUnsecured.status, position.crossDocumentUnsecured.capacity)}</div>
            <div className="summary-stat-label">unsecured</div>
          </div>
          <div>
            <div className="summary-stat-value">{rpSummary.display}</div>
            <div className="summary-stat-label">restricted payments{rpSummary.note ? ` — ${rpSummary.note}` : ""}</div>
          </div>
        </div>
      </div>

      <Card>
        <div className="card-title">Latest financial snapshot</div>
        {snapshot?.notes && <div className="card-subtitle">{snapshot.notes}</div>}
        <table className="plain">
          <tbody>
            <tr>
              <td>Consolidated EBITDA</td>
              <td className="mono">{fmtM(fin.ebitda)}</td>
            </tr>
            <tr>
              <td>Unrestricted cash</td>
              <td className="mono">{fmtM(fin.cash)}</td>
            </tr>
            <tr>
              <td>Interest expense (LTM)</td>
              <td className="mono">{fmtM(fin.interestExpense)}</td>
            </tr>
            <tr>
              <td>Cumulative net income since issue</td>
              <td className="mono">{fmtM(fin.cumulativeNetIncome)}</td>
            </tr>
            <tr>
              <td>Equity proceeds since issue</td>
              <td className="mono">{fmtM(fin.equityProceedsSinceIssue)}</td>
            </tr>
            <tr>
              <td>Assumed new-debt coupon</td>
              <td className="mono">{fin.assumedNewDebtRatePct}%</td>
            </tr>
          </tbody>
        </table>
        <div className="card-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
          Total debt {fmtM(totalDebt)} · secured {fmtM(securedDebt)} · FCCR {fmtX(metrics.fixedChargeCoverage)} ·
          SSNL {fmtX(metrics.seniorSecuredNetLeverage)}
        </div>
      </Card>

      {data.documents.map((doc) => {
        const capacityResult = position.documents.find((d) => d.documentId === doc.id);
        if (!capacityResult) return null;

        const securedSeen = new Set<string>();
        const securedCodes: string[] = [];
        collectRefCodes(doc.capacityFormulas?.secured, securedSeen, securedCodes);
        const unsecuredSeen = new Set(securedSeen);
        const unsecuredCodes: string[] = [];
        collectRefCodes(doc.capacityFormulas?.unsecured, unsecuredSeen, unsecuredCodes);
        const allCodes = [...securedCodes, ...unsecuredCodes];
        const labeledSubtotals = dedupeLabeled([
          ...capacityResult.securedLabeledSubtotals,
          ...capacityResult.unsecuredLabeledSubtotals,
        ]);

        if (allCodes.length === 0 && capacityResult.securedStatus === "not_tested" && capacityResult.unsecuredStatus === "not_tested") {
          return null;
        }

        return (
          <Card key={doc.id}>
            <div className="card-title">{doc.name} — debt capacity</div>
            {capacityResult.securedStatus !== "modeled" && (
              <Banner tone="red">Secured: {capacityResult.securedReason ?? "Not tested here."}</Banner>
            )}
            {capacityResult.unsecuredStatus !== "modeled" && (
              <Banner tone="red">Unsecured: {capacityResult.unsecuredReason ?? "Not tested here."}</Banner>
            )}
            {allCodes.map((code) => {
              const evaluated = position.provisionCapacities.get(`${doc.id}:${code}`);
              if (!evaluated) return null;
              return (
                <ProvisionTrace
                  key={code}
                  provision={evaluated.provision}
                  definedTerms={termsFor(doc.id, code)}
                  value={fmtCapacity(evaluated.status, evaluated.capacity)}
                />
              );
            })}
            {labeledSubtotals.map((s) => (
              <Row key={s.label} label={`= ${s.label}`} value={fmtCapacity(s.status, s.value)} note="derived subtotal" />
            ))}
          </Card>
        );
      })}

      {documentsWithRpWaterfall(data).map((doc) => {
        const steps = doc.rpWaterfall!.steps;
        const gateCodes = Object.values(doc.rpWaterfall!.ratioGateCodeByKind);
        return (
          <Card key={`${doc.id}-rp`}>
            <div className="card-title">{doc.name} — restricted payments</div>
            {steps.map((s) => {
              const evaluated = position.provisionCapacities.get(`${doc.id}:${s.code}`);
              if (!evaluated) return null;
              return (
                <div key={s.code}>
                  <ProvisionTrace
                    provision={evaluated.provision}
                    definedTerms={termsFor(doc.id, s.code)}
                    value={fmtCapacity(evaluated.status, evaluated.capacity)}
                  />
                  {evaluated.components?.map((c) => (
                    <Row key={c.label} label={c.label} sref={c.sectionRef} value={fmtM(c.value)} />
                  ))}
                </div>
              );
            })}
            {gateCodes.map((code) => {
              const evaluated = position.provisionCapacities.get(`${doc.id}:${code}`);
              if (!evaluated) return null;
              return (
                <ProvisionTrace
                  key={code}
                  provision={evaluated.provision}
                  definedTerms={termsFor(doc.id, code)}
                  value={
                    evaluated.status === "modeled" && evaluated.gate ? (
                      <span className={`chip chip-${evaluated.gate.open ? "pass" : "trip"}`}>
                        {evaluated.gate.open ? "open" : "locked"} · {fmtX(evaluated.gate.measure)}
                      </span>
                    ) : (
                      fmtCapacity(evaluated.status, evaluated.capacity)
                    )
                  }
                />
              );
            })}
          </Card>
        );
      })}

      <Card>
        <div className="card-title">Capital structure</div>
        {tranches.map((t) => (
          <div key={t.id} className="row">
            <div>
              <div className="row-label">{t.name}</div>
              <div className="row-note">
                {t.secured ? "secured" : "unsecured"} · {t.documentName}
              </div>
            </div>
            <div className="row-value">{fmtM(Number(t.amount))}</div>
          </div>
        ))}
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label" style={{ fontWeight: 600 }}>
            Total principal
          </div>
          <div className="row-value">{fmtM(totalDebt)}</div>
        </div>
      </Card>
    </div>
  );
}
