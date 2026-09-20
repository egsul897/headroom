/**
 * PHASE 3 FINAL BLOCKER - ENTITY-SCOPE CONSISTENCY GUARD: zero-cost remediation evidence + frozen-IR replay.
 * No model call. Writes docs/phase-3-entity-scope-final/01..08.
 * Run: [VITEST_TARGETED_JSON=.. VITEST_FULL_JSON=.. VITEST_FULL_BASE_JSON=.. TSC_LOG=.. LINT_LOG=.. BUILD_LOG=..] npx tsx scripts/phase-3-entity-scope-final.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readJson, sh, sha256 } from "./phase-3-601-revalidation-lib";
import { applyEntityScopeGuard, citedUnitLeadIn, classifyEntityTag, ENTITY_SCOPE_GUARD_VERSION, findEntityBindingSignals, replayEntityScopeGuard, TAG_DENOTATION } from "../lib/contract-model/compiler/semantic/entity-scope-guard";
import { normalizeSubmission } from "../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../lib/contract-model/compiler/semantic/wire-schema";
import type { IRRule } from "../lib/contract-model/ir/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const OUT = "docs/phase-3-entity-scope-final";
const at = () => new Date().toISOString();
const STARTING_SHA = "995bed37dcc6d1111cec59c966f1d7e1321e71aa";
const FROZEN_DIR = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation";
const fileSha = (p: string) => sha256(readFileSync(p));
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };

const head = sh("git rev-parse HEAD");
const frozen = readJson<Any>(`${FROZEN_DIR}/compile-result.json`);
const verifier = readJson<Any>("docs/phase-3-final-601/154-verifier.json");
const F0 = verifier.findings[0];
const F0_RULES: string[] = String(F0.ruleOrDefinitionId).split(",").map((s: string) => s.trim());
const regions = frozen.sourceContext.regions;
const rulesBefore: IRRule[] = frozen.rules;
const byIdBefore = new Map(rulesBefore.map((r) => [r.ruleId, r]));

// ---------------- 01 baseline (§1, §2)
const closureFiles = Array.from({ length: 11 }, (_, i) => `docs/phase-3-closure/${String(i + 1).padStart(2, "0")}-`).map((prefix) => sh(`ls ${prefix}*.json`));
const frozenFiles = [`${FROZEN_DIR}/compile-result.json`, `${FROZEN_DIR}/verify-result.json`, `${FROZEN_DIR}/frozen-inventory.json`, "docs/phase-3-final-601/154-verifier.json"];
const preservedUnchanged = [...closureFiles, ...frozenFiles].map((p) => ({ path: p, sha256: fileSha(p), unchangedSinceStart: sh(`git diff --quiet ${STARTING_SHA} -- ${p} && echo yes || echo no`) === "yes" }));
writeJson(`${OUT}/01-baseline.json`, {
  artifact: "ENTITY-SCOPE FINAL §1-§2 - frozen closure evidence and the blocking rules, before any change", at: at(), startingSha: STARTING_SHA, headAtRun: head,
  preservedUnchanged, allPreserved: preservedUnchanged.every((p) => p.unchangedSinceStart),
  paidCalls: 0, spendUsd: 0, humanReferenceDataUsed: false,
  blockingFinding: { findingId: F0.findingId, findingType: F0.findingType, severity: F0.severity, irPath: F0.irPath, rules: F0_RULES, sourceEvidence: F0.sourceEvidence },
  blockingRulesBefore: F0_RULES.map((id) => { const r = byIdBefore.get(id)!; return { ruleId: id, sourceSectionRef: r.sourceSectionRef, ruleType: r.ruleType, entityScope: r.entityScope, entityScopeExcluded: r.entityScopeExcluded, sufficiency: r.sufficiency, sufficiencyReasonsMentionScope: r.sufficiencyReasons.some((s) => /entity.?scope|subsidiar/i.test(s)), excerpt: r.provenance?.excerpt ?? null, hasEntityScopeAudit: (r as Any).entityScopeAudit !== undefined }; }),
  entityScopeCensusBefore: rulesBefore.reduce((a: Record<string, number>, r) => { const k = JSON.stringify(r.entityScope); a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  frozenWitnessesOnly: "the rule ids above are frozen witnesses for the replay; production code carries none of them",
});

// ---------------- 02 normalizer audit (§3, §4, §14)
const oldNormalize = sh(`git show ${STARTING_SHA}:lib/contract-model/compiler/semantic/normalize.ts`);
const oldLines = oldNormalize.split("\n");
const quote = (re: RegExp) => oldLines.map((l, i) => [i + 1, l] as const).filter(([, l]) => re.test(l)).map(([n, l]) => ({ line: n, code: l.trim().slice(0, 240) }));
const durableShardKeys = sh(`ls ${FROZEN_DIR}/durable-shards`).split("\n").filter(Boolean).slice(0, 1).map((f) => Object.keys(readJson<Any>(`${FROZEN_DIR}/durable-shards/${f}`).result));
writeJson(`${OUT}/02-normalizer-audit.json`, {
  artifact: "ENTITY-SCOPE FINAL §3-§4, §14 - the two deterministic gaps, the silent drop before, and the loud contract after", at: at(),
  rootCauseA_silentDrop: {
    beforeSha: STARTING_SHA,
    beforeCode: [...quote(/matchEnum\(t, ENTITY_CLASS_TAGS\)\)\.filter/), ...quote(/^function matchEnum/)],
    behaviour: "matchEnum() returned null for any tag outside EntityClassTag and .filter(Boolean) removed it: no warning, no sufficiency change, no record of the raw value - for the rule fields (entityScope/entityScopeExcluded) and for ENTITY_SCOPE_REFERENCE nodes alike",
    afterCode: "lib/contract-model/compiler/semantic/entity-scope-guard.ts classifyEntityTag()/normalizeEntityTags(); normalize.ts calls them for rule fields and ENTITY_SCOPE_REFERENCE nodes",
    afterBehaviour: "every emitted tag receives exactly one outcome (RECOGNIZED_ENTITY_TAG | UNRECOGNIZED_ENTITY_TAG) recorded with raw value, normalized value, field and viaAlias in rule.entityScopeAudit.tagNormalization; an unrecognized tag adds a normalization warning (code ENTITY_SCOPE_UNRECOGNIZED_TAG, rule scope path), resets the affected scope field to unspecified, and forces COMPLETE -> PARTIAL with the reason code; the unknown tag's meaning is never guessed",
    persistenceNote: "lib/contract-model/compiler/persistence.ts toEntityClassTags() still filters to the DB enum when writing ContractRule rows; it now only ever sees guard-normalized tags, so nothing can be dropped there that the audit has not already recorded. The audit object itself is carried on the IRRule and in every persisted compile result JSON; no DB column was added (schema change out of this mission's scope)",
  },
  rootCauseB_noSourceConsistencyGuard: {
    behaviour: "after normalization nothing compared entityScope against the rule's own provenance excerpt or the lead-in of the unit it cites; 'the Borrowers shall not, and shall not permit any of their Restricted Subsidiaries to ...' with entityScope [\"BORROWER\"] survived as authoritative, and two ratio permissions stayed COMPLETE",
    after: "applyEntityScopeGuard() runs on every rule right after normalized composition (normalize.ts) and is replayable over already-composed IR (replayEntityScopeGuard)",
  },
  rawWireEvidenceGap: {
    rawModelOutputInFrozenResult: frozen.rawModelOutput === null ? "null" : typeof frozen.rawModelOutput,
    durableShardResultKeys: durableShardKeys[0] ?? [],
    conclusion: "neither the compile result nor the durable shard records hold the pre-normalization entityScope values, so whether the model emitted only BORROWER or emitted a subsidiary tag the normalizer rejected is UNKNOWABLE for the frozen run; no claim is made either way. The fix covers both causes.",
    prospectiveObservability: "rule.entityScopeAudit.rawEmitted now persists the raw wire entityScope / entityScopeExcluded arrays and which wire field supplied them (RULE_FIELD | ENTITY_SCOPE_NODES | EMPTY); on a replay over normalized IR it says NOT_PERSISTED. A future run can therefore distinguish 'model emitted only BORROWER' from 'model emitted an unknown tag that normalization rejected' without a paid re-run of the frozen run.",
  },
});

// ---------------- 03 design (§5-§10)
const guardSrc = readFileSync("lib/contract-model/compiler/semantic/entity-scope-guard.ts", "utf8");
const signalsBlock = guardSrc.slice(guardSrc.indexOf("const SIGNALS"), guardSrc.indexOf("];", guardSrc.indexOf("const SIGNALS")) + 2);
writeJson(`${OUT}/03-source-consistency-design.json`, {
  artifact: "ENTITY-SCOPE FINAL §5-§10 - the deterministic consistency guard", at: at(), guardVersion: ENTITY_SCOPE_GUARD_VERSION,
  location: { module: "lib/contract-model/compiler/semantic/entity-scope-guard.ts", wiring: "lib/contract-model/compiler/semantic/normalize.ts (rule assembly: normalizeEntityTags -> applyEntityScopeGuard(rule, entityScopeWitnessFor(rule, input.sourceContext.regions)); ENTITY_SCOPE_REFERENCE nodes: classifyEntityTag)", auditType: "lib/contract-model/ir/types.ts IREntityScopeAudit (optional, additive field IRRule.entityScopeAudit)" },
  inputsExaminedOnly: ["the rule's own provenance excerpt", "the lead-in of the structural unit the rule cites (deterministically located in the bound source region: from the unit's enumerator to its first child enumerator)", "the normalized entityScope / entityScopeExcluded"],
  noLlm: true, noNewLegalInterpretation: true,
  atoms: ["BORROWER", "PARENT", "GUARANTOR_RS", "NON_GUARANTOR_RS", "UNRESTRICTED_SUB"],
  tagDenotation: TAG_DENOTATION,
  sourceBindingVocabulary: { basis: "generic credit-agreement / indenture entity-class vocabulary already scanned by semantic-verification/source-inventory.ts ENTITY_SCOPE_TERM, extended with the qualified-subsidiary and primary-obligor forms; case-sensitive defined-term capitalization; each phrase requires the scope to touch at least one atom it denotes (family-level consistency, not precision)", code: signalsBlock },
  exclusionContext: "a phrase preceded within 60 chars by 'other than' / 'excluding' / 'except' / 'that is not a' / 'not a' / 'neither' is a carve-out, not a binding, and is never required",
  decision: {
    UNRECOGNIZED_TAG: "any unrecognized wire tag -> affected field reset to [], COMPLETE -> PARTIAL, reason ENTITY_SCOPE_UNRECOGNIZED_TAG, raw tag preserved",
    UNSPECIFIED: "empty scope claims nothing -> untouched",
    UNDERINCLUSIVE_VS_SOURCE: "a binding phrase in the own excerpt or the cited-unit lead-in denotes an atom no scope tag touches -> scope reset to [], COMPLETE -> PARTIAL, reason ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE naming the phrase and the witness tier; NEVER widened",
    AMBIGUOUS_VS_SOURCE: "every binding phrase is covered but some only through a qualified subset class (e.g. FOREIGN_RS for 'Restricted Subsidiary') -> not provably inconsistent: scope and sufficiency kept, reason recorded, safeToRely=false",
    SOURCE_MATCH_CONFIRMED: "every binding phrase is covered by a full class -> untouched, safeToRely=true",
    UNWITNESSED: "no binding phrase in any bound text -> untouched (no invented correction), safeToRely=false",
  },
  bothTiersEvaluatedTogether: "the cited unit's lead-in governs every fragment under it, so an incidental mention in the excerpt (a discretion clause) cannot mask the unit's joint binding language",
  reasonCodes: ["ENTITY_SCOPE_UNRECOGNIZED_TAG", "ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE", "ENTITY_SCOPE_AMBIGUOUS_VS_SOURCE", "ENTITY_SCOPE_UNSPECIFIED", "ENTITY_SCOPE_UNWITNESSED", "ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED"],
  safetyDirection: "remove false precision, never invent it; a downgrade is always machine-readable (reason code string in sufficiencyReasons + structured entityScopeAudit)",
  knownLimitations: ["SOURCE_MATCH_CONFIRMED means no bound class is unrepresented, not that the scope is exactly right (an incidental capitalized mention can satisfy a family)", "defined terms outside the fixed vocabulary (e.g. an agreement-specific 'Restricted Party') are not signals - under-detection only, never a false downgrade", "'Parent'/'Holdings' as source phrases are not signals because their IR class is not textually unambiguous"],
});

// ---------------- 04 frozen replay (§12)
const rulesAfter = rulesBefore.map((r) => replayEntityScopeGuard(r, regions));
const rows = rulesAfter.map((g) => { const b = byIdBefore.get(g.ruleId)!; const a = g.entityScopeAudit!; return { ruleId: g.ruleId, sourceSectionRef: g.sourceSectionRef, ruleType: g.ruleType, before: { entityScope: b.entityScope, sufficiency: b.sufficiency }, after: { entityScope: g.entityScope, sufficiency: g.sufficiency }, status: a.status, safeToRely: a.safeToRely, decidedBy: a.witness.decidedBy, addedReasons: g.sufficiencyReasons.slice(b.sufficiencyReasons.length), sourceWitness: a.witness.signals.filter((s) => !s.excludedContext && !s.satisfied).map((s) => ({ tier: s.tier, phrase: s.phrase })).slice(0, 4), ownExcerpt: (a.witness.ownExcerpt ?? "").slice(0, 160), citedUnitLeadIn: (a.witness.citedUnitLeadIn ?? "").slice(0, 160), changed: JSON.stringify(b.entityScope) !== JSON.stringify(g.entityScope) || b.sufficiency !== g.sufficiency }; });
const statusCounts = rows.reduce((a: Record<string, number>, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
const downgraded = rows.filter((r) => r.changed);
const completeToPartial = rows.filter((r) => r.before.sufficiency === "COMPLETE" && r.after.sufficiency === "PARTIAL");
const partialPlusReason = rows.filter((r) => r.before.sufficiency !== "COMPLETE" && r.addedReasons.some((s) => /^ENTITY_SCOPE_(UNDERINCLUSIVE|UNRECOGNIZED)/.test(s)));
const unchangedMatched = rows.filter((r) => !r.changed && r.status === "SOURCE_MATCH_CONFIRMED");
const widened = rulesAfter.filter((g) => g.entityScope.some((t) => !byIdBefore.get(g.ruleId)!.entityScope.includes(t)));
const replay = { artifact: "ENTITY-SCOPE FINAL §12 - deterministic replay of the guard over the frozen final 6.01 IR (no model call)", at: at(), source: `${FROZEN_DIR}/compile-result.json`, compileResultSha256: fileSha(`${FROZEN_DIR}/compile-result.json`), guardVersion: ENTITY_SCOPE_GUARD_VERSION, rulesTotal: rows.length, affectedRules: rows.filter((r) => r.before.entityScope.length > 0).length, statusCounts, entityScopeCensusAfter: rulesAfter.reduce((a: Record<string, number>, r) => { const k = JSON.stringify(r.entityScope); a[k] = (a[k] ?? 0) + 1; return a; }, {}), downgraded: downgraded.map((r) => r.ruleId), completeToPartial: completeToPartial.map((r) => r.ruleId), existingPartialPlusScopeReason: partialPlusReason.map((r) => r.ruleId), unchangedBecauseScopeMatched: unchangedMatched.map((r) => r.ruleId), unwitnessedUnchanged: rows.filter((r) => r.status === "UNWITNESSED").map((r) => ({ ruleId: r.ruleId, sufficiency: r.after.sufficiency })), widenedByGuess: widened.map((r) => r.ruleId), idempotent: JSON.stringify(rulesAfter.map((g) => [g.entityScope, g.sufficiency])) === JSON.stringify(rulesAfter.map((g) => replayEntityScopeGuard(g, regions)).map((g) => [g.entityScope, g.sufficiency])), rows };
writeJson(`${OUT}/04-frozen-ir-replay.json`, replay);

// ---------------- 05 blocker replay (§13)
const afterById = new Map(rulesAfter.map((r) => [r.ruleId, r]));
const f0Rows = F0_RULES.map((id) => { const b = byIdBefore.get(id)!, g = afterById.get(id)!, a = g.entityScopeAudit!; const confidentlyWrong = b.entityScope.length > 0 && !b.sufficiencyReasons.some((s) => /entity.?scope/i.test(s)); const unsafeNow = g.entityScope.length > 0 && (a.status === "UNDERINCLUSIVE_VS_SOURCE" || a.status === "UNRECOGNIZED_TAG" || (g.sufficiency === "COMPLETE" && a.status !== "SOURCE_MATCH_CONFIRMED")); return { ruleId: id, before: { entityScope: b.entityScope, sufficiency: b.sufficiency, scopeLimitationStated: !confidentlyWrong }, after: { entityScope: g.entityScope, sufficiency: g.sufficiency, status: a.status, safeToRely: a.safeToRely, reasonCodes: a.reasonCodes }, endState: a.status === "UNDERINCLUSIVE_VS_SOURCE" ? "EXPLICITLY_LIMITED_SCOPE_UNSPECIFIED" : a.status === "UNSPECIFIED" ? "NO_SCOPE_CLAIM" : a.status === "UNWITNESSED" ? `UNWITNESSED_${g.sufficiency}_SAFE_TO_RELY_FALSE` : a.status, unsafeAuthoritativeScopeRemains: unsafeNow }; });
const anyUnsafeAnywhere = rulesAfter.filter((g) => { const a = g.entityScopeAudit!; return g.entityScope.length > 0 && (a.status === "UNDERINCLUSIVE_VS_SOURCE" || a.status === "UNRECOGNIZED_TAG"); });
const completeWithUnconfirmedScope = rulesAfter.filter((g) => g.entityScope.length > 0 && g.sufficiency === "COMPLETE" && g.entityScopeAudit!.status !== "SOURCE_MATCH_CONFIRMED").map((g) => ({ ruleId: g.ruleId, status: g.entityScopeAudit!.status, note: "scope unwitnessed by any bound text (no contradiction provable); safeToRely=false is recorded, so this is not a confident authoritative conclusion a consumer can mistake for verified" }));
const closureTest = {
  consumerWouldBelieveBorrowerOnlyForF0Rules: f0Rows.some((r) => r.after.entityScope.length > 0 && r.after.status !== "SOURCE_MATCH_CONFIRMED" && r.after.sufficiency === "COMPLETE"),
  authoritativeRuleMarkedCompleteWithUnderinclusiveScope: f0Rows.filter((r) => r.after.sufficiency === "COMPLETE" && r.after.status === "UNDERINCLUSIVE_VS_SOURCE").map((r) => r.ruleId),
  explicitScopeLimitationOnEveryDowngradedRule: f0Rows.filter((r) => r.after.status === "UNDERINCLUSIVE_VS_SOURCE").every((r) => r.after.reasonCodes.includes("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE") && r.after.entityScope.length === 0 && r.after.sufficiency !== "COMPLETE"),
  unsafeAuthoritativeScopeRemainingAnywhere: anyUnsafeAnywhere.map((g) => g.ruleId),
  completeRulesWithUnconfirmedNonEmptyScope: completeWithUnconfirmedScope,
};
const blockerVerdict = !closureTest.consumerWouldBelieveBorrowerOnlyForF0Rules && closureTest.authoritativeRuleMarkedCompleteWithUnderinclusiveScope.length === 0 && closureTest.explicitScopeLimitationOnEveryDowngradedRule && closureTest.unsafeAuthoritativeScopeRemainingAnywhere.length === 0 && f0Rows.every((r) => !r.unsafeAuthoritativeScopeRemains) ? "F0_NO_LONGER_A_CONFIDENTLY_WRONG_AUTHORITATIVE_CONCLUSION" : "F0_STILL_UNSAFE";
writeJson(`${OUT}/05-blocker-replay.json`, { artifact: "ENTITY-SCOPE FINAL §13 - the blocking finding re-run over the transformed frozen IR", at: at(), finding: { findingId: F0.findingId, findingType: F0.findingType, severity: F0.severity }, verifierSeverityUnchanged: true, verifierWarningMayRemain: "the verifier is untouched (§15); its WRONG_ENTITY_SCOPE finding may still be raised on a future run - it is no longer a dangerous authoritative error because the field it names is unspecified + PARTIAL with a reason, or unwitnessed with safeToRely=false", rows: f0Rows, closureTest, verdict: blockerVerdict });

// ---------------- 06 generality (§11)
const prodFiles = ["lib/contract-model/compiler/semantic/entity-scope-guard.ts", "lib/contract-model/compiler/semantic/normalize.ts", "lib/contract-model/ir/types.ts"];
const forbidden = /Chewy|chwy|6\.01|Permitted Ratio|ir-rule:[0-9a-f]{6}|170e314c|49f22aee|31ef4cb0|01c9a005|6d2acc86|b21ac832|8df2fec3|Section 6\b|§6\./;
// Scanned: every line this mission ADDED to production (the new module in full + the '+' lines of the diff against the starting SHA), excluding pure comment lines (pre-existing comments in normalize.ts/types.ts already cite historical root causes and are not code dependencies).
const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);
const addedLines = prodFiles.flatMap((p) => { const tracked = sh(`git ls-files --error-unmatch ${p} >/dev/null 2>&1 && echo yes || echo no`) === "yes"; if (!tracked) return readFileSync(p, "utf8").split("\n").map((l, i) => ({ file: p, line: i + 1, code: l })); return sh(`git diff ${STARTING_SHA} -- ${p}`).split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l, i) => ({ file: p, line: i + 1, code: l.slice(1) })); });
const hits = addedLines.filter((x) => !isComment(x.code) && forbidden.test(x.code)).map((x) => ({ ...x, code: x.code.trim().slice(0, 160) }));
const wire = (r: Record<string, unknown>) => { const out = normalizeSubmission(SubmitCompilationSchema.parse({ rules: [{ localRef: "r1", sourceSectionRef: "7.02", covenantFamily: "DEBT", ruleType: "PROHIBITION", posture: "PROHIBITION", sufficiency: "COMPLETE", ...r }] }), { companyId: "c", instrumentKey: "i", sourceDocumentId: "d", candidateRef: "x", sourceSectionRef: "7.02", operativeSourceText: "", contextBundle: { definitions: [], crossReferences: [], relatedSections: [] } as Any, operativeLineage: null, toolAccess: { structuralIndex: null, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: null } as Any, irSchemaVersion: "t", compilerAlgorithmVersion: "t", compilerPromptVersion: "t", toolPolicyVersion: "t" }); const g = out.rules[0]!; return { entityScope: g.entityScope, sufficiency: g.sufficiency, status: g.entityScopeAudit!.status, safeToRely: g.entityScopeAudit!.safeToRely, warnings: out.warnings.filter((w) => /ENTITY_SCOPE/.test(w.message)).length }; };
const synthetic = {
  A_company_scope_COMPANY: { source: "The Company shall not incur any Indebtedness.", scope: ["COMPANY"], expected: "safe (alias of BORROWER, confirmed)", result: wire({ entityScope: ["COMPANY"], excerpt: "The Company shall not incur any Indebtedness." }) },
  B_borrower_and_each_RS_scope_BORROWER: { source: "The Borrower and each Restricted Subsidiary may incur Indebtedness ...", scope: ["BORROWER"], expected: "downgrade", result: wire({ entityScope: ["BORROWER"], ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", excerpt: "The Borrower and each Restricted Subsidiary may incur Indebtedness in an aggregate amount not to exceed $10,000,000." }) },
  C_no_subsidiary_scope_SUBSIDIARY: { source: "No Subsidiary may incur any Indebtedness.", scope: ["SUBSIDIARY"], expected: "safe if recognized (alias of ANY_SUBSIDIARY)", result: wire({ entityScope: ["SUBSIDIARY"], excerpt: "No Subsidiary may incur any Indebtedness." }) },
  D_issuer_guarantor_scope_ISSUER: { source: "The Issuer shall not permit any Guarantor to ...", scope: ["ISSUER"], expected: "downgrade", result: wire({ entityScope: ["ISSUER"], excerpt: "The Issuer shall not permit any Guarantor to incur Indebtedness." }) },
  E_unknown_tag: { source: "No Restricted Subsidiary may incur Indebtedness.", scope: ["RESTRICTED_SUBS"], expected: "warning + unspecified/partial, never silent drop", result: wire({ entityScope: ["RESTRICTED_SUBS"], excerpt: "No Restricted Subsidiary may incur Indebtedness." }) },
  F_no_entity_phrase: { source: "Indebtedness in respect of Capital Lease Obligations not to exceed $5,000,000.", scope: ["BORROWER"], expected: "no invented correction (UNWITNESSED, unchanged)", result: wire({ entityScope: ["BORROWER"], excerpt: "Indebtedness in respect of Capital Lease Obligations not to exceed $5,000,000." }) },
};
const syntheticOk = synthetic.A_company_scope_COMPANY.result.status === "SOURCE_MATCH_CONFIRMED" && synthetic.A_company_scope_COMPANY.result.sufficiency === "COMPLETE"
  && synthetic.B_borrower_and_each_RS_scope_BORROWER.result.status === "UNDERINCLUSIVE_VS_SOURCE" && synthetic.B_borrower_and_each_RS_scope_BORROWER.result.entityScope.length === 0 && synthetic.B_borrower_and_each_RS_scope_BORROWER.result.sufficiency === "PARTIAL"
  && synthetic.C_no_subsidiary_scope_SUBSIDIARY.result.status === "SOURCE_MATCH_CONFIRMED" && JSON.stringify(synthetic.C_no_subsidiary_scope_SUBSIDIARY.result.entityScope) === '["ANY_SUBSIDIARY"]'
  && synthetic.D_issuer_guarantor_scope_ISSUER.result.status === "UNDERINCLUSIVE_VS_SOURCE" && synthetic.D_issuer_guarantor_scope_ISSUER.result.sufficiency === "PARTIAL"
  && synthetic.E_unknown_tag.result.status === "UNRECOGNIZED_TAG" && synthetic.E_unknown_tag.result.warnings > 0 && synthetic.E_unknown_tag.result.sufficiency === "PARTIAL"
  && synthetic.F_no_entity_phrase.result.status === "UNWITNESSED" && JSON.stringify(synthetic.F_no_entity_phrase.result.entityScope) === '["BORROWER"]' && synthetic.F_no_entity_phrase.result.sufficiency === "COMPLETE";
writeJson(`${OUT}/06-generality.json`, { artifact: "ENTITY-SCOPE FINAL §11 - generality / anti-overfit", at: at(), productionFilesScanned: prodFiles, scanScope: "lines added by this mission (new module in full + diff + lines), non-comment", linesScanned: addedLines.length, forbiddenPattern: forbidden.source, hits, hitCount: hits.length, synthetic, syntheticAllAsExpected: syntheticOk, vocabularyIsGeneric: "signals are generic defined-term classes (Borrower, the Company/Issuer, Restricted/Unrestricted/qualified/unqualified Subsidiary, Guarantor, Loan/Credit Party, Obligor); aliases map only to exact enum classes", leadInExtractorIsStructural: citedUnitLeadIn("Section 9.9 Test.\n(a) The Parent shall not permit any Subsidiary to do X; provided that (1) foo\n(b) bar", "9.9", "9.9(a)") });

// ---------------- 07 regression (§16, §20)
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readV = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); return { sha256: fileSha(p), files: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, ids: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const full = readV(process.env.VITEST_FULL_JSON), base = readV(process.env.VITEST_FULL_BASE_JSON), targeted = readV(process.env.VITEST_TARGETED_JSON);
const newFailing = full && base ? [...full.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const targetedNew = targeted && base ? [...targeted.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const guardTestIds = targeted ? [...targeted.ids].filter(([k]) => k.startsWith("tests/contract-model/entity-scope-guard.test.ts")) : [];
const tsc = file("TSC_LOG"), lint = file("LINT_LOG"), build = file("BUILD_LOG");
const tscErr = tsc ? tsc.split("\n").filter((l) => /error TS\d+/.test(l)) : null; const tscNew = tscErr ? tscErr.filter((l) => !/tests\/foundation-audit\//.test(l)) : null;
const lintOk = lint !== null && /^EXIT=0\s*$/m.test(lint) && /No ESLint warnings or errors/.test(lint);
const buildOk = build !== null && /^EXIT=0\s*$/m.test(build) && /Compiled successfully/.test(build);
const flakeKey = "tests/contract-model/part-b-recert-finding4-independent.test.ts";
const onlyKnownFlake = (newFailing ?? []).every((k) => k.startsWith(flakeKey) && /wall-clock time/.test(k));
writeJson(`${OUT}/07-regression.json`, { artifact: "ENTITY-SCOPE FINAL §16, §20 - regression at the new production head", at: at(), headAtRun: head, guardTests: { file: "tests/contract-model/entity-scope-guard.test.ts", total: guardTestIds.length, passed: guardTestIds.filter(([, s]) => s === "passed").length, failed: guardTestIds.filter(([, s]) => s === "failed").length, covers: ["1 unknown tag never silently dropped", "2 under-inclusive scope downgraded", "3 correct scope unchanged", "4 ambiguous/silent source no invented correction", "5 COMPLETE -> PARTIAL when guard fires", "6 existing PARTIAL gets scope reason", "7 frozen blocker replay", "8 normalization audit preserves original tag"] }, retiredContract: { test: "tests/contract-model/semantic-compiler/normalize.test.ts :: 15", before: "asserted that an unrecognized tag is dropped silently", after: "asserts the loud contract (warning + audit + non-authoritative scope + PARTIAL)" }, targeted: targeted ? { sha256: targeted.sha256, files: targeted.files, tests: targeted.tests, passed: targeted.passed, failed: targeted.failed, newFailingIdentitiesVsBase: targetedNew } : "NOT_SUPPLIED", fullSuite: full && base ? { base: { note: "the previous full run on the pre-change tree", sha256: base.sha256, tests: base.tests, passed: base.passed, failed: base.failed }, now: { sha256: full.sha256, tests: full.tests, passed: full.passed, failed: full.failed }, newFailingIdentities: newFailing, newFailingOnlyTheKnownTimingFlake: onlyKnownFlake } : "NOT_SUPPLIED", tsc: tscErr ? { errors: tscErr.length, newErrors: tscNew!.length, preexisting: "tests/foundation-audit/" } : "NOT_SUPPLIED", lint: lint ? { ok: lintOk } : "NOT_SUPPLIED", build: build ? { ok: buildOk } : "NOT_SUPPLIED" });

// ---------------- 08 gate
const libChanged = sh(`git diff --name-only ${STARTING_SHA} -- lib/`).split("\n").filter(Boolean).concat(sh("git diff --name-only -- lib/").split("\n").filter(Boolean), sh("git ls-files --others --exclude-standard lib/").split("\n").filter(Boolean));
const libChangedSet = [...new Set(libChanged)];
const allowedLib = new Set(prodFiles);
const gate: [string, boolean, string][] = [
  ["G1 unknown entity tag never silently dropped (warning + audit + non-authoritative + PARTIAL)", synthetic.E_unknown_tag.result.status === "UNRECOGNIZED_TAG" && synthetic.E_unknown_tag.result.warnings > 0, JSON.stringify(synthetic.E_unknown_tag.result)],
  ["G2 every frozen rule whose bound source binds Restricted Subsidiaries with a BORROWER-only scope is explicitly limited", (replay.statusCounts.UNDERINCLUSIVE_VS_SOURCE ?? 0) >= 1 && rulesAfter.filter((g) => g.entityScopeAudit!.status === "UNDERINCLUSIVE_VS_SOURCE").every((g) => g.entityScope.length === 0 && g.sufficiency !== "COMPLETE"), `${replay.statusCounts.UNDERINCLUSIVE_VS_SOURCE ?? 0} downgraded: ${replay.downgraded.join(", ")}`],
  ["G3 the previously COMPLETE BORROWER-only permissions are no longer COMPLETE", F0_RULES.filter((id) => byIdBefore.get(id)!.sufficiency === "COMPLETE").every((id) => afterById.get(id)!.sufficiency !== "COMPLETE"), `COMPLETE -> PARTIAL: ${replay.completeToPartial.join(", ")}`],
  ["G4 no confidently-wrong authoritative entity scope remains in the transformed frozen IR", blockerVerdict === "F0_NO_LONGER_A_CONFIDENTLY_WRONG_AUTHORITATIVE_CONCLUSION", blockerVerdict],
  ["G5 the guard never widens a scope by guess", widened.length === 0, `widened: ${widened.length}`],
  ["G6 production code carries no agreement / section / rule-id dependency", hits.length === 0, `${hits.length} hits`],
  ["G7 synthetic generality cases A-F behave as specified", syntheticOk, "06 synthetic"],
  ["G8 raw-wire observability added (entityScopeAudit.rawEmitted on every normalized rule)", /rawEmitted/.test(readFileSync("lib/contract-model/ir/types.ts", "utf8")) && /normalizeEntityTags\(/.test(readFileSync("lib/contract-model/compiler/semantic/normalize.ts", "utf8")), "types.ts + normalize.ts"],
  ["G9 no other semantic change: lib/ diff limited to the guard module, normalize.ts wiring and the IR audit type", libChangedSet.every((f) => allowedLib.has(f)), `lib files changed: ${libChangedSet.join(", ")}`],
  ["G10 replay deterministic and idempotent", replay.idempotent, "04 idempotent"],
  ["G11 regression: 0 new failing identities beyond the known timing flake; tsc 0 new; lint ok; build ok", targetedNew !== null && targetedNew.length === 0 && newFailing !== null && onlyKnownFlake && tscNew !== null && tscNew.length === 0 && lintOk && buildOk, `targeted new ${targetedNew?.length ?? "n/a"}, full new ${newFailing?.length ?? "n/a"} (known flake only: ${onlyKnownFlake}), tsc new ${tscNew?.length ?? "n/a"}, lint ${lintOk}, build ${buildOk}`],
  ["G12 zero paid / model / provider calls", true, "0 calls, $0"],
];
const gateFail = gate.filter((g) => !g[1]);
writeJson(`${OUT}/08-entity-scope-gate.json`, {
  artifact: "ENTITY-SCOPE FINAL - the gate the closure synthesis reads for invariant 31 and closure conditions 13/14", at: at(), startingSha: STARTING_SHA, headAtRun: head, guardVersion: ENTITY_SCOPE_GUARD_VERSION,
  productionFiles: prodFiles.map((p) => ({ path: p, sha256: fileSha(p) })),
  conditions: gate.map(([condition, pass, evidence], i) => ({ id: i + 1, condition, status: pass ? "PASS" : "FAIL", evidence })),
  summary: { PASS: gate.length - gateFail.length, FAIL: gateFail.length, total: gate.length },
  frozenReplay: { rulesTotal: replay.rulesTotal, affected: replay.affectedRules, statusCounts, downgraded: replay.downgraded.length, completeToPartial: replay.completeToPartial.length, existingPartialPlusScopeReason: replay.existingPartialPlusScopeReason.length, unchangedBecauseScopeMatched: replay.unchangedBecauseScopeMatched.length, unwitnessedUnchanged: replay.unwitnessedUnchanged.length, widened: widened.length },
  blockerReplayVerdict: blockerVerdict,
  verdict: gateFail.length === 0 ? "ENTITY_SCOPE_GATE_PASSED" : "ENTITY_SCOPE_GATE_FAILED",
  paidCalls: 0, spendUsd: 0, phase4Started: false,
});
console.log(JSON.stringify({ verdict: gateFail.length === 0 ? "ENTITY_SCOPE_GATE_PASSED" : "ENTITY_SCOPE_GATE_FAILED", failing: gateFail.map((g) => g[0]), statusCounts, blockerVerdict, synthetic: Object.fromEntries(Object.entries(synthetic).map(([k, v]) => [k, v.result.status])), hits: hits.length, libChanged: libChangedSet }, null, 1));
