# Cross-document authority safety gate

## Tip (feature branch)

`cursor/cross-document-authority-gate-d829` — see final SHA after push.

## Defect

`provisionIdentityMatchesUnit()` matched section / defined-term identity without
checking whether the provision’s `governingDocumentId` is the unit’s source
document or a verified operative restatement successor.

## Fix (narrow)

| Export | Behavior |
|---|---|
| `documentsShareOperativeAuthority` | Same document **or** `OPERATIVE_AUTHORITY_CONFIRMED` restatement edge with both predecessor + successor present |
| `provisionIdentityMatchesUnit` | Document-relationship gate **then** section/term identity |

Fail closed: missing governingDocumentId, null predecessor, REVIEW_REQUIRED /
AMBIGUOUS / UNSUPPORTED / PROVISIONAL succession → refuse. No issuer exceptions.
Does not reopen document-only matching or credential-mutation remediations.

## Adversarial tests (remediation suite)

| Case | Expected |
|---|---|
| Identical section refs in unrelated documents | REFUSE |
| Same document + matching section | permit (existing gates still apply) |
| Verified restatement successor (`OPERATIVE_AUTHORITY_CONFIRMED`) | permit |
| Unverified / ambiguous succession | REFUSE |

## Failing-before → passing-after

Captured against tip `bf5dbe79` before the guard (filtered adversarial cases):

- `identical section refs in unrelated documents REFUSE` — **FAIL** (returned true)
- `same document + matching section` — **FAIL** (`documentsShareOperativeAuthority` missing)
- `verified amendment/restatement successor` — strengthened to require refuse-without-evidence
- `unverified or ambiguous succession REFUSE` — **FAIL** (returned true)

After guard: remediation **24/24** + compile 5 + access 12 + VE Position 7 = **48/48**.

## Propagation

Shared compiler file lives in `lib/contract-model/analysis/operative-covenant-package.ts`
(consumed by #310 / #311 / #312). Propagate the same commit onto those PR heads.
