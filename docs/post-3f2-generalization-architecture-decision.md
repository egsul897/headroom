# POST-3F.2 Generalization Remediation Architecture Decision

**Session type: architecture decision only. No production code was modified. No re-run of Riot occurred. No new validation phase was created.**

Input state: Phase 3F.2 final verdict `PHASE_3F_2_UNSEEN_PACKAGE_VALIDATION_FAILED`, Phase 4 readiness `NO_GENERALIZATION_NOT_YET_SUFFICIENT`, production frozen at `00f49ac2d451fb41ca25b7e255422170c654f415`, final evidence HEAD `1711ee8`. All hard safety gates passed — this document is about closing two generalization-quality gaps, not fixing a trust boundary.

The full machine-readable version of everything below is `docs/post-3f2-generalization-architecture-decision.json`.

## 1. Executive diagnosis

The system did not become unsafe on Riot; it became **incomplete** in two independent, narrow, and separately-fixable ways. Neither failure required an architecture redesign or a schema migration to close — both are bounded gaps sitting inside already-sound architecture:

- **Semantic compilation**: the schema, IR, and normalization layers already fully support extracting an arbitrary number of sibling propositions from one source region (`definitions[]`, `rules[]`, `sharedCapacities[]` are unbounded arrays end-to-end, with no collapse logic anywhere). What's missing is an explicit instruction telling the model to be *exhaustive* about definitions specifically — that instruction exists for rules ("emit one WireRule per independently operative rule") but has no analogue for definitions — plus any deterministic, model-independent check that would notice an incomplete extraction.
- **Package graph**: the restatement-target-resolution regex is tuned for a caption-style reference ("the X, dated as of Y") that does not match the recital-style phrasing Riot's actual documents use ("parties to a Credit Agreement dated as of..."). And even a correctly-resolved restatement chain has no downstream consumer that would ever compute "document X is now operative" — that concept simply does not exist anywhere in the current data model yet.

Both failures were caught safely: zero dangerous silent omissions, zero false-VERIFIED certifications, zero stale-document assertions occurred anywhere in Phase 3F.2.

## 2. Claim-level failure ledger

All 7 material IN_SAMPLE NO_CREDIT claims, no two collapsed into one row (full detail in the JSON artifact):

| Claim | Section | Materiality | Omitted/misstated | Verifier | Earliest layer | Category |
|---|---|---|---|---|---|---|
| RGT-C-008 | doc-a §1.01 "Final Maturity Date" | CRITICAL | Term entirely absent from a definitions array that captured ~12 siblings correctly | MATERIAL_DISCREPANCY | SEMANTIC_COMPILATION | Model semantic omission |
| RGT-C-029 | doc-a §1.01 "Collateral Documents" | MATERIAL | Same housing candidate as above, same pattern | MATERIAL_DISCREPANCY | SEMANTIC_COMPILATION | Model semantic omission |
| RGT-C-030 | doc-c §1.01 (3 linked definitions) | MATERIAL | Only 1 of 3 interlinked terms extracted | MATERIAL_DISCREPANCY | SEMANTIC_COMPILATION | Model semantic omission |
| RGT-C-022 | doc-a §1.01 "Day Count Fraction" | MATERIAL | Excerpt truncated with an ellipsis exactly over a required qualifier | UNCERTAIN finding naming the exact gap | SEMANTIC_COMPILATION | Model semantic omission / plausible truncation artifact |
| RGT-C-018 | doc-a §2.03(h) | MATERIAL | No operative text retrieved at all — ambiguous TOC-vs-heading node resolution | VERIFICATION_FAILED | STRUCTURAL_INDEX / CONTEXT_RETRIEVAL | Structural ambiguity |
| RGT-C-014 | doc-a §1.01 + §2.04(a) | CRITICAL | §2.04(a) half never compiled — cost-ceiling exclusion | MATERIAL_DISCREPANCY (on the compiled half) | Sampling scope | Sampling artifact |
| RGT-C-058 | doc-b §3.03(a)-(e) | MATERIAL | 3 of 5 lettered conditions never compiled — cost-ceiling exclusion | VERIFICATION_INCOMPLETE / MATERIAL_DISCREPANCY | Sampling scope | Sampling artifact |

Distribution: 4 model-semantic-omission, 1 structural-ambiguity, 2 sampling-artifact. **Zero** are schema/IR-expressiveness failures, batching-architecture failures, or verifier defects.

## 3. Semantic-compiler root cause

Tested rigorously per the mission's four-question framework:

- **(A) Did the model see the necessary source?** Most likely yes — `operativeSourceText` is built from an unbounded `index.getNodeText(..., "DESCENDANTS")` call and passed to the model with no truncation at that stage. Not independently re-verified against the exact discovery-candidate boundary for these three claims, so flagged as highly probable rather than certain.
- **(B) Did the model see it all but omit part?** Yes — this is the operative finding. `prompt.ts` contains an explicit "MULTIPLE RULES" exhaustiveness instruction ("one source section... may contain more than one independently operative rule... emit one WireRule per independently operative rule") but **no equivalent instruction for definitions anywhere in the file**, and none of its six few-shot examples demonstrates multi-definition extraction. Every alternative explanation was checked and eliminated: `wire-schema.ts`'s arrays have no `.max()`; `normalize.ts` performs a straight 1:1 `.map()` over every returned element with no filter/dedup/first-N logic; the 128,000-token output ceiling is far from binding; genuine `max_tokens` truncation is handled by a distinct, structured `OUTPUT_TRUNCATED` path, not a silent per-item drop.
- **(C) Was the IR capable of representing the missed semantics?** Yes, fully — `IRCompilationUnit.definitions: IRDefinition[]` is a plain unbounded array with no cap anywhere in the type file or `validate.ts`. **Do not blame the IR.**
- **(D) Did verification catch the omission?** Yes, for all 4 semantic-compilation-attributed claims — every housing candidate carried a non-confident status, and for RGT-C-022 the verifier independently named the exact dropped qualifier. **Safety worked; automation failed.** No separate verifier defect exists here.

## 4. Multi-claim / candidate cardinality analysis

No `1 candidate → 1 claim` assumption exists anywhere in the codebase. `SemanticCompilationResult.rules/definitions/sharedCapacities` are arrays from the type declaration through normalization to the final IR; the only place an array gets narrowed is `recoverPartialSubmission`, which keeps the longest valid prefix **only** on a genuine `stop_reason === "max_tokens"` signal — never as a normal-path heuristic. The architecture already implements **SOURCE CANDIDATE → 1..N SEMANTIC CLAIMS**. This means the fix needs no schema change, no candidate/claim identity split, and no migration — it is entirely a prompt-instruction plus a new, additive completeness-verification layer.

## 5. Token / truncation analysis

Five candidate mechanisms were checked against the RGT-C-022 ellipsis:

- **Source truncation** — not evidenced either way from the code alone.
- **Context-window truncation** — ruled out for the primary source text (unbounded, untouched); *plausible* for follow-up tool calls, since `tools.ts` caps individual tool results at `MAX_TEXT_RESULT_CHARS = 4000`.
- **Model output truncation** — a real mechanism exists, but it behaves as a structured whole-item drop with an explicit marker, not a silent ellipsis inside an otherwise-valid, COMPLETE definition — an unlikely exact match.
- **Post-processing truncation** — ruled out; nothing in `normalize.ts`/`wire-schema.ts` shortens strings.
- **Display-only truncation** — no such layer found in the backend files inspected.

**Most plausible explanation**: the model generated the ellipsis itself, either abbreviating its own excerpt or paraphrasing a tool result already truncated at the 4,000-character ceiling. This is inferred, not directly proven, absent the raw model transcript. No continuation/retry protocol exists anywhere in the codebase for either case — only the prefix-keep-and-drop recovery described above, which cannot recover an omission that occurred with no truncation signal at all (the RGT-C-008/029/030 pattern). Critically: **there is no deterministic pre-count anywhere of how many propositions a candidate should yield**, which is exactly the gap Section 10's recommended fix closes.

## 6. Package-graph root cause

Traced end to end through the real production code and the real preserved fixtures:

1. **Bug 1 — regex too narrow.** `relationship-resolution.ts`'s `AGREEMENT_REF_RE` requires an immediately-adjacent "the/that certain [prefix][label], dated as of [date]" phrase. Riot's actual recitals read "The Borrower and Lender **are parties to a** Credit Agreement dated as of April 22, 2025" — a determiner ("a") and intervening free text the regex cannot match. Zero references are found, forcing both restatement candidates to `UNRESOLVED`/confidence 0. **A looser regex already exists one module away** (`document-identity.ts`'s `originalAgreementReferenceHint`), which *did* successfully capture this exact sentence for both documents — but `relationship-resolution.ts` never consumes it, re-deriving its own (failing) match independently.
2. **Latent date-ambiguity risk.** Both doc-b's and doc-c's recitals cite the *original* April 22, 2025 date, not the immediately preceding document's date — a standard drafting convention. Naive date-matching would resolve doc-c's target as doc-a, not doc-b. Doc-c's recital does carry the qualifying language needed to resolve this correctly ("as amended and restated as of the First Amendment and Restatement Effective Date"), but nothing currently parses it. This risk was never actually triggered this run (bug 1 stopped things earlier), but any fix to bug 1 must account for it or it converts a safe "no signal" failure into a silent wrong-answer failure.
3. **Bug 3 — an existing safety fix is unwired.** `computeOperativeContractState` filters effects by `targetInstrumentKey === instrumentKey` before anything else runs; both Riot restatement effects have a null target key (because bug 1 never resolved them) and are excluded *before* they can even reach the `unattachedEffects` array. The module's own authors already built an escape hatch for exactly this case — an `unresolvedTargetEffectsForThisInstrument` parameter, documented as addressing a prior "DSGR first-blind F3 finding" — and it is even used correctly in an existing regression test script. **Neither real production call site (the orchestrator, nor the Riot run script) wires it in.** The fix already exists in the codebase; it simply isn't connected.
4. **Bug 4 — no concept of "the operative document" exists anywhere.** `chain.ts`'s grouping logic only recognizes SECTION- or DEFINITION-kind targets; a full-restatement effect is always DOCUMENT-kind by construction, so it can *never* enter a provision chain, resolved or not. An exhaustive search of the amendment module for any notion of "operative document," "currently operative," or similar returned zero hits outside the effect-construction code itself. **Even a hypothetically perfect fix to bugs 1–3 would still not produce a "doc-c is operative" answer**, because nothing consumes a resolved restatement chain to compute that.

The proximate cause of this run's specific empty result is bugs 1 and 3 together (the honest "review required" signal never even surfaces). But the actual mission question — which document governs — additionally requires closing bug 4.

## 7. Restatement semantics

The relationship-*type* taxonomy is **not** collapsed — `RESTATES` already has its own distinct value, separate from `AMENDS`, mapped 1:1 onto the real Prisma enum. What *is* conflated is the evidence/resolution machinery: the same caption-style matcher is applied to `AMENDS`, `RESTATES`, `SUPPLEMENTS`, and `JOINS` alike, tuned for a targeted amendment's typical title convention rather than a full restatement's typical recital convention. At the effect-construction layer, restatements are already handled distinctly (`isFullRestatement` produces a single DOCUMENT-kind effect, bypassing the per-provision loop entirely) — the conflation exists *only* upstream, in evidence detection. **No new relationship type is needed.** Fix the evidence pattern that feeds the existing type, and add the missing consumer.

## 8. Document-version-chain analysis

The existing effect-based architecture (detect a modification → resolve its target → sequence into a chain → expose the result) is the right general shape and does not need replacing. It was simply never extended to whole-document targets: `chain.ts`'s data model structurally excludes them. The fix is a **narrow, additive** parallel chain-builder for DOCUMENT-kind effects, feeding an additive new field on the existing `OperativeContractState` output — not a first-class `DocumentVersionChain` Prisma object with its own migration. Per the mission's own instruction not to choose the heavier option "unless evidence requires it": the evidence here does not require it.

## 9. Operative-state aggregate-status analysis

`OPERATIVE_STATE_RESOLVED` is confirmed overloaded — the type has no status value distinguishing "nothing ever existed to resolve" from "resolution was attempted and failed to attach anything," and the single assignment site makes these two cases byte-for-byte identical whenever failed effects never reach the `unattachedEffects` array. Code proves this shares the *same root* as the package-graph defect (bug 3 above): the type design already intends to distinguish these cases via `unattachedEffects`, and that safeguard depends entirely on wiring the same escape hatch identified in Section 6. **One fix, not two.** A future, independent product-quality improvement could still add a fifth status value for extra clarity, but it is not required to close the Riot gap.

## 10–11. Architecture options and recommendations

**Semantic compilation** — three options evaluated (full detail in the JSON): (1) a prompt-only exhaustiveness fix, (2) a deterministic, regex-based completeness cross-check that flags candidates whose compiled output is a strict subset of the source's detectable defined-term citations, (3) splitting definition candidates to term-level granularity. **Recommended: (2) bundled with (1).** Both are additive, require no migration, and generalize by detecting the *shape* of an omission rather than any term's name. (3) is rejected as disproportionate — mirroring the codebase's own prior explicit rejection of an equally invasive continuation architecture for the unrelated token-truncation problem.

**Package graph / restatement resolution** — three options evaluated: (1) targeted regex broadening plus reuse of the already-successful `document-identity.ts` extraction, with an explicit safeguard against the date-ambiguity risk, plus wiring the existing escape hatch; (2) an additive document-level chain and a new `computeOperativeDocument` consumer; (3) a full first-class `DocumentVersionChain` domain object requiring a Prisma migration. **Recommended: (1) bundled with (2).** Both are additive; (3) is explicitly rejected — the evidence shows the existing pattern needs finishing, not replacing.

## 12. Implementation blast radius

Two **separate** implementation units, sharing **one** validation gate (the mission's own default when code coupling doesn't force combination — and here it doesn't; the two units touch entirely disjoint modules):

- **SEMANTIC-COMPILER DEFINITION-EXHAUSTIVENESS REMEDIATION** — LOW-MEDIUM scope, `semantic/prompt.ts` + a new small completeness-check module + wiring, no migration.
- **PACKAGE-GRAPH RESTATEMENT-TARGET-RESOLUTION REMEDIATION** — MEDIUM scope, `relationship-resolution.ts` + call-site wiring + additive chain/operative-state extensions, no migration.

## 13. Validation strategy (designed now, not run)

1. Narrow synthetic/adversarial tests targeting each named failure (multi-definition sections, qualifier-truncation, non-caption recital phrasing, multi-restatement chains, and specifically the date-ambiguity adversarial case).
2. Known-package regression (FWRG/LSB/DSGR/CONMED), read-only.
3. **Frozen Riot replay as a regression test** — not new unseen evidence — confirming the named claims move from NO_CREDIT to CREDIT and the operative document resolves correctly, with no regression on currently-credited claims.
4. One future genuinely unseen package: **not a hard gate**, recommended only as a strengthening step if steps 1–3 come back clean, since re-checking the same fixed defects against Riot again (without any Riot-specific code) is legitimate confirmation, not overfitting.

## 14. Phase 4 release criterion

Hard safety gates stay clean (unchanged from 3F.2); the four named semantic-compilation omissions demonstrably close on frozen-Riot-replay with no regression on currently-credited claims; the operative-document concept correctly and non-emptily resolves doc-c on frozen Riot; no package-specific logic anywhere in the fix (grep-verifiable); no new regressions on known packages; independent unseen confirmation is recommended, not required. This deliberately does **not** demand a mechanical re-clearing of the 85%/95% thresholds on the same small sample — it demands demonstrated closure of the *specific, named* defects.

## 15. Explicit things not to do

No Riot-specific prompts, term lists, or section rules. No auto-created 3F.2.1. No reopening 3F.1. No starting Phase 4. No production changes this session. No re-running Riot as new unseen evidence or tuning against it. No skipping/disabling tests. No schema migration for either fix. No term-level candidate splitting as a first response. No treating the status-overload finding as requiring a new enum value. No endless reruns beyond the single frozen-Riot-replay check. No new macro-phase name — this is bounded Phase 3F closure remediation.

---

## Final answers (per mission Section 22)

1. **Semantic-compilation root cause**: a prompt-completeness gap — explicit exhaustiveness instruction exists for rules but not definitions, no worked examples, and no deterministic completeness check exists anywhere to catch the gap mechanically. Schema/IR/normalization are fully sound and not the cause.
2. **Package-graph root cause**: a too-narrow restatement-target regex misses Riot's recital phrasing; an existing, purpose-built safety escape hatch for exactly this failure mode is unwired at both real call sites; and no code anywhere consumes a resolved restatement chain to answer "which document is operative" — that concept doesn't exist yet.
3. **Trust-boundary defect?** No, for either. Both failed safely at every observed step.
4. **Architecture defect?** No for semantic compilation (bounded, schema sound). Partially for package graph — the regex/wiring bugs are local, but the missing operative-document concept is a real, narrow, additively-closable gap.
5. **Preferred semantic architecture**: deterministic completeness cross-check + prompt exhaustiveness fix; reject term-level candidate splitting.
6. **Preferred package/version architecture**: targeted regex/wiring fixes (with the date-ambiguity safeguard) + an additive operative-document concept; reject the full schema-migrated version-chain object.
7. **Estimated implementation scope**: semantic LOW-MEDIUM; package-graph MEDIUM.
8. **Schema migration needed?** No, for either.
9. **Another unseen package required?** Not strictly mandatory before Phase 4 — recommended, discretionary.
10. **Proposed next implementation unit names**: `SEMANTIC-COMPILER DEFINITION-EXHAUSTIVENESS REMEDIATION`, `PACKAGE-GRAPH RESTATEMENT-TARGET-RESOLUTION REMEDIATION`, and a shared `POST-3F.2 REMEDIATION VALIDATION GATE`.
11. **Phase 4 release criterion**: hard safety gates clean; the four named omissions demonstrably closed on frozen-Riot-replay without regression; the operative-document concept correctly resolves doc-c; no package-specific logic; no new known-package regressions; independent unseen confirmation recommended but not required.

**STOP. No production implementation occurred in this session.**
