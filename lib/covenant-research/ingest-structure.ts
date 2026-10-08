/**
 * Ingest package structure / natural-search excerpts already present in-repo.
 * Used for authentic documents that have structure fixtures but no discovery run
 * (e.g. Gibraltar). Status remains UNVERIFIED — structure ≠ legal verification.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCorpusEntry } from "./corpus";
import { featuresFromText } from "./features";
import { attachIdentityFields } from "./identity";
import type { ResearchCorpusEntry } from "./types";

export interface StructureIngestSpec {
  packageId: string;
  naturalSearchPath: string;
  issuer: ResearchCorpusEntry["issuer"];
  instrument: ResearchCorpusEntry["instrument"];
  filing: ResearchCorpusEntry["filing"];
  sourceDocumentId?: string;
}

const FAMILY_BY_BUCKET: Record<string, string> = {
  debt: "INDEBTEDNESS",
  liens: "LIENS",
  restricted_payments: "RESTRICTED_PAYMENTS",
  investments: "INVESTMENTS",
  financial_covenants: "FINANCIAL_COVENANTS",
  asset_sales: "ASSET_SALES",
  reclass: "INDEBTEDNESS",
  shared_capacity: "INVESTMENTS",
  builder_grower: "DEFINITIONS_CALCULATION_RULES",
};

export function ingestNaturalSearchStructure(spec: StructureIngestSpec): ResearchCorpusEntry[] {
  const path = resolve(process.cwd(), spec.naturalSearchPath);
  if (!existsSync(path)) return [];
  const buckets = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const out: ResearchCorpusEntry[] = [];

  for (const [bucket, rows] of Object.entries(buckets)) {
    if (!Array.isArray(rows)) continue;
    const family = FAMILY_BY_BUCKET[bucket] ?? "QUALITATIVE_NEGATIVE_COVENANTS";
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const excerpt = String(row.excerpt ?? "");
      if (excerpt.trim().length < 40) continue;
      const sectionRef = String(row.tightestRef ?? row.sectionRef ?? "");
      const features = featuresFromText({
        families: [family],
        description: String(row.sectionHeading ?? bucket),
        sourceCitation: excerpt,
      });
      if (bucket === "reclass") {
        features.hasReclassification = true;
        features.unusualReclassification = /sole discretion|reclassify/i.test(excerpt);
      }
      if (bucket === "shared_capacity" || bucket === "builder_grower") {
        features.hasSharedCapacity = true;
      }
      const entry = normalizeCorpusEntry({
        entryId: `structure:${spec.packageId}:${bucket}:${sectionRef || i}`,
        kind: bucket === "builder_grower" ? "DEFINITION" : "RULE",
        issuer: spec.issuer,
        instrument: spec.instrument,
        filing: spec.filing,
        covenantFamily: family,
        ruleType: bucket,
        action: null,
        operativeVersion: {
          status: "CURRENT_OPERATIVE",
          effectiveFrom: spec.filing.filedOn,
          effectiveTo: null,
          supersededByEntryId: null,
        },
        sourceExcerpt: excerpt,
        sourceCitation: sectionRef ? `§${sectionRef}` : excerpt.slice(0, 120),
        sourceSectionRef: sectionRef || null,
        relevantDefinitions: [],
        relatedConditions: [],
        amendmentRelationships: [],
        verificationStatus: "UNVERIFIED",
        structuralFeatures: features,
        searchText: [excerpt, sectionRef, family, bucket, spec.issuer.name].join("\n"),
        tags: ["structure-ingest", spec.packageId, bucket],
        sourceDocumentId: spec.sourceDocumentId ?? "doc-a",
        extractionVersion: "structure-natural-search.v1",
        missingDependencies: [
          {
            kind: "STRUCTURE_ONLY_INGEST",
            description:
              "Entry sourced from package structure/natural-search fixture; controlling definitions may be incomplete.",
            disclosed: true,
          },
        ],
      });
      out.push(
        attachIdentityFields(entry, {
          sourceDocumentId: spec.sourceDocumentId ?? "doc-a",
          extractionVersion: "structure-natural-search.v1",
          charStart: typeof row.charStart === "number" ? row.charStart : null,
          charEnd: typeof row.charEnd === "number" ? row.charEnd : null,
        }),
      );
    }
  }
  return out;
}
