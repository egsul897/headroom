"use client";

import { useState } from "react";
import { certificateCsv, presentVerdict, type CertificateModel } from "@/lib/ux/present";

export function CertificateSheet({ model, initialOpen = false }: { model: CertificateModel; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);

  function downloadCsv() {
    const blob = new Blob([certificateCsv(model)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compliance-certificate.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="ux-block" aria-label="Compliance certificate">
      <div className="ux-block-head">
        <h2>Compliance certificate</h2>
        <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
          Export certificate
        </button>
      </div>
      {open ? (
        <div className="certificate-printing">
          <article className="certificate-sheet">
            <header className="certificate-head">
              <p className="proof-kicker">Compliance certificate</p>
              <h3>{model.company}</h3>
              <p>{model.period?.trim() ? model.period : "Period: Needs input"}</p>
            </header>
            {model.lines.length === 0 ? (
              <p className="proof-missing">No covenants are loaded.</p>
            ) : (
              <table className="certificate-table">
                <thead>
                  <tr>
                    <th scope="col">Covenant</th>
                    <th scope="col">Required</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Headroom</th>
                    <th scope="col">Result</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {model.lines.map((line) => {
                    const verdict = presentVerdict(line);
                    return (
                      <tr key={line.name}>
                        <td>{line.name}</td>
                        <td>{line.required?.trim() ? line.required : "Needs input"}</td>
                        <td>{line.actual?.trim() ? line.actual : "Needs input"}</td>
                        <td>{line.headroom?.trim() ? line.headroom : "Needs input"}</td>
                        <td data-verdict={verdict}>{verdict}</td>
                        <td>{line.citation?.trim() ? line.citation : "Citation is not loaded"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <footer className="certificate-sign">
              <p>Prepared by</p>
              <span>Needs input</span>
              <p>Reviewed by</p>
              <span>Needs input</span>
              <p>Date</p>
              <span>Needs input</span>
            </footer>
            <div className="certificate-actions">
              <button type="button" className="button button-primary" onClick={() => window.print()}>
                Download PDF
              </button>
              <button type="button" className="button" onClick={downloadCsv}>
                Download Excel
              </button>
              <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </article>
        </div>
      ) : (
        <p className="ux-note">The sheet uses the covenant lines already on this page. Unevaluated lines print as NOT EVALUATED.</p>
      )}
    </section>
  );
}
