/**
 * Corpus integrity for the independent product-acceptance fixtures.
 *
 * Guards: (1) every manifest validates against product-acceptance-expectations.v1; (2) pinned sha256 per document
 * matches the bytes on disk (an edited fixture must be re-pinned deliberately); (3) no proprietary issuer names or
 * live-evidence identifiers leak into the synthetic corpus; (4) every expectation points at a document that exists in
 * its package; (5) the manifests are self-declared as independently authored.
 */
import { describe, expect, it } from "vitest";
import { ExpectationsManifestSchema, SEVERITIES, corpusIdentity, hashDrift, loadCorpus } from "../../scripts/product-acceptance/corpus";

const packages = loadCorpus();

/** Names of real issuers / live-evidence subjects used elsewhere in this repository. None may appear in the synthetic corpus. */
const FORBIDDEN_REAL_NAMES = [/conmed/i, /gibraltar/i, /\bCNMD\b/, /\bROCK\b/];
/** Live-evidence identifiers: a synthetic manifest must never cite a live discovery candidate or sealed evidence path. */
const FORBIDDEN_LIVE_IDS = [/discovery-candidate:[0-9a-f]{24}/, /ir-rule:[0-9a-f]{24}/, /phase-3-live-validation/, /phase-3-conmed/];

describe("product-acceptance corpus integrity", () => {
  it("contains the eight packages A–H", () => {
    expect(packages.map((p) => p.packageId)).toEqual([
      "pkg-a-basic-credit-agreement",
      "pkg-b-multi-document",
      "pkg-c-amendment-supersession",
      "pkg-d-qualitative-restrictions",
      "pkg-e-structural-ambiguity",
      "pkg-f-capacity-ledger-honesty",
      "pkg-g-adversarial-evidence",
      "pkg-h-unseen-composition",
    ]);
  });

  for (const pkg of packages) {
    describe(pkg.packageId, () => {
      it("manifest validates against the v1 schema", () => {
        expect(ExpectationsManifestSchema.safeParse(pkg.manifest).success).toBe(true);
      });

      it("pinned document hashes match the bytes on disk", () => {
        expect(hashDrift(pkg)).toEqual([]);
      });

      it("declares independent authorship and a synthetic issuer", () => {
        expect(pkg.manifest.authorship).toMatch(/Not derived from compiler output/);
        expect(pkg.manifest.issuer).toMatch(/\(synthetic\)$/);
      });

      it("contains no proprietary names or live-evidence identifiers", () => {
        const blobs = [JSON.stringify(pkg.manifest), ...pkg.documents.map((d) => d.text)];
        for (const blob of blobs) {
          for (const re of FORBIDDEN_REAL_NAMES) expect(blob).not.toMatch(re);
          for (const re of FORBIDDEN_LIVE_IDS) expect(blob).not.toMatch(re);
        }
      });

      it("every expectation references a document declared in the package", () => {
        const ids = new Set(pkg.manifest.documents.map((d) => d.documentId));
        const refs = [
          ...pkg.manifest.operativeState.exact.map((e) => e.documentId),
          ...pkg.manifest.structure.exact.map((e) => e.documentId),
          ...pkg.manifest.definitions.exact.map((e) => e.documentId),
          ...pkg.manifest.covenants.map((c) => c.documentId),
          ...pkg.manifest.covenants.flatMap((c) => c.crossReferences.map((x) => x.documentId)),
          ...pkg.manifest.sharedCaps.map((s) => s.documentId),
          ...pkg.manifest.nonOperative.map((n) => n.documentId),
        ];
        for (const r of refs) expect(ids.has(r), `unknown documentId ${r}`).toBe(true);
      });

      it("every mustContain string for a covenant or structure node is literally present in its document", () => {
        const textOf = (id: string) => pkg.documents.find((d) => d.documentId === id)?.text ?? "";
        for (const c of pkg.manifest.covenants) {
          const doc = c.operativeTextDocumentId ?? c.documentId;
          for (const s of c.mustContain) expect(textOf(doc), `${c.id} mustContain "${s}"`).toContain(s);
          for (const cond of c.conditions) if (cond.textContains) expect(textOf(doc), `${c.id} condition "${cond.textContains}"`).toContain(cond.textContains);
        }
        for (const s of pkg.manifest.structure.exact) {
          for (const t of [...(s.ownTextContains ?? []), ...(s.fullTextContains ?? [])]) expect(textOf(s.documentId), `${s.sectionRef} text "${t}"`).toContain(t);
        }
        for (const n of pkg.manifest.nonOperative) expect(textOf(n.documentId)).toContain(n.textContains);
      });

      it("every prohibited claim carries a recognised severity", () => {
        for (const p of pkg.manifest.prohibitedClaims) expect(SEVERITIES).toContain(p.severityIfAsserted);
      });
    });
  }

  it("corpus identity is a stable digest of every document and manifest hash", () => {
    const a = corpusIdentity(packages);
    const b = corpusIdentity(loadCorpus());
    expect(a.corpusSha256).toBe(b.corpusSha256);
    expect(a.packages).toHaveLength(8);
  });
});
