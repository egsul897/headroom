/**
 * ADVERSARIAL FOUNDATION ASSURANCE AUDIT — Investigation 3: Provenance Chain
 * (source artifact -> extracted text -> structural occurrence -> discovery
 * candidate -> retrieved context item -> operative provision). Audit-only,
 * in-memory. Drives real, unmodified production functions:
 * lib/contract-model/compiler/stage-structure.ts, structural-index.ts,
 * context-retrieval/pipeline.ts (buildCovenantContextBundle), and inspects
 * the real, current (post-3F.1.2) type shapes in discovery/types.ts,
 * context-retrieval/types.ts, amendment/types.ts, coverage-audit/types.ts.
 *
 * FINDING SUMMARY (see final report for severity/classification):
 *  1. The FORWARD chain is real and complete at every stage checked:
 *     DiscoveredCandidate carries discoveryId + structuralNodeIds (real
 *     occurrence identity, post-3F.1.2) + sourceCitation + discoveryRunVersion.
 *     CovenantContextBundle carries originatingDiscoveryId +
 *     originatingStructuralNodeIds + retrievalAlgorithmVersion +
 *     contentIdentity.
 *  2. The BACKWARD chain has a real gap at exactly one join: an individual
 *     ContextItem inside CovenantContextBundle.items[] carries
 *     structuralNodeId + documentId + sourceCitation + retrievalPath (a
 *     chain of itemIds WITHIN the same bundle), but NOT the bundle's own
 *     discoveryId. A ContextItem is only traceable back to the discovery
 *     candidate that originated its bundle as long as the caller ALSO still
 *     holds a reference to the containing CovenantContextBundle - if an item
 *     is ever extracted, logged, or persisted independently of its bundle,
 *     the discoveryId link is unrecoverable from the item alone. This is
 *     confirmed here by runtime property inspection of real ContextItem
 *     objects produced by the real, unmodified pipeline, not merely a type
 *     read.
 *  3. Coverage-audit's independent inventory items (coverage-audit/types.ts)
 *     correctly carry NO discoveryId/bundleId reference at all - by design,
 *     per the Independence Contract (Architecture Invariant #17/#18) - this
 *     is verified as a POSITIVE finding, not a gap, and is explicitly
 *     distinguished from finding 2 above.
 */
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildCovenantContextBundle, type PackageAccess } from "../../lib/contract-model/compiler/context-retrieval/pipeline";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { readFile } from "node:fs/promises";

const SAMPLE_TEXT = `
ARTICLE VI NEGATIVE COVENANTS

Section 6.01. Indebtedness. The Borrower will not, and will not permit any Restricted Subsidiary to, incur any Indebtedness, except Indebtedness incurred pursuant to this Agreement in an aggregate principal amount not to exceed $50,000,000.

Section 6.02. Liens. The Borrower will not create any Lien on any property, except Permitted Liens.
`;

function buildRealIndex(documentId: string, text: string) {
  const nodes = parseDocumentStructure({ documentId, label: documentId, text });
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), [], []);
  return { nodes, index };
}

describe("3a. Forward chain: DiscoveredCandidate really carries discoveryId + real occurrence identity + version", () => {
  it("field shape confirmed against the real, current discovery/types.ts", async () => {
    const src = await readFile(new URL("../../lib/contract-model/compiler/discovery/types.ts", import.meta.url), "utf-8");
    const iface = src.match(/export interface DiscoveredCandidate \{[\s\S]*?\n\}/)![0];
    expect(iface).toMatch(/discoveryId: string/);
    expect(iface).toMatch(/structuralNodeIds: string\[\]/);
    expect(iface).toMatch(/sourceCitation: string/);
    expect(iface).toMatch(/discoveryRunVersion: string/);
  });
});

describe("3b. Backward gap: an individual ContextItem cannot, on its own, name the discoveryId of the bundle it came from", () => {
  it("REPRODUCED at runtime: real ContextItem objects produced by buildCovenantContextBundle have no discoveryId/bundleId property at all", () => {
    const documentId = "fixture-audit-prov-doc";
    const { index } = buildRealIndex(documentId, SAMPLE_TEXT);

    const candidate: DiscoveredCandidate = {
      discoveryId: "discovery-real-6.01-indebtedness",
      documentId,
      structuralNodeKeys: [`${documentId}::6.01`],
      structuralNodeIds: [index.findNodesByRef(documentId, "6.01")[0]!.nodeId],
      normalizedSourceRef: "6.01",
      families: ["INDEBTEDNESS"] as never,
      role: "PROHIBITION" as never,
      roleRaw: "PROHIBITION",
      roleNormalizationStatus: "VALID_CANONICAL" as never,
      familiesRaw: ["INDEBTEDNESS"],
      familiesNormalizationStatus: "VALID_CANONICAL" as never,
      description: "Indebtedness covenant.",
      multipleRulesLikely: false,
      definedTermDependencyLikely: false,
      discoveryMethods: ["DETERMINISTIC_SIGNAL"] as never,
      evidenceSignals: ["negative-covenant-verb"],
      reviewStatus: "AUTO_ACCEPTED" as never,
      confidence: 0.9,
      sourceCitation: "Section 6.01",
      discoveryRunVersion: "phase-2b-discovery.v-fixture",
      supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
      supersessionReason: "test fixture - no real supersession index applied",
    };

    const access: PackageAccess = { index, packageGraph: null, exactTermsByDocument: new Map() };
    const bundle = buildCovenantContextBundle({ candidate, packageKey: "fixture-audit-prov-pkg", companyId: "fixture-audit-prov-co", instrumentKey: null }, access);

    expect(bundle.originatingDiscoveryId).toBe(candidate.discoveryId); // the BUNDLE-level link is real and present.
    expect(bundle.items.length).toBeGreaterThan(0);

    for (const item of bundle.items) {
      // ACTUAL, OBSERVED behavior: none of the real fields on a ContextItem
      // name the discoveryId. The only way back to it is via the still-held
      // parent CovenantContextBundle object.
      expect(Object.prototype.hasOwnProperty.call(item, "discoveryId")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, "bundleId")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(item, "originatingDiscoveryId")).toBe(false);
    }
  });

  it("confirmed at the type level: ContextItem's real field list (context-retrieval/types.ts) has no discoveryId-shaped field, while CovenantContextBundle (one level up) does", async () => {
    const src = await readFile(new URL("../../lib/contract-model/compiler/context-retrieval/types.ts", import.meta.url), "utf-8");
    const contextItemIface = src.match(/export interface ContextItem \{[\s\S]*?\n\}/)![0];
    expect(contextItemIface).not.toMatch(/discoveryId/);
    const bundleIface = src.match(/export interface CovenantContextBundle \{[\s\S]*?\n\}/)![0];
    expect(bundleIface).toMatch(/originatingDiscoveryId: string/);
  });
});

describe("3c. Coverage-audit's independent inventory correctly carries no discovery-side identity - by design, not a gap", () => {
  it("confirmed: coverage-audit/types.ts's inventory item interfaces never reference discoveryId/bundleId anywhere", async () => {
    const src = await readFile(new URL("../../lib/contract-model/compiler/coverage-audit/types.ts", import.meta.url), "utf-8");
    expect(src).not.toMatch(/discoveryId/);
    expect(src).not.toMatch(/bundleId/);
    // It DOES carry its own independent structuralNodeId/sourceCitation, per the Independence Contract.
    expect(src).toMatch(/structuralNodeId/);
    expect(src).toMatch(/sourceCitation/);
  });
});
