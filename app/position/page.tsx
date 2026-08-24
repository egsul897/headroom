import { Card, Row } from "@/components/ui";
import { COHERENT_INDENTURE_ID, getCompany, getDebtTranches, getPosition } from "@/lib/coherent";
import { fmtM, fmtX } from "@/lib/format";
import type { EvaluatedProvision } from "@/lib/covenant-engine";

export const metadata = { title: "Headroom — Position" };

function cap(provisionCapacities: Map<string, EvaluatedProvision>, documentId: string, code: string): EvaluatedProvision {
  const evaluated = provisionCapacities.get(`${documentId}:${code}`);
  if (!evaluated) throw new Error(`Missing provision ${documentId}:${code}`);
  return evaluated;
}

export default async function PositionPage() {
  const [{ data, position }, tranches, company] = await Promise.all([getPosition(), getDebtTranches(), getCompany()]);
  const fin = data.financials;
  const { metrics } = position;

  const ratioDebt = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "ratio_debt_fccr");
  const facA = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "facility_flat");
  const facB = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "facility_grower");
  const milaSec = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "mila_secured");
  const milaUnsec = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "mila_unsecured");
  const genDebt = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "general_debt");
  const lienRatio = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "lien_ratio");
  const lienGeneral = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "lien_general");
  const lienCap = lienRatio.capacity + lienGeneral.capacity;

  const builder = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "rp_builder");
  const genRP = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "rp_general");
  const rpGate = cap(position.provisionCapacities, COHERENT_INDENTURE_ID, "rp_ratio_gate");
  const rpCapacityUnconstrained = rpGate.gate?.open ?? false;

  const totalDebt = tranches.reduce((s, t) => s + Number(t.amount), 0);
  const securedDebt = tranches.filter((t) => t.secured).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="stack">
      <div className="summary-band">
        <div className="summary-band-title">
          Maximum incremental debt — the most {company.name.replace(/ Corp\.?$/, "")} can incur without tripping
          either document
        </div>
        <div className="summary-band-stats">
          <div>
            <div className="summary-stat-value">{fmtM(position.crossDocumentSecuredCapacity)}</div>
            <div className="summary-stat-label">secured</div>
          </div>
          <div>
            <div className="summary-stat-value">{fmtM(position.crossDocumentUnsecuredCapacity)}</div>
            <div className="summary-stat-label">unsecured</div>
          </div>
          <div>
            <div className="summary-stat-value">
              {rpCapacityUnconstrained ? "open" : fmtM(builder.capacity + genRP.capacity)}
            </div>
            <div className="summary-stat-label">
              restricted payments{rpCapacityUnconstrained ? " — ratio prong satisfied" : ""}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <div className="card-title">FY26 financials (10-K)</div>
        <div className="card-subtitle">
          Covenant EBITDA is an estimated build-up from the public reconciliation (net earnings + tax +
          interest + D&amp;A + SBC, restructuring, impairments and integration costs, less gains on sales) —
          the defined term is bespoke.
        </div>
        <table className="plain">
          <tbody>
            <tr>
              <td>4Q Consolidated EBITDA (est.)</td>
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
              <td>CNI since 12/10/21 (est.)</td>
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

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Debt capacity — 2029 Notes Indenture
          </div>
          <span className="section-ref">§3.3</span>
        </div>
        <Row
          label="Ratio Debt"
          sref={ratioDebt.provision.sectionRef}
          value={fmtM(ratioDebt.capacity)}
          note={`at ${fin.assumedNewDebtRatePct}% assumed coupon; FCCR now ${fmtX(metrics.fixedChargeCoverage)}`}
        />
        <Row
          label="Credit Facilities basket — flat"
          sref={facA.provision.sectionRef}
          value={fmtM(facA.capacity)}
          note="net of TLA/TLB outstanding"
        />
        <Row label="Credit Facilities basket — grower" sref={facB.provision.sectionRef} value={fmtM(facB.capacity)} />
        <Row
          label="MILA — secured prong"
          sref={milaSec.provision.sectionRef}
          value={fmtM(milaSec.capacity)}
          note={`SSNL now ${fmtX(metrics.seniorSecuredNetLeverage)}`}
        />
        <Row label="MILA — unsecured prong" sref={milaUnsec.provision.sectionRef} value={fmtM(milaUnsec.capacity)} />
        <Row label="General debt basket" sref={genDebt.provision.sectionRef} value={fmtM(genDebt.capacity)} />
        <Row
          label="Lien capacity for secured debt"
          sref="Permitted Liens cl. (24)+(25)"
          value={fmtM(lienCap)}
          note="secured incurrences must also fit here"
        />
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Restricted Payments — 2029 Notes Indenture
          </div>
          <span className="section-ref">§3.4</span>
        </div>
        {builder.components?.map((c) => (
          <Row key={c.label} label={c.label} sref={c.sectionRef} value={fmtM(c.value)} />
        ))}
        <Row label="General RP basket" sref={genRP.provision.sectionRef} value={fmtM(genRP.capacity)} />
        <div className="row">
          <div>
            <div className="row-label">Ratio RP (unlimited)</div>
            <span className="section-ref">{rpGate.provision.sectionRef}</span>
          </div>
          <span className={`chip chip-${rpGate.gate?.open ? "pass" : "trip"}`}>
            {rpGate.gate?.open ? "open" : "locked"} · {fmtX(metrics.totalNetLeverage)}
          </span>
        </div>
        <div className="card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
          {rpCapacityUnconstrained
            ? "The equity raise cut net leverage below the ratio prong and added to the builder basket — RP capacity is effectively unconstrained by the indenture today."
            : "The ratio prong is currently closed; RP capacity is limited to the builder and general baskets above."}
        </div>
      </Card>

      <Card>
        <div className="card-title">Capital structure (6/30/26)</div>
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
