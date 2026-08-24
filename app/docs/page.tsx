import { Banner, Card } from "@/components/ui";
import { ProvisionTrace } from "@/components/ProvisionTrace";
import { getDefinedTermsByProvision, getDocuments, getPosition } from "@/lib/coherent";
import { fmtM } from "@/lib/format";

export const metadata = { title: "Headroom — Docs" };

export default async function DocsPage() {
  const [{ position }, documents, definedTermsByProvision] = await Promise.all([
    getPosition(),
    getDocuments(),
    getDefinedTermsByProvision(),
  ]);

  return (
    <div className="stack">
      {documents.map((doc) => {
        const capacity = position.documents.find((d) => d.documentId === doc.id);
        if (!capacity) return null;
        return (
          <Card key={doc.id}>
            <div className="card-title">{doc.name}</div>
            <div className="card-subtitle">Governs: {doc.governs}</div>

            {capacity.securedBindingProvision ? (
              <ProvisionTrace
                provision={capacity.securedBindingProvision}
                definedTerms={definedTermsByProvision[`${doc.id}:${capacity.securedBindingProvision.code}`] ?? []}
                value={fmtM(capacity.securedCapacity)}
                note="binding constraint on secured capacity"
              />
            ) : (
              <div style={{ fontSize: 13, padding: "10px 0" }}>
                <b>Secured capacity:</b> <span className="mono">{fmtM(capacity.securedCapacity)}</span>{" "}
                <span className="muted">— no binding basket configured</span>
              </div>
            )}

            {capacity.unsecuredBindingProvision ? (
              <ProvisionTrace
                provision={capacity.unsecuredBindingProvision}
                definedTerms={definedTermsByProvision[`${doc.id}:${capacity.unsecuredBindingProvision.code}`] ?? []}
                value={fmtM(capacity.unsecuredCapacity)}
                note="binding constraint on unsecured capacity"
              />
            ) : (
              <div style={{ fontSize: 13, padding: "10px 0" }}>
                <b>Unsecured capacity:</b> <span className="mono">{fmtM(capacity.unsecuredCapacity)}</span>{" "}
                <span className="muted">— no binding basket configured</span>
              </div>
            )}

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
          does not do that: every capacity figure here and on Position/Simulate is capped at the ratio ceiling, so a
          red &quot;fails&quot; always means genuinely blocked, never a false alarm — this tool never reports an
          incurrence as allowed if the resulting ratio would breach its stated threshold. The individual basket
          sizes (facility grower, general debt, general liens) are shown at their full, larger size on the Position
          tab for reference; only the combined capacity used for the verdict is conservative.
        </div>
      </Card>

      <Card style={{ background: "#fcfbf8" }}>
        <div style={{ fontSize: 13, lineHeight: 1.55 }} className="muted">
          <b style={{ color: "var(--ink)" }}>Defined-term text is illustrative, not sourced.</b> Expanding a citation
          above (click a row, then a term inside it) shows the defined term's actual text, so you can check the
          formula against the definition instead of trusting a section number. That text is currently a
          reconstruction in typical high-yield drafting style — we don&apos;t have Coherent&apos;s executed indenture
          or credit agreement text to extract from — which is why every term still carries an{" "}
          <span className="chip chip-tight">unverified</span> badge. A lawyer checking the real documents can flip a
          term to verified (or flag it disputed) without touching the engine.
        </div>
      </Card>

      <footer className="app-footer">
        Every figure above is read live from covenant_provisions, financial_snapshots, and each document&apos;s
        capacity-formula configuration in Postgres — not hardcoded. Basket definitions not yet extracted from the
        underlying documents (e.g. the Credit Agreement&apos;s §2.21 incremental sizing, §6.04 Investment basket,
        and §6.06 RP basket) are omitted rather than guessed, which is why some verdicts on the Simulate tab only
        speak to one document. Not legal or investment advice.
      </footer>
    </div>
  );
}
