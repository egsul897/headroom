/**
 * Phase 4: investigate all frozen Phase-3 false negatives (42).
 * Does not mutate the frozen 135-edge GT file.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildFixtureCorpusRegistry } from "./corpus-registry";
import { extractFromStructural, loadTextDocument } from "./extract-from-structural";
import type { AtlasDocument } from "./schema";

const ROOT = resolve(__dirname, "../..");

export interface FnDisposition {
  edgeId: string;
  documentId: string;
  split: string;
  issuer: string;
  kind: string;
  fromLabel: string;
  toLabel: string;
  termName?: string;
  connective: string;
  sourceSpan: {
    sourceFile: string;
    charStart: number;
    charEnd: number;
    excerpt: string;
  };
  notes: string;
  kindPresent: boolean;
  termMatchAny: boolean;
  kindOnlyWouldHit: boolean;
  rootCause: string;
  legalRelationshipSupported: boolean;
  defectOwner: string;
  evidence: string;
  systemicGroup: string;
}

function loadFrozenGt() {
  return JSON.parse(
    readFileSync(join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json"), "utf-8"),
  ) as {
    edges: Array<{
      edgeId: string;
      documentId: string;
      issuer: string;
      split: string;
      kind: string;
      fromLabel: string;
      toLabel: string;
      termName?: string;
      connective: string;
      sourceSpan: FnDisposition["sourceSpan"];
      notes: string;
    }>;
  };
}

function phase3FnIds(): Set<string> {
  const rp = JSON.parse(readFileSync(join(ROOT, "docs/covenant-dependency-atlas/phase-3/03-recall-precision.json"), "utf-8")) as {
    expandedIndependentGt: { details: Array<{ edgeId: string; hit: boolean }> };
  };
  return new Set(rp.expandedIndependentGt.details.filter((d) => !d.hit).map((d) => d.edgeId));
}

function classify(fn: ReturnType<typeof loadFrozenGt>["edges"][number], doc: AtlasDocument | null): FnDisposition {
  const edges = doc?.edges ?? [];
  const kindPresent = edges.some((e) => e.kind === fn.kind);
  const term = fn.termName ?? fn.toLabel;
  const termMatchAny = edges.some(
    (e) =>
      e.kind === fn.kind &&
      (e.toNodeId.includes(String(term).toLowerCase().replace(/\s+/g, "_")) ||
        e.rationale.toLowerCase().includes(String(term).toLowerCase()) ||
        e.sourceSpans.some((s) => (s.excerpt ?? "").toLowerCase().includes(String(term).toLowerCase().slice(0, 24)))),
  );
  const kindOnlyWouldHit = kindPresent;
  const excerpt = fn.sourceSpan?.excerpt ?? "";

  let rootCause = "UNKNOWN";
  let defectOwner = "ATLAS";
  let evidence = "";
  let systemicGroup = "OTHER";

  // Phase-4 corrected harness: kind-only when termName absent.
  const correctedHarnessHit = kindPresent && (!fn.termName || termMatchAny);

  if (!doc) {
    rootCause = "DOCUMENT_NOT_EXTRACTED";
    evidence = "document missing from structural extract";
    systemicGroup = "INFRASTRUCTURE";
  } else if (correctedHarnessHit && !fn.termName && kindPresent && !termMatchAny) {
    rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
    defectOwner = "ATLAS_EVAL_HARNESS";
    evidence = `Phase-3 harness false FN: kind ${fn.kind} present (n=${edges.filter((e) => e.kind === fn.kind).length}); toLabel '${fn.toLabel}' is not an identity key. Remediated by Phase-4 harness correction.`;
    systemicGroup = "EVAL_HARNESS";
  } else if (correctedHarnessHit && termMatchAny) {
    rootCause = "REMEDIATED_BY_PHASE4_ADAPTER";
    defectOwner = "ATLAS";
    evidence = "Phase-3 miss now detected after generalizable Atlas adapter remediation (fail-closed unresolved defs / section-body connectives / covenantish scope).";
    systemicGroup = "REMEDIATED";
  } else if (kindPresent && !termMatchAny && !fn.termName) {
    rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
    defectOwner = "ATLAS_EVAL_HARNESS";
    evidence = `kind ${fn.kind} present (n=${edges.filter((e) => e.kind === fn.kind).length}) but toLabel '${fn.toLabel}' used as term filter`;
    systemicGroup = "EVAL_HARNESS";
  } else if (fn.kind === "COVENANT_TO_CONDITION") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "REMOTE_CONDITION_REQUIRES_SECTION_REF_WINDOW";
      evidence = "subject-to in source; adapter emits CONDITION only near typed structural cross-references, not bare section-body subject-to";
      systemicGroup = "REMOTE_CONDITION";
      defectOwner = "ATLAS_AND_LEGAL_CORE";
    } else if (!termMatchAny) {
      rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
      defectOwner = "ATLAS_EVAL_HARNESS";
      evidence = `CONDITION edges=${n}`;
      systemicGroup = "EVAL_HARNESS";
    }
  } else if (fn.kind === "COVENANT_TO_EXCEPTION") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "EXCEPTION_CONNECTIVE_NOT_NEAR_STRUCTURAL_REF";
      evidence = "except-as in source; adapter only fires EXCEPTION on structural reference connective windows";
      systemicGroup = "STRUCTURAL_CROSS_REFERENCE";
    } else if (!termMatchAny) {
      rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
      defectOwner = "ATLAS_EVAL_HARNESS";
      evidence = `EXCEPTION edges=${n}`;
      systemicGroup = "EVAL_HARNESS";
    }
  } else if (fn.kind === "COVENANT_TO_AMENDMENT") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "AMENDMENT_CONNECTIVE_OR_CHAIN_MODELING";
      defectOwner = "ATLAS_OR_PR150";
      evidence = "as amended in source; may need amendment-chain modeling (PR #150) beyond local connective";
      systemicGroup = "AMENDMENT_TARGET";
    } else if (!termMatchAny) {
      rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
      defectOwner = "ATLAS_EVAL_HARNESS";
      evidence = `AMENDMENT edges=${n}`;
      systemicGroup = "EVAL_HARNESS";
    }
  } else if (fn.kind === "RECLASSIFICATION") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "RECLASSIFICATION_OUTSIDE_COVENANTISH_OR_REF_WINDOW";
      evidence = "reclassif in source; section-body scan requires isCovenantishSection";
      systemicGroup = "COVENANT_FAMILY_SCOPE";
    } else if (!termMatchAny) {
      rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
      defectOwner = "ATLAS_EVAL_HARNESS";
      evidence = `RECLASS edges=${n}`;
      systemicGroup = "EVAL_HARNESS";
    }
  } else if (fn.kind === "COVENANT_TO_DEFINITION") {
    const defNodes = (doc.nodes ?? []).filter((n) => n.kind === "DEFINITION");
    const t = fn.termName ?? fn.toLabel;
    const defExists = defNodes.some((n) => {
      const label = (n.termName ?? n.label ?? "").toLowerCase();
      return label.includes(String(t).toLowerCase()) || String(t).toLowerCase().includes(label);
    });
    const kindN = edges.filter((e) => e.kind === fn.kind).length;
    const src = fn.sourceSpan?.sourceFile ?? "";
    if (kindN === 0) {
      rootCause = "NO_COVENANTISH_SECTION_OR_DEFS";
      evidence = `no COVENANT_TO_DEFINITION edges; defs=${defNodes.length}`;
      systemicGroup = "STRUCTURAL_PARSING";
    } else if (!defExists) {
      if (/excerpt|article-6|article-vii|negative|curated/i.test(src)) {
        rootCause = "DEFINITION_IN_OTHER_DOCUMENT_OR_EXCERPT_SPLIT";
        defectOwner = "DEFINITION_ENCYCLOPEDIA_OR_PACKAGE";
        evidence = `term '${t}' not in this file's structural definitions (defs=${defNodes.length}); GT span is excerpt/neg-covenant slice`;
        systemicGroup = "CROSS_DOCUMENT_DEFINITION";
      } else {
        rootCause = "DEFINITION_NOT_DETECTED";
        defectOwner = "DEFINITION_EXTRACTION";
        evidence = `term '${t}' not in structural definitions (defs=${defNodes.length})`;
        systemicGroup = "DEFINITION_EXTRACTION";
      }
    } else if (!termMatchAny) {
      rootCause = "DEFINED_TERM_NOT_LINKED_IN_COVENANTISH_WINDOW";
      evidence = `def exists; kind edges=${kindN}; term not linked in covenantish body window or heading scope`;
      systemicGroup = "ATLAS_SECTION_WINDOW";
    }
  } else if (fn.kind === "RATIO_CALCULATION") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "RATIO_DEFINITION_MISSING_OR_BODY_WINDOW";
      evidence = "no RATIO_CALCULATION edges emitted";
      systemicGroup = "RATIO_DEPENDENCY";
    } else if (!termMatchAny) {
      rootCause = "RATIO_COMPONENT_TERM_MISMATCH";
      evidence = `RATIO edges=${n}; expected '${fn.termName ?? fn.toLabel}' not matched`;
      systemicGroup = "RATIO_DEPENDENCY";
    }
  } else if (fn.kind === "COVENANT_TO_CROSS_DOCUMENT") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "CROSS_DOCUMENT_NOT_IN_COVENANTISH_BODY";
      defectOwner = "CROSS_DOCUMENT_RESOLUTION";
      evidence = "instrument phrase absent from covenantish section bodies in this extract";
      systemicGroup = "CROSS_DOCUMENT";
    } else if (!termMatchAny) {
      rootCause = "CROSS_DOCUMENT_LABEL_MISMATCH";
      evidence = `XD edges=${n}; label '${fn.toLabel}' not matched`;
      systemicGroup = "CROSS_DOCUMENT";
    }
  } else if (fn.kind === "ENTITY_SCOPE") {
    const n = edges.filter((e) => e.kind === fn.kind).length;
    if (n === 0) {
      rootCause = "ENTITY_SCOPE_PATTERN_OR_SECTION_SCOPE";
      evidence = "entity-scope phrase not detected in covenantish section body";
      systemicGroup = "ENTITY_SCOPE";
    } else if (!termMatchAny) {
      rootCause = "MEASUREMENT_TO_LABEL_OVERFILTER";
      defectOwner = "ATLAS_EVAL_HARNESS";
      evidence = `ENTITY_SCOPE edges=${n}; toLabel '${fn.toLabel}'`;
      systemicGroup = "EVAL_HARNESS";
    }
  }

  const legalRelationshipSupported = Boolean(fn.sourceSpan && excerpt.length > 0);

  return {
    edgeId: fn.edgeId,
    documentId: fn.documentId,
    split: fn.split,
    issuer: fn.issuer,
    kind: fn.kind,
    fromLabel: fn.fromLabel,
    toLabel: fn.toLabel,
    termName: fn.termName,
    connective: fn.connective,
    sourceSpan: fn.sourceSpan,
    notes: fn.notes,
    kindPresent,
    termMatchAny,
    kindOnlyWouldHit,
    rootCause,
    legalRelationshipSupported,
    defectOwner,
    evidence,
    systemicGroup,
  };
}

export function investigateFalseNegatives(): {
  total: number;
  dispositions: FnDisposition[];
  byRootCause: Record<string, number>;
  bySystemicGroup: Record<string, number>;
  byDefectOwner: Record<string, number>;
  measurementArtifacts: number;
} {
  const gt = loadFrozenGt();
  const fnIds = phase3FnIds();
  const fns = gt.edges.filter((e) => fnIds.has(e.edgeId));
  const registry = buildFixtureCorpusRegistry();
  const docCache = new Map<string, AtlasDocument | null>();

  const getDoc = (documentId: string): AtlasDocument | null => {
    if (docCache.has(documentId)) return docCache.get(documentId) ?? null;
    const entry = registry.find((e) => e.documentId === documentId);
    if (!entry?.available) {
      docCache.set(documentId, null);
      return null;
    }
    const text = loadTextDocument(join(ROOT, entry.sourcePath));
    const clipped = text.length > 1_200_000 ? text.slice(0, 1_200_000) : text;
    const doc = extractFromStructural({
      documentId: entry.documentId,
      packageId: entry.packageId,
      sourceFile: entry.sourcePath,
      label: entry.documentId,
      text: clipped,
      split: entry.split === "evaluation" ? "evaluation" : "development",
      issuer: entry.issuer,
    });
    docCache.set(documentId, doc);
    return doc;
  };

  const dispositions = fns.map((fn) => classify(fn, getDoc(fn.documentId)));
  const byRootCause: Record<string, number> = {};
  const bySystemicGroup: Record<string, number> = {};
  const byDefectOwner: Record<string, number> = {};
  for (const d of dispositions) {
    byRootCause[d.rootCause] = (byRootCause[d.rootCause] ?? 0) + 1;
    bySystemicGroup[d.systemicGroup] = (bySystemicGroup[d.systemicGroup] ?? 0) + 1;
    byDefectOwner[d.defectOwner] = (byDefectOwner[d.defectOwner] ?? 0) + 1;
  }

  const outDir = join(ROOT, "docs/covenant-dependency-atlas/phase-4");
  mkdirSync(outDir, { recursive: true });
  const report = {
    total: dispositions.length,
    frozenBenchmark: "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json",
    frozenBenchmarkImmutable: true,
    knifeRiverBlind: "PRESERVED_UNREAD",
    dispositions,
    byRootCause,
    bySystemicGroup,
    byDefectOwner,
    measurementArtifacts: dispositions.filter((d) => d.rootCause === "MEASUREMENT_TO_LABEL_OVERFILTER").length,
  };
  writeFileSync(join(outDir, "01-false-negative-dispositions.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("investigate-false-negatives.ts") || process.argv[1].endsWith("investigate-false-negatives.js"));

if (isDirectRun) {
  const r = investigateFalseNegatives();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ total: r.total, byRootCause: r.byRootCause, bySystemicGroup: r.bySystemicGroup, measurementArtifacts: r.measurementArtifacts }, null, 2));
}
