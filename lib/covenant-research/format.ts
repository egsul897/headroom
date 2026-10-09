/**
 * CLI / human-readable formatting for research responses.
 */

import type { ResearchHit, ResearchResponse } from "./types";

function section(title: string, body: string): string {
  return `${title}\n${"-".repeat(title.length)}\n${body}`;
}

function formatHit(hit: ResearchHit, index: number): string {
  const e = hit.entry;
  const lines = [
    `#${index + 1}  score=${hit.score}  (lexical=${hit.lexicalScore}, structural=${hit.structuralScore})`,
    `entryId: ${e.entryId}`,
    `issuer: ${e.issuer.name}${e.issuer.ticker ? ` (${e.issuer.ticker})` : ""}${e.issuer.cik ? ` CIK ${e.issuer.cik}` : ""}`,
    `instrument: ${e.instrument.name} [${e.instrument.agreementType}]`,
    `covenantFamily: ${e.covenantFamily}${e.ruleType ? ` / ${e.ruleType}` : ""}`,
    `operativeVersion: ${e.operativeVersion.status}`,
    `operativeClassification: ${hit.operativeClassification ?? e.operativeVersion.status}`,
    `verificationStatus: ${e.verificationStatus}`,
    `filingUrl: ${e.filing.url ?? "(none)"}`,
    `accession: ${e.filing.accession ?? "(none)"}${e.filing.filedOn ? `  filed ${e.filing.filedOn}` : ""}`,
    `citation: ${e.sourceCitation}`,
    `section: ${e.sourceSectionRef ?? "(none)"}`,
    `matchedSignals: ${hit.matchedSignals.join(", ") || "(none)"}`,
  ];
  if (hit.uncertaintyNotes?.length) {
    lines.push(`uncertainty: ${hit.uncertaintyNotes.join(" | ")}`);
  }
  lines.push("", "SOURCE EXCERPT:", e.sourceExcerpt);

  if (e.relevantDefinitions.length > 0) {
    lines.push("", "RELEVANT DEFINITIONS:");
    for (const d of e.relevantDefinitions) {
      lines.push(`- ${d.termName}${d.excerpt ? `: ${d.excerpt}` : ""}`);
    }
  }
  if (e.relatedConditions.length > 0) {
    lines.push("", "RELATED CONDITIONS:");
    for (const c of e.relatedConditions) {
      lines.push(`- [${c.type}] ${c.description}`);
    }
  }
  if (e.amendmentRelationships.length > 0) {
    lines.push("", "AMENDMENT RELATIONSHIPS:");
    for (const a of e.amendmentRelationships) {
      lines.push(`- ${a.relationshipType}: ${a.description}${a.relatedEntryId ? ` (→ ${a.relatedEntryId})` : ""}`);
    }
  }
  if (e.missingDependencies?.length) {
    lines.push("", "MISSING DEPENDENCIES (disclosed, not filled):");
    for (const d of e.missingDependencies) {
      lines.push(`- [${d.kind}] ${d.description}`);
    }
  }

  return lines.join("\n");
}

export function formatResearchResponse(response: ResearchResponse): string {
  const parts: string[] = [
    section("DISCLAIMER", response.disclaimer),
    "",
    section(
      "QUERY",
      [
        `raw: ${response.query.raw || "(structured only)"}`,
        `intent: ${response.query.intent ?? "(none)"}`,
        `filters: ${JSON.stringify(response.query.filters)}`,
      ].join("\n"),
    ),
    "",
  ];

  if (response.refused) {
    parts.push(section("REFUSED", response.refusalReason ?? "Unsupported request."));
    parts.push("");
    parts.push("No source excerpts returned.");
    return parts.join("\n");
  }

  if (response.hits.length === 0) {
    parts.push(section("RESULTS", "No matching source-backed entries under current hybrid lexical/structural retrieval."));
    return parts.join("\n");
  }

  parts.push(section("RESULTS", `${response.resultCount} hit(s)`));
  parts.push("");
  response.hits.forEach((hit, i) => {
    parts.push(formatHit(hit, i));
    parts.push("");
    parts.push("=".repeat(72));
    parts.push("");
  });

  return parts.join("\n").trimEnd() + "\n";
}
