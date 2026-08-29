# Phase 3F.1.5.1 — Evaluation Methodology V2: Independent Adjudication Calibration & Live Semantic Validation

**Verdict: `PHASE_3F_1_5_1_EVALUATION_CALIBRATION_ENVIRONMENT_BLOCKED`**

Starting SHA: `7304cd24e385bb59528f652a73a7dba0358c751c` (Phase 3F.1.5's final commit). All 16 required machine-readable artifacts live under `docs/evaluation-v2-iteration/00-*.json` through `15-*.json`; this document is the narrative report and does not restate their full content.

This phase's mission was narrow and specific: resolve Phase 3F.1.5's one failed gate — independent second-pass adjudication agreement, which came in at 78.4–84.3% binary (required ≥90%) and 37.3% detailed (required ≥85%) — by *testing*, not assuming, whether the two previously-hypothesized confounders (a discovery-vs-representation communication gap, and the absence of a live semantic AI judge) actually explain the disagreement. It did not reach a verdict on that question, because the second confounder cannot be tested without an authorized model credential, and none is available in this execution environment. What it did produce is a rigorous, evidence-grounded explanation of the original failure and a fully-specified, ready-to-execute fix for the next iteration that has one.

---

## What was done

**Forensic classification of every original disagreement, before touching anything else.** All 32 detailed-disposition disagreements from Phase 3F.1.5's 51-case sample (a strict superset of the 11 binary-credit disagreements) were individually classified against a fixed 13-category cause taxonomy, using only the already-frozen evidence — no new judgment calls, no rewriting. The headline finding: **65.6% of the detailed disagreements (21 of 32) are not disagreements about credit at all.** They are cases where V2 and the second-pass reviewer both reach the identical no-credit conclusion but use different vocabulary for it — V2's `HONESTLY_UNRESOLVED` and `AMBIGUOUS` states collapsed into the second pass's single `UNREPRESENTED` bucket, because the original protocol never gave the reviewer an equivalent label. The 37.3% detailed-agreement number, taken at face value, substantially overstates how much genuine disagreement exists.

**A state taxonomy that separates discovery, representation, and verification**, formalizing the distinction V2's design already assumed but never wrote down for a reviewer: finding a sentence is not the same as compiling a structured representation of it, and compiling a representation is not the same as independently verifying it. Twelve states, explicit credit-collapse rules, and an explicit answer to the resulting five product-semantics questions — all on the record as design decisions, not metric-optimization choices (e.g., discovery-only surfacing can prevent a *dangerous-omission* classification without ever earning *representation* credit).

**A named, validated instance of why V2's stricter position is correct, not just defensible.** `doc-a::VI::6.10-chapeau` is one of the 14 confirmed Phase 3F.1.1 false credits — V2 correctly withholds credit because the only corresponding candidates were never compiled. The Phase 3F.1.5 second-pass reviewer, blind to that history exactly as the protocol requires, read the same discovery-stage excerpt and credited it anyway — independently reproducing the exact defect this whole evaluation lineage exists to prevent. This is the single strongest piece of evidence in this phase that the "communication gap" hypothesis, while real, does not mean V2's underlying position was wrong.

**A newly-discovered, real defect in V2 itself, found and left unfixed on purpose.** The compiled "Acquisition" IR-definition candidate was granted `PARTIAL` credit against three unrelated Section 1.01 definitional claims (facility sizes, net income, supply-chain financing) with near-identical boilerplate reasoning each time — a genuine, repeatable over-matching defect in the correspondence layer. Per the phase's explicit no-rewrite-after-seeing-results rule, this is documented in `01-original-disagreement-forensics.json` and left for a future V2 code iteration, not patched here.

**A designed, frozen, ready-to-run fix for the next iteration.** A new second-pass protocol giving the reviewer the same state vocabulary V2 uses, with abstract (non-package-specific) worked examples; a sampling strategy calling for a larger, doubly-stratified sample that reuses all 51 original cases plus 40+ new ones; and a precisely pre-registered agreement-computation rule that removes the vocabulary-mismatch artifact from future measurement without touching the 90%/85% thresholds themselves. None of this was executed — see below.

**Full regression re-confirmation.** All 14 known false credits remain caught (`silentlyUpheld: []`, freshly re-verified, not merely cited); the 10/10 false-credit-prohibition suite and 34/34 (equivalent to the required 33/33) adversarial suite both pass; tsc and eslint show zero new errors; and the historical Phase 3F.1.5 evidence base — all 19 files, re-hashed — remains byte-for-byte identical to the freeze-time baseline.

## Why the phase stops at `ENVIRONMENT_BLOCKED`

The charter is explicit and was followed to the letter: *"This phase requires an authorized model credential. If no credential is available: STOP... Do not claim the phase passed using mocks alone."* This was independently re-checked in this environment (not assumed carried over from Phase 3F.1.5) against this codebase's own canonical credential-resolution order (`AI_GATEWAY_API_KEY`, then `ANTHROPIC_API_KEY`, per `lib/extraction/get-provider.ts`) — neither is set, and the codebase has no Bedrock or other alternate model-access path that would make the AWS credentials present in this environment usable for this purpose.

The mandated rerun order (Section 12) puts live semantic judgment first, before deterministic V2 aggregation and before independent second-pass adjudication. With that step blocked, the rest of the ordered rerun cannot execute as specified — and even if the newly-designed protocol were run against a fresh sample right now, it could not answer the actual open question this phase exists to resolve (whether a live judge, not just clearer instructions, closes the gap), and the phase's own gate (Section 19) cannot PASS without live judgment regardless of what such a rerun showed. Running it anyway would produce a number with no way to interpret it and a real risk of looking like a result was manufactured to route around the blocker. The disciplined choice is to do everything credential-independent to the fullest, freeze the rest for immediate execution once unblocked, and say plainly that the gate is not re-tested.

**The original Phase 3F.1.5 numbers stand exactly as they were**: 78.4–84.3% binary, 37.3% detailed, both below threshold. Nothing in this phase raises, lowers, or reinterprets them into a pass.

## What this verdict does not mean

It does not mean Phase 3F.1.5's methodology gap is resolved, closer to resolved by an executed fix, or safe to route around. It does not mean the product's semantic coverage has changed — DSGR's combined CRITICAL+MATERIAL semantic recall remains the same ~0.6% Phase 3F.1.5 already reported, and 175 dangerous-unaccounted CRITICAL/MATERIAL units remain exactly as counted. It does not authorize Phase 3F.1.6, Phase 3F.2, or Phase 4.

## Next step

Obtain an authorized model credential (`AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`) in a future execution environment, then execute — in order, without further methodology changes — the frozen specification already sitting in `docs/evaluation-v2-iteration/05-second-pass-protocol.json`, `06-frozen-sample.json`, and `07-preregistered-agreement-computation.json`: live semantic judgment, deterministic V2 aggregation, independent second-pass adjudication, agreement computation, verdict. Separately and independently of that rerun, a direct excerpt-level read of the two candidate IDs behind this phase's remaining least-explained disagreement (`ir-rule:8543f9e7...` and `ir-rule:fb5206d4...`, cited inconsistently across `doc-a::X::10.01a-us-guaranty`, `doc-a::X::10.04-defenses-waived`, and `doc-a::X::10.06-reinstatement`) could resolve that specific residual question at zero model cost and does not need to wait for the credential.

## Stop condition

Per the phase charter, this phase stops here. No production defect discovered or already-known was fixed. No new sample was actually adjudicated. No unseen package was selected. No Phase 3F.1.6, 3F.2, or Phase 4 work began.
