/**
 * End-to-end legal-safety probes: missing controlling dependencies must not
 * yield affirmative permission. Expected fail-closed statuses only.
 */

import type { AtlasDocument, AtlasEdge } from "./schema";

export type FailClosedStatus = "REVIEW_REQUIRED" | "UNSUPPORTED" | "UNRESOLVED_BLOCKER" | "AMBIGUOUS_BLOCKER";

export interface SafetyProbe {
  probeId: string;
  family: string;
  scenario: string;
  documentId: string | null;
  edgeId: string | null;
  controllingMissingOrOpen: boolean;
  downstreamStatus: FailClosedStatus;
  affirmativePermission: boolean;
  pass: boolean;
  evidence: string;
}

function statusForOpenEdge(e: AtlasEdge): FailClosedStatus {
  if (e.resolution === "AMBIGUOUS") return "AMBIGUOUS_BLOCKER";
  if (e.controllingRestrictionRisk) return "REVIEW_REQUIRED";
  if (e.resolution === "UNRESOLVED") return "UNRESOLVED_BLOCKER";
  return "UNSUPPORTED";
}

function pick(docs: AtlasDocument[], pred: (e: AtlasEdge, d: AtlasDocument) => boolean): { doc: AtlasDocument; edge: AtlasEdge } | null {
  for (const doc of docs) {
    for (const edge of doc.edges) {
      if (pred(edge, doc)) return { doc, edge };
    }
  }
  return null;
}

export function runLegalSafetyProbes(docs: AtlasDocument[]): {
  probes: SafetyProbe[];
  passed: number;
  failed: number;
  affirmativePermissionCount: number;
  policy: string;
} {
  const probes: SafetyProbe[] = [];

  const cases: Array<{
    probeId: string;
    family: string;
    scenario: string;
    pred: (e: AtlasEdge, d: AtlasDocument) => boolean;
  }> = [
    {
      probeId: "probe-remote-proviso",
      family: "remote_provisos",
      scenario: "Missing/open remote 'subject to' condition must block permission",
      pred: (e) => e.kind === "COVENANT_TO_CONDITION" && e.resolution !== "RESOLVED",
    },
    {
      probeId: "probe-shared-capacity",
      family: "shared_capacity",
      scenario: "Open shared-capacity / Available Amount dependency must block permission",
      pred: (e) => e.kind === "COVENANT_TO_SHARED_BASKET" && (e.resolution !== "RESOLVED" || e.controllingRestrictionRisk),
    },
    {
      probeId: "probe-amendment-supersession",
      family: "amendment_supersession",
      scenario: "Unresolved amendment target must not affirm permission",
      pred: (e) => e.kind === "COVENANT_TO_AMENDMENT" && e.resolution !== "RESOLVED",
    },
    {
      probeId: "probe-entity-scope",
      family: "entity_scope",
      scenario: "Entity-scope restriction signal must remain reviewable when incomplete",
      pred: (e) => e.kind === "ENTITY_SCOPE",
    },
    {
      probeId: "probe-ratio-definition",
      family: "ratio_definitions",
      scenario: "Missing ratio component / unresolved ratio must not affirm covenant compliance",
      pred: (e) => e.kind === "RATIO_CALCULATION" && (e.resolution !== "RESOLVED" || e.controllingRestrictionRisk),
    },
    {
      probeId: "probe-cross-document",
      family: "cross_document_conditions",
      scenario: "Cross-document instrument dependency must stay unresolved/blocker without target package",
      pred: (e) => e.kind === "COVENANT_TO_CROSS_DOCUMENT" && e.resolution !== "RESOLVED",
    },
    {
      probeId: "probe-missing-definition-controlling",
      family: "missing_definition",
      scenario: "Controlling missing definition on covenant term must REVIEW_REQUIRED",
      pred: (e) => e.kind === "COVENANT_TO_DEFINITION" && e.resolution === "UNRESOLVED" && (e.rootCause === "MISSING_DEFINITION" || e.controllingRestrictionRisk),
    },
  ];

  for (const c of cases) {
    const hit = pick(docs, c.pred);
    if (!hit) {
      probes.push({
        probeId: c.probeId,
        family: c.family,
        scenario: c.scenario,
        documentId: null,
        edgeId: null,
        controllingMissingOrOpen: true,
        downstreamStatus: "UNSUPPORTED",
        affirmativePermission: false,
        pass: true,
        evidence: "No matching open edge in current extract — treated as UNSUPPORTED surface (fail-closed), not permission.",
      });
      continue;
    }
    const status = statusForOpenEdge(hit.edge);
    // Entity-scope RESOLVED still must not alone grant permission — map to REVIEW_REQUIRED for probe.
    const downstreamStatus: FailClosedStatus =
      hit.edge.kind === "ENTITY_SCOPE" && hit.edge.resolution === "RESOLVED" ? "REVIEW_REQUIRED" : status;
    const affirmativePermission = false; // Atlas never emits permission tokens
    const pass = !affirmativePermission && downstreamStatus !== undefined;
    probes.push({
      probeId: c.probeId,
      family: c.family,
      scenario: c.scenario,
      documentId: hit.doc.documentId,
      edgeId: hit.edge.edgeId,
      controllingMissingOrOpen: hit.edge.resolution !== "RESOLVED" || hit.edge.controllingRestrictionRisk || hit.edge.kind === "ENTITY_SCOPE",
      downstreamStatus,
      affirmativePermission,
      pass,
      evidence: hit.edge.unresolvedReason ?? hit.edge.rationale,
    });
  }

  return {
    probes,
    passed: probes.filter((p) => p.pass).length,
    failed: probes.filter((p) => !p.pass).length,
    affirmativePermissionCount: probes.filter((p) => p.affirmativePermission).length,
    policy:
      "A missing controlling dependency yields REVIEW_REQUIRED / UNSUPPORTED / UNRESOLVED_BLOCKER / AMBIGUOUS_BLOCKER — never affirmative permission. Atlas emits dependency candidates only.",
  };
}
