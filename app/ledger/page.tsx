import { Banner, Card } from "@/components/ui";
import { Disclosure } from "@/components/Disclosure";
import { LEDGER_BASKET_LABELS, getLedgerEntries, getPosition } from "@/lib/coherent";
import { fmtM, fmtX, fmtDate } from "@/lib/format";
import { documentsWithRpWaterfall, simulateRestrictedPayment } from "@/lib/covenant-engine";
import { addLedgerEntry, deleteLedgerEntry } from "./actions";

export const metadata = { title: "Headroom — Ledger" };

export default async function LedgerPage() {
  const [{ data, position }, entries] = await Promise.all([getPosition(), getLedgerEntries()]);

  // amount=0 just walks each document's waterfall to report pool usage / capacity left, without allocating anything.
  const rpDocs = documentsWithRpWaterfall(data);
  const rpStats: { label: string; value: number }[] = [];
  let poolUsed = 0;
  let rpNotModeled = false;
  for (const doc of rpDocs) {
    const sim = simulateRestrictedPayment(data, position, doc.id, 0, "dividend");
    if (sim.status !== "clear") {
      rpNotModeled = true;
      continue;
    }
    poolUsed = sim.poolUsed;
    for (const step of doc.rpWaterfall!.steps) {
      const provision = position.provisionCapacities.get(`${doc.id}:${step.code}`)?.provision;
      rpStats.push({
        label: `${provision?.basketName ?? step.code} left`,
        value: sim.stepCapacitiesRemaining[step.code] ?? 0,
      });
    }
  }

  const debtSchedule = entries.filter((e) => e.basket === "DEBT_INCUR" || e.basket === "DEBT_REPAY");
  const equitySchedule = entries.filter((e) => e.basket === "EQUITY" || e.basket === "ASSET_SALE");

  return (
    <div className="stack">
      {rpDocs.length === 0 ? (
        <Banner tone="red">Not tested here: no document for this company has a restricted-payment basket configuration entered.</Banner>
      ) : rpNotModeled ? (
        <Banner tone="red">Restricted-payment pool usage could not be fully evaluated - see Simulate for details.</Banner>
      ) : (
        <div className="summary-band">
          <div className="summary-band-title">Restricted payment pool — shared by dividends, buybacks, and Investments</div>
          <div className="summary-band-stats">
            {rpStats.map((s) => (
              <div key={s.label}>
                <div className="summary-stat-value">{fmtM(s.value)}</div>
                <div className="summary-stat-label">{s.label}</div>
              </div>
            ))}
            <div>
              <div className="summary-stat-value">{fmtM(poolUsed)}</div>
              <div className="summary-stat-label">committed so far (dividends + Investments)</div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <div className="card-title">Public-record ledger</div>
        <div className="card-subtitle">
          Logs what&apos;s stated in filings: equity raises, debt incurrence/repayment, and asset-sale proceeds, plus
          any dividend/Investment amounts committed from the Simulate tab.
        </div>
        <div>
          {entries.length === 0 && <div className="muted">No ledger entries yet.</div>}
          {entries.map((e) => (
            <div key={e.id} className="ledger-entry">
              <div>
                <div className="row-label">{e.description}</div>
                <div className="row-note">
                  <span className="mono">{fmtDate(e.date)}</span> · {LEDGER_BASKET_LABELS[e.basket]}
                  {e.source ? ` · ${e.source}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                <span className="mono" style={{ fontWeight: 600, color: e.direction === "CREDIT" ? "var(--green)" : "var(--ink)" }}>
                  {e.direction === "CREDIT" ? "+" : "−"}
                  {fmtM(Math.abs(Number(e.amount)))}
                </span>
                <form action={deleteLedgerEntry.bind(null, e.id)}>
                  <button type="submit" className="button">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Sample officer&apos;s compliance certificate
            </div>
            <div className="card-subtitle">
              Illustrative only — computed live from the same position data as the Position tab, not tied to any
              specific section numbers.
            </div>
          </div>
        </div>
        <Disclosure closedLabel="Generate draft" openLabel="Hide draft">
          <div style={{ border: "1px solid var(--line)", borderRadius: 4, background: "#fffefb", padding: "22px 20px" }}>
            <div className="serif" style={{ textAlign: "center", fontSize: 16, fontWeight: 600, letterSpacing: "0.04em" }}>
              OFFICER&apos;S COMPLIANCE CERTIFICATE (ILLUSTRATIVE)
            </div>
            <div className="serif muted" style={{ textAlign: "center", fontStyle: "italic", fontSize: 13, marginTop: 2 }}>
              Modeled on typical compliance-certificate disclosure requirements
            </div>
            <div className="serif" style={{ fontSize: 14, lineHeight: 1.65, marginTop: 14 }}>
              The undersigned officer certifies, as of the latest financial snapshot: (i) the Total Net Leverage
              Ratio was <span className="mono">{fmtX(position.metrics.totalNetLeverage)}</span>; (ii) the Fixed
              Charge Coverage Ratio was <span className="mono">{fmtX(position.metrics.fixedChargeCoverage)}</span>;
              (iii) the Senior Secured Net Leverage Ratio was{" "}
              <span className="mono">{fmtX(position.metrics.seniorSecuredNetLeverage)}</span>; (iv) no Default or
              Event of Default has occurred and is continuing under any Debt Document.
            </div>
            <div className="serif" style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>
              Schedule A — Indebtedness incurred / repaid
            </div>
            {debtSchedule.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px dotted var(--line)" }}>
                <span className="serif" style={{ fontSize: 13.5 }}>{e.description}</span>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {e.direction === "CREDIT" ? "(" : ""}
                  {fmtM(Math.abs(Number(e.amount)))}
                  {e.direction === "CREDIT" ? ")" : ""}
                </span>
              </div>
            ))}
            <div className="serif" style={{ fontSize: 14, marginTop: 12, fontWeight: 600 }}>
              Schedule B — Equity proceeds &amp; asset sale credits
            </div>
            {equitySchedule.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px dotted var(--line)" }}>
                <span className="serif" style={{ fontSize: 13.5 }}>{e.description}</span>
                <span className="mono" style={{ fontSize: 12.5 }}>{fmtM(Number(e.amount))}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, alignItems: "flex-end" }}>
              <div>
                <div style={{ borderBottom: "1px solid var(--ink)", width: 160, height: 18 }} />
                <div className="serif muted" style={{ fontSize: 12, marginTop: 3 }}>Chief Financial Officer</div>
              </div>
              <span className="chip chip-tight">illustrative — not an actual filing</span>
            </div>
          </div>
        </Disclosure>
      </Card>

      <Card>
        <div className="card-title" style={{ marginBottom: 10 }}>Log an entry manually</div>
        <form action={addLedgerEntry} style={{ display: "grid", gap: 10 }}>
          <div className="button-row">
            <label className="button" style={{ cursor: "pointer" }}>
              <input type="radio" name="direction" value="CREDIT" defaultChecked style={{ marginRight: 6 }} />
              Credit (adds)
            </label>
            <label className="button" style={{ cursor: "pointer" }}>
              <input type="radio" name="direction" value="DEBIT" style={{ marginRight: 6 }} />
              Debit (uses)
            </label>
          </div>
          <label className="field">
            <span className="field-label">Category</span>
            <div className="field-control">
              <select name="basket" defaultValue="EQUITY">
                {Object.entries(LEDGER_BASKET_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="field">
              <span className="field-label">Amount ($M)</span>
              <div className="field-control">
                <input type="number" name="amount" defaultValue={50} min={0} step="any" />
              </div>
            </label>
            <label className="field">
              <span className="field-label">Description</span>
              <div className="field-control">
                <input type="text" name="description" placeholder="e.g. new revolver draw" />
              </div>
            </label>
          </div>
          <button type="submit" className="button-primary" style={{ padding: "11px 16px", border: "none", borderRadius: 5 }}>
            Log entry
          </button>
        </form>
      </Card>
    </div>
  );
}
