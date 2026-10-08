/**
 * Ingest compiled-IR fixture units (rules + definitions) as research entries.
 * Status mapping: REVIEW_REQUIRED → HYPOTHESIS; otherwise COMPILED.
 * Never promotes to VERIFIED.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCorpusEntry } from "./corpus";
import { emptyFeatures, featuresFromText } from "./features";
import { attachIdentityFields } from "./identity";
import type { ResearchCorpusEntry, ResearchVerificationStatus } from "./types";

export interface CompiledIngestSpec {
  packageId: string;
  compiledResultsPath: string;
  issuer: ResearchCorpusEntry["issuer"];
  instrument: ResearchCorpusEntry["instrument"];
  filing: ResearchCorpusEntry["filing"];
  documentFilings?: Record<string, ResearchCorpusEntry["filing"]>;
}

function mapCompileStatus(status: unknown): ResearchVerificationStatus {
  const s = String(status ?? "").toUpperCase();
  if (s.includes("REVIEW")) return "HYPOTHESIS";
  if (s.includes("FAIL") || s.includes("UNSUPPORTED")) return "HYPOTHESIS";
  return "COMPILED";
}

export function ingestCompiledResults(spec: CompiledIngestSpec): ResearchCorpusEntry[] {
  const path = resolve(process.cwd(), spec.compiledResultsPath);
  if (!existsSync(path)) return [];
  const units = JSON.parse(readFileSync(path, "utf8")) as Array<Record<string, unknown>>;
  if (!Array.isArray(units)) return [];

  const out: ResearchCorpusEntry[] = [];

  for (const unit of units) {
    const unitStatus = mapCompileStatus(unit.status);
    const sourceDocumentId = typeof unit.sourceDocumentId === "string" ? unit.sourceDocumentId : null;
    const filing = (sourceDocumentId && spec.documentFilings?.[sourceDocumentId]) || spec.filing;
    const compilerVersion =
      (Array.isArray(unit.rules) &&
        unit.rules[0] &&
        typeof (unit.rules[0] as { compilerVersion?: string }).compilerVersion === "string" &&
        (unit.rules[0] as { compilerVersion: string }).compilerVersion) ||
      "compiled-ir-unknown";

    const rules = Array.isArray(unit.rules) ? (unit.rules as Array<Record<string, unknown>>) : [];
    for (const rule of rules) {
      const provenance = (rule.provenance ?? null) as {
        excerpt?: string | null;
        sourceCitation?: string | null;
        documentId?: string | null;
      } | null;
      const excerpt =
        (provenance?.excerpt && String(provenance.excerpt).trim()) ||
        (typeof rule.description === "string" ? rule.description : null) ||
        (provenance?.sourceCitation ? String(provenance.sourceCitation) : null);
      if (!excerpt || excerpt.trim().length < 12) continue;

      const family = String(rule.covenantFamily ?? "QUALITATIVE_NEGATIVE_COVENANTS");
      const features = featuresFromText({
        families: [family],
        description: String(rule.description ?? ""),
        sourceCitation: excerpt,
      });
      const op = rule.operativeLineage as { operativeStatus?: string } | null;
      const operativeStatus =
        op?.operativeStatus && String(op.operativeStatus).includes("SUPERSEDE")
          ? ("SUPERSEDED" as const)
          : op?.operativeStatus && String(op.operativeStatus).includes("CONFLICT")
            ? ("UNRESOLVED_OPERATIVE_STATE" as const)
            : ("UNKNOWN" as const);

      const missingDependencies: ResearchCorpusEntry["missingDependencies"] = [];
      if (Array.isArray(rule.unresolvedDependencies) && rule.unresolvedDependencies.length) {
        for (const d of rule.unresolvedDependencies as Array<{ kind?: string; description?: string }>) {
          missingDependencies.push({
            kind: d.kind ?? "UNRESOLVED_DEPENDENCY",
            description: d.description ?? "Unresolved dependency disclosed by compiled IR",
            disclosed: true,
          });
        }
      }

      const entry = normalizeCorpusEntry({
        entryId: `compiled:${spec.packageId}:${String(rule.ruleId ?? excerptHashFallback(excerpt))}`,
        kind: "RULE",
        issuer: spec.issuer,
        instrument: spec.instrument,
        filing,
        covenantFamily: family,
        ruleType: typeof rule.ruleType === "string" ? rule.ruleType : null,
        action: typeof rule.action === "string" ? rule.action : null,
        operativeVersion: {
          status: operativeStatus,
          effectiveFrom: filing.filedOn,
          effectiveTo: null,
          supersededByEntryId: null,
        },
        sourceExcerpt: excerpt,
        sourceCitation: String(provenance?.sourceCitation ?? rule.sourceSectionRef ?? ""),
        sourceSectionRef: typeof rule.sourceSectionRef === "string" ? rule.sourceSectionRef : null,
        relevantDefinitions: [],
        relatedConditions: Array.isArray(rule.conditions)
          ? (rule.conditions as Array<{ type?: string; description?: string }>).map((c) => ({
              type: c.type ?? "UNSUPPORTED",
              description: c.description ?? "",
            }))
          : features.conditionTypes.map((type) => ({ type, description: type })),
        amendmentRelationships: [],
        verificationStatus: unitStatus,
        structuralFeatures: features,
        searchText: "",
        tags: ["compiled-ingest", spec.packageId, family],
        sourceDocumentId: sourceDocumentId ?? provenance?.documentId ?? null,
        extractionVersion: compilerVersion,
        missingDependencies,
      });
      out.push(attachIdentityFields(entry));
    }

    const defs = Array.isArray(unit.definitions) ? (unit.definitions as Array<Record<string, unknown>>) : [];
    for (const def of defs) {
      const provenance = (def.provenance ?? null) as {
        excerpt?: string | null;
        sourceCitation?: string | null;
        documentId?: string | null;
      } | null;
      const termName = String(def.termName ?? "UnknownTerm");
      const excerpt =
        (provenance?.excerpt && String(provenance.excerpt).trim()) ||
        (typeof def.semanticDescription === "string" ? def.semanticDescription : null) ||
        provenance?.sourceCitation ||
        termName;
      if (!excerpt || String(excerpt).trim().length < 3) continue;

      const entry = normalizeCorpusEntry({
        entryId: `compiled-def:${spec.packageId}:${String(def.definitionId ?? termName)}`,
        kind: "DEFINITION",
        issuer: spec.issuer,
        instrument: spec.instrument,
        filing,
        covenantFamily: String(def.covenantFamily ?? "DEFINITIONS_CALCULATION_RULES"),
        ruleType: "DEFINITION",
        action: null,
        operativeVersion: {
          status: "UNKNOWN",
          effectiveFrom: filing.filedOn,
          effectiveTo: null,
          supersededByEntryId: null,
        },
        sourceExcerpt: String(excerpt),
        sourceCitation: String(provenance?.sourceCitation ?? `definition of "${termName}"`),
        sourceSectionRef: null,
        relevantDefinitions: [{ termName, excerpt: String(excerpt).slice(0, 240), definitionEntryId: null }],
        relatedConditions: [],
        amendmentRelationships: [],
        verificationStatus: unitStatus,
        structuralFeatures: emptyFeatures({
          hasSynergyAddback: /synerg/i.test(String(excerpt)),
          synergyAddbackCapped: /synerg/i.test(String(excerpt))
            ? /shall not exceed|%\s*of/i.test(String(excerpt))
              ? true
              : null
            : null,
        }),
        searchText: "",
        tags: ["compiled-ingest", "definition", spec.packageId, termName],
        sourceDocumentId: sourceDocumentId ?? provenance?.documentId ?? null,
        extractionVersion: compilerVersion,
        missingDependencies: [],
      });
      out.push(attachIdentityFields(entry));
    }
  }

  return out;
}

function excerptHashFallback(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
