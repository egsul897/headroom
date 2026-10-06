/**
 * FINAL §7.2(c) LIVE RUN - source-authority evidence derived OFFLINE from the persisted run artifacts (mission §10/§11/§24).
 *
 *   npx tsx scripts/phase-3-live-validation/derive-source-authority-evidence.ts --dir docs/phase-3-live-validation/<attempt>
 *
 * Reads 01-target-identity.json (the authenticated operative text) and 06-compilation.json (the frozen Pass A inventory and
 * the compiled rules exactly as persisted) and writes 06d-source-authority.json: the deterministic scan of the operative
 * text (spans, selectors), each inventory item's declared vs source-grounded references with its audit, and every
 * authoritative target of each rule with its selector and reference-audit entry. Zero provider calls; nothing semantic is
 * recomputed except the scan, which is the same production function the inventory and the fidelity guard call.
 */
import fs from "node:fs";
import path from "node:path";
import { scanSourceReferences, SOURCE_REFERENCE_SCAN_VERSION } from "../../lib/contract-model/compiler/source-reference-scan";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { SOURCE_REFERENCE_FIDELITY_VERSION } from "../../lib/contract-model/compiler/semantic/source-reference-fidelity";
import { buildDeterministicStages } from "../p3-conmed-pilot/pipeline";
import { scanForSecrets } from "../p3-conmed-pilot/evidence";
import type { IRRule } from "../../lib/contract-model/ir/types";

const dirArg = process.argv.find((a) => a.startsWith("--dir="))?.slice("--dir=".length) ?? (process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : undefined);
if (!dirArg) throw new Error("pass --dir <attempt evidence directory>");
const OUT = dirArg;
const load = <T = Record<string, unknown>>(name: string): T => JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8")) as T;
const target = path.join(OUT, "06d-source-authority.json");
if (fs.existsSync(target)) throw new Error(`refusing to overwrite ${target}`);

const identity = load<{ identity: { discoveryId: string; documentId: string; normalizedSourceRef: string; operativeSourceText: string } }>("01-target-identity.json").identity;
const comp = load<{ rules: IRRule[]; frozenInventory: { algorithmVersion: string; items: { inventoryItemId: string; sourceSpan: { charStart: number; charEnd: number; excerpt: string }; semanticFunctions?: unknown; referencedSections?: string[]; declaredReferencedSections?: string[]; referenceAudit?: unknown; support?: { supportStatus?: string } }[] } | null }>("06-compilation.json");
const stages = buildDeterministicStages();
const text = identity.operativeSourceText;
const scanned = scanSourceReferences(text, { baseSectionRef: identity.normalizedSourceRef, index: stages.index, documentId: identity.documentId });
const inv = comp.frozenInventory;
const evidence = {
  derivedFrom: ["01-target-identity.json", "06-compilation.json"],
  versions: { scanner: SOURCE_REFERENCE_SCAN_VERSION, inventory: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, fidelity: SOURCE_REFERENCE_FIDELITY_VERSION, frozenInventoryAlgorithm: inv?.algorithmVersion ?? null },
  operativeTextScan: scanned.map((x) => ({ raw: x.raw, normalized: x.normalized, span: [x.charStart, x.charEnd], spanText: text.slice(x.charStart, x.charEnd), selector: x.selector, expandedFromRange: x.expandedFromRange })),
  inventoryItems: (inv?.items ?? []).map((it) => ({ inventoryItemId: it.inventoryItemId, span: [it.sourceSpan.charStart, it.sourceSpan.charEnd], excerpt: it.sourceSpan.excerpt, semanticFunctions: it.semanticFunctions ?? null, declaredReferencedSections: it.declaredReferencedSections ?? null, sourceGroundedReferencedSections: it.referencedSections ?? null, referenceAudit: it.referenceAudit ?? null, supportStatus: it.support?.supportStatus ?? null })),
  rules: comp.rules.map((x) => ({
    ruleId: x.ruleId, sourceSectionRef: x.sourceSectionRef, sourceReferenceAudit: x.sourceReferenceAudit ?? null,
    authoritativeTargets: [
      ...(x.sourceDependencies ?? []).map((d) => ({ path: "sourceDependencies", relationshipType: d.relationshipType, exactSourceTargetRef: d.exactSourceTargetRef, normalizedTargetRef: d.normalizedTargetRef, resolutionStatus: d.resolutionStatus, owningCandidateRefs: d.owningCandidateRefs, boundSemanticTargetIds: d.boundSemanticTargetIds, selector: d.selector ?? null, description: d.description, sourceSpan: scanned.find((s) => s.normalized === d.normalizedTargetRef)?.charStart ?? null })),
      ...x.conditions.flatMap((c, k) => (c.referencesRuleTargets ?? []).map((t) => ({ path: `conditions[${k}].referencesRuleTargets`, relationshipType: null, exactSourceTargetRef: t.exactSourceTargetRef, normalizedTargetRef: t.normalizedTargetRef, resolutionStatus: t.resolutionStatus, owningCandidateRefs: t.owningCandidateRefs, boundSemanticTargetIds: t.boundSemanticTargetIds, selector: t.selector ?? null, description: null, sourceSpan: scanned.find((s) => s.normalized === t.normalizedTargetRef)?.charStart ?? null }))),
    ],
  })),
};
const body = JSON.stringify(evidence, null, 2);
const hits = scanForSecrets(body);
if (hits.length > 0) throw new Error(`refusing to write: credential-shaped content at ${JSON.stringify(hits)}`);
fs.writeFileSync(target, body);
console.log(JSON.stringify({ wrote: target, scanned: evidence.operativeTextScan.map((s) => [s.normalized, s.selector.kind]), items: evidence.inventoryItems.length, rules: evidence.rules.length }, null, 1));
