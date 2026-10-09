# Durable activation lifecycle — readiness and pilot

## Trace (exists vs missing)

| Transition | Status | Blocker |
|---|---|---|
| Authentic source → extracted candidate | **Exists** | Summary quality / cap |
| Extracted candidate → independently reviewed interpretation | **Path exists; not at scale** | Counsel ACCEPT/EDIT not run on bulk Neon |
| Reviewed interpretation → modeled rule | **Exists** | `compileAcceptedInterpretation` → MODELED UNVERIFIED Permission |
| Modeled rule → approved verification | **Missing at scale** | Human `reviewStatus: VERIFIED` gate |
| Approved verification → durable executable representation | **Partial** | Durable Permission rows exist; Phase-3 CERTIFIED / SemanticTruth empty |
| Durable → customer-ready certified | **Blocked** | Epistemic wall; no bulk cert |

## Transition that currently prevents persistence

For public Neon registry rows, **missing `companyId` / `documentId` binding** plus **absence of counsel ACCEPT** prevents durable Permission persistence against a real customer company. Ephemeral compiles prove the path, then clean up.

Secondary: even after MODELED mint, **VERIFIED review** and **CERTIFIED package seal** are separate gates — activation must not auto-promote DISCOVERED → CERTIFIED.

## Bounded review-gated pilot (proposal — no writes without auth)

**Scope:** ≤ 5 pre-selected Neon provisions (already in activation matrix), one EVALUATION tenant company, counsel operator.

1. Bind copies of selected KnowledgeSource metadata to a pilot `companyId` + `documentId` (authorization required).
2. Counsel ACCEPT each item in UI (or scripted ACCEPT with approval note) — no bulk ACCEPT.
3. Compile → MODELED UNVERIFIED Permission (existing interface).
4. Independent expected formula check (matrix) before any Position exposure.
5. Human sets `reviewStatus: VERIFIED` only after formula+refusal checks pass.
6. Attach **approved** financial snapshot (or keep SYNTHETIC label if none).
7. Attach attributed basketUsage or leave `ZERO_NO_ATTRIBUTED_USAGE` visible — never claim remaining.
8. **Stop before CERTIFIED / SemanticTruth.** Pilot ends at VERIFIED MODELED LEGACY_ENGINE.

**Out of scope:** automatic merge, paid inference, corpus-wide promotion, Phase-3 CERTIFIED seal.

**Success metric:** N durable Permissions with provenance to authentic source hashes + independent calculation pass + utilization status honest — still `NOT_CERTIFIED`.
