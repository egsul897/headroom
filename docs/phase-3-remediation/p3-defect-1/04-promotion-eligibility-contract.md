# Promotion eligibility contract

§7 asks for a production-facing eligibility predicate before implementation. The honest
finding is that the predicate this mission was asked to write **already exists and is
already correct**, and that the mission's premise - that it is too restrictive - is false.

## What exists today

```ts
export function isEligibleForSemanticCompilation(candidate: DiscoveredCandidate):
  { eligible: boolean; reason: string | null }
```

It excludes `REPRESENTATION` and nothing else. Everything downstream of it - source
support, structural identity, semantic role, action/object identity, material conditions,
contradiction, representability, sufficiency - is decided **after** compilation runs, by
`normalize.ts`'s sufficiency enforcement, the IR type-checker, Phase-3C verification and
`stage-promotion.ts`'s executability gates. That ordering is deliberate and it is the
right one: eligibility is cheap and permissive, and the expensive, evidence-bearing checks
happen once there is something real to check.

## Why a stricter intake predicate would be the wrong change

§6 requires promotion to be evidence-driven. A candidate that has not been compiled yet
has almost no evidence attached to it - a role, a section ref, a short description, a
confidence number. Every one of those is a **label**, and §6 forbids promoting on labels.
The only way to judge source support, semantic role, action identity or material conditions
is to compile the candidate and then judge the result. Moving those checks upstream would
mean deciding them from exactly the signals §6 says must never decide them.

## The three outcomes (§8), and where each is actually decided

| outcome | decided by | on what evidence |
|---|---|---|
| `SUBSTANTIVE_REPRESENTATION` | compilation produced rules/definitions whose `evaluationClass` is neither UNSUPPORTED nor JUDGMENT_REQUIRED | the compiled IR itself |
| `HONEST_UNRESOLVED` | `evaluationClass = JUDGMENT_REQUIRED`, a failed verification, or a self-declared partial sufficiency | the compiler's own `unresolvedReasons`, the verifier's dispositions |
| `INVENTORY_ONLY` | the candidate was discovered and no compiled representation is anchored to it | absence of compiled output |

That boundary is drawn where the evidence is. This mission does not move it.

## The one contract change worth making, and why it is not made here

The LSB finding shows a real weakness: a compiled rule can be demoted to
`HONEST_UNRESOLVED` by a verbatim-citation check against a citation form the source
document never writes. That is a defect in the demotion side of the boundary, not the
promotion side, and it is P3-DEFECT-4 work. §1 and §10 forbid taking it here, and doing so
would smuggle section-mapping changes into a promotion mission.
