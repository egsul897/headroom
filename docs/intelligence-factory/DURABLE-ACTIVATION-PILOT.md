# Durable activation pilot — authorization-gated

## Purpose

Exercise authentic source → counsel ACCEPT → MODELED Permission → independent calculation check → human VERIFIED review on a **bounded** set, using existing Neon schema and approval infrastructure.

**Not** corpus-scale promotion. **Not** CERTIFIED seal. **Not** automatic Neon writes.

## Hard gates (must all be true)

| Gate | Requirement |
|---|---|
| Human authorization | Named operator approval recorded before any Neon write |
| Legal acceptance | Per-item counsel `ACCEPT` / `EDIT` (no bulk ACCEPT) |
| Source binding | Pilot `companyId` + `documentId` on EVALUATION tenant only |
| Formula check | Independent expected formula passes before Position exposure |
| Utilization honesty | Remaining capacity claimed only if `currentUsageAuthoritative` |
| Financial label | Approved snapshot **or** unmistakable `SYNTHETIC` / `AUTHENTIC_SOURCE_BACKED` label |
| Certification wall | Stop before SemanticTruth / KF CERTIFIED |

## Scope

- **≤ 5** provisions from the activation matrix (recommend: CONMED §7.2, ROCK §7.01, ROCK §6.18, CONMED §7.3(m), one refusal control).
- One `tenantKind: EVALUATION` company.
- Ephemeral or clearly named pilot company id (e.g. `neon-activation-pilot-<date>`).

## Procedure

1. Obtain written authorization for Neon writes (ticket / approval note).
2. Create EVALUATION company + documents (authorized write).
3. Copy selected KnowledgeSource metadata onto bound `sourceId`s (authorized write).
4. Counsel ACCEPT each item with approval note citing authorization.
5. `compileAcceptedInterpretation` → MODELED UNVERIFIED Permission.
6. Run independent expected formula check (matrix / holdout).
7. Human sets `reviewStatus: VERIFIED` only after checks pass.
8. Attach financial inputs (approved or labeled).
9. Attach attributed `basketUsage` or leave non-authoritative status visible.
10. **Stop.** Do not CERTIFY. Do not expose as customer-ready certified permission.

## Success criteria

- N durable Permissions with provenance to authentic source hashes.
- Independent calculation pass; 0 false favorables.
- Utilization status honest on any remaining-capacity surface.
- Still `NOT_CERTIFIED`.

## Explicitly out of scope

- Automatic merge of PRs
- Paid inference
- Bulk ACCEPT / bulk VERIFIED
- Production customer tenant writes without separate authorization
