/** Human-readable rendering of a canonical map, in the map's own order. Never the source of truth. */
import type { CanonicalCovenantMap } from "./types";

export function renderCovenantMapMarkdown(map: CanonicalCovenantMap): string {
  const lines: string[] = [];
  lines.push(`# Canonical covenant map - ${map.instrumentKey}`, "", `mapHash: \`${map.mapHash}\`  ` , `schema: ${map.schemaVersion}  `, `config: ${map.identity.certifiedConfigIdentity ?? "(none)"}`, "");
  const c = map.completeness;
  lines.push("## Completeness", "", `| discovered | eligible | mapped | mapped w/ review | failed | unserved | nodes | edges | unresolved (blocking/review) | complete |`, `|---|---|---|---|---|---|---|---|---|---|`, `| ${c.candidatesDiscovered} | ${c.candidatesEligible} | ${c.candidatesMapped} | ${c.candidatesMappedWithReview} | ${c.candidatesFailed} | ${c.candidatesUnserved} | ${map.nodes.length} | ${map.edges.length} | ${c.unresolvedBlocking}/${c.unresolvedReview} | ${c.complete ? "yes" : "no"} |`, "");
  lines.push("## Nodes (source order)", "", "| # | doc | section | kind | family | type | posture | term | sufficiency | verification | identity | node id |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  map.nodes.forEach((n, i) => lines.push(`| ${i + 1} | ${n.sourceOrder.documentOrdinal} | ${n.sectionRef ?? ""} | ${n.kind} | ${n.family} | ${n.ruleType ?? ""} | ${n.posture ?? ""} | ${n.termName ?? ""} | ${n.sufficiency ?? ""} | ${n.verification.status} | ${n.identityStrength} | \`${n.nodeId}\` |`));
  lines.push("", "## Edges", "", "| type | from | to | relationship | derived from | reason |", "|---|---|---|---|---|---|");
  for (const e of map.edges) lines.push(`| ${e.edgeType} | \`${e.fromNodeId}\` | \`${e.toNodeId}\` | ${e.relationshipType ?? ""} | ${e.derivedFrom} | ${e.reason.replace(/\|/g, "/")} |`);
  lines.push("", "## Unresolved", "");
  if (map.unresolved.length === 0) lines.push("_none_");
  else { lines.push("| severity | kind | candidate | node | section | detail |", "|---|---|---|---|---|---|"); for (const u of map.unresolved) lines.push(`| ${u.severity} | ${u.kind} | ${u.candidateRef ?? ""} | ${u.nodeId ?? ""} | ${u.sectionRef ?? ""} | ${u.detail.replace(/\|/g, "/")} |`); }
  lines.push("", "## Candidates", "", "| section | outcome | compile | verify | nodes | conversations (semantic+refinement) | transport attempts | cost |", "|---|---|---|---|---|---|---|---|");
  for (const k of map.candidates) lines.push(`| ${k.sectionRef} | ${k.outcome} | ${k.compilationStatus ?? ""} | ${k.verificationStatus ?? ""} | ${k.nodeIds.length} | ${k.telemetry ? `${k.telemetry.semanticConversations}+${k.telemetry.refinementConversations}` : ""} | ${k.telemetry?.transportAttempts ?? ""} | ${k.telemetry?.costUsd ?? ""} |`);
  return lines.join("\n") + "\n";
}
