import { Banner, Card } from "@/components/ui";
import { ProvisionTrace } from "@/components/ProvisionTrace";
import { getCompany, getDefinedTermsByProvision, getDocuments, getEbitdaDefinitionsByDocument, getPosition } from "@/lib/coherent";
import { fmtCapacity } from "@/lib/format";

export const metadata = { title: "Headroom — Docs" };

/**
 * The Docs tab (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * reference/headroom-coherent.jsx's Docs tab, "each governing document with
 * terms and per-document EBITDA definition"). Generalized off app/docs/page.tsx
 * (Coherent-only) - same real citation-to-text chain (ProvisionTrace, driven
 * by lib/covenant-engine.ts's computed position, unmodified), companyId-scoped.
 *
 * Matthews has zero legacy CovenantProvision rows, so `position.documents` is
 * empty here - that's the correct, honest state (this legacy capacity view
 * genuinely has nothing to show for a solver-native-only company), not a bug.
 * The per-document EBITDA definition uses the new getEbitdaDefinitionsByDocument
 * (lib/coherent.ts) - a document with no EBITDA-named defined term entered
 * shows "Not sourced yet", never a fabricated formula.
 */
export default async function DocsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [{ position }, documents, definedTermsByProvision, ebitdaByDocument, company] = await Promise.all([
    getPosition(companyId),
    getDocuments(companyId),
    getDefinedTermsByProvision(companyId),
    getEbitdaDefinitionsByDocument(companyId),
    getCompany(companyId),
  ]);

  return (
    <div className="stack">
      {documents.length === 0 && (
        <Card>
          <div className="card-subtitle">No governing documents on record for this company.</div>
        </Card>
      )}

      {documents.map((doc) => {
        const capacity = position.documents.find((d) => d.documentId === doc.id);
        const ebitdaDef = ebitdaByDocument[doc.id];

        return (
          <Card key={doc.id}>
            <div className="card-title">{doc.name}</div>
            <div className="card-subtitle">Governs: {doc.governs}</div>

            {capacity ? (
              <>
                {capacity.securedBindingProvision ? (
                  <ProvisionTrace
                    provision={capacity.securedBindingProvision}
                    definedTerms={definedTermsByProvision[`${doc.id}:${capacity.securedBindingProvision.code}`] ?? []}
                    value={fmtCapacity(capacity.securedStatus, capacity.securedCapacity)}
                    note="binding constraint on secured capacity"
                  />
                ) : (
                  <div style={{ fontSize: 13, padding: "10px 0" }}>
                    <b>Secured capacity:</b> <span className="mono">{fmtCapacity(capacity.securedStatus, capacity.securedCapacity)}</span>{" "}
                    <span className="muted">
                      {capacity.securedStatus === "modeled" ? "— no single binding basket" : `— ${capacity.securedReason ?? "not tested here"}`}
                    </span>
                  </div>
                )}

                {capacity.unsecuredBindingProvision ? (
                  <ProvisionTrace
                    provision={capacity.unsecuredBindingProvision}
                    definedTerms={definedTermsByProvision[`${doc.id}:${capacity.unsecuredBindingProvision.code}`] ?? []}
                    value={fmtCapacity(capacity.unsecuredStatus, capacity.unsecuredCapacity)}
                    note="binding constraint on unsecured capacity"
                  />
                ) : (
                  <div style={{ fontSize: 13, padding: "10px 0" }}>
                    <b>Unsecured capacity:</b> <span className="mono">{fmtCapacity(capacity.unsecuredStatus, capacity.unsecuredCapacity)}</span>{" "}
                    <span className="muted">
                      {capacity.unsecuredStatus === "modeled" ? "— no single binding basket" : `— ${capacity.unsecuredReason ?? "not tested here"}`}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="row-note" style={{ padding: "6px 0" }}>
                Not tested here — this document has no legacy basket configuration entered against it. See Dashboard for solver-native permission coverage, if any.
              </div>
            )}

            <div className="trace" style={{ marginTop: 4 }}>
              <div className="trace-body" style={{ display: "block", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                <div className="trace-label">EBITDA definition</div>
                {ebitdaDef ? (
                  <details className="trace-term">
                    <summary>
                      <span className="trace-term-name">{ebitdaDef.termName}</span> <span className="section-ref">{ebitdaDef.sectionRef}</span>
                      {ebitdaDef.status !== "VERIFIED" && (
                        <span className="chip chip-tight" style={{ marginLeft: 8 }}>
                          {ebitdaDef.status === "DISPUTED" ? "disputed" : "unverified"}
                        </span>
                      )}
                    </summary>
                    <p className="trace-term-text">{ebitdaDef.fullText}</p>
                  </details>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Not sourced yet — no EBITDA-named defined term entered for this document.
                  </div>
                )}
              </div>
            </div>

            {doc.notes && (
              <Banner tone="amber">
                <span style={{ color: "inherit" }}>{doc.notes}</span>
              </Banner>
            )}
          </Card>
        );
      })}

      <Card style={{ background: "#fcfbf8" }}>
        <div style={{ fontSize: 13, lineHeight: 1.55 }} className="muted">
          <b style={{ color: "var(--ink)" }}>Design choice — capacity is ratio-capped.</b> Real high-yield practice
          lets a borrower stack general (non-ratio) baskets on top of ratio-tested capacity, which can legitimately
          push a leverage ratio past its headline number while still being fully permitted. This tool deliberately
          does not do that: every capacity figure here and on Dashboard/Simulate is capped at the ratio ceiling, so a
          red &quot;fails&quot; always means genuinely blocked, never a false alarm — this tool never reports an
          incurrence as allowed if the resulting ratio would breach its stated threshold. Individual general (non-
          ratio) basket sizes are shown at their full, larger size on the Dashboard tab for reference; only the
          combined capacity used for the verdict is conservative.
        </div>
      </Card>

      <Card style={{ background: "#fcfbf8" }}>
        <div style={{ fontSize: 13, lineHeight: 1.55 }} className="muted">
          <b style={{ color: "var(--ink)" }}>Defined-term text is illustrative, not sourced.</b> Expanding a citation
          above (click a row, then a term inside it) shows the defined term&apos;s actual text, so you can check the
          formula against the definition instead of trusting a section number. Any term still carrying an{" "}
          <span className="chip chip-tight">unverified</span> badge is a reconstruction in typical drafting style —
          {company.name} does not yet have that term checked against its executed document text. A lawyer checking
          the real documents can flip a term to verified (or flag it disputed) without touching the engine.
        </div>
      </Card>

      <footer className="app-footer">
        Every figure above is read live from covenant_provisions, financial_snapshots, and each document&apos;s
        capacity-formula configuration in Postgres — not hardcoded. Basket definitions not yet extracted from the
        underlying documents are omitted rather than guessed, which is why some verdicts on the Simulate tab only
        speak to one document. Not legal or investment advice.
      </footer>
    </div>
  );
}
