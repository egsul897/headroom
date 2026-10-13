# Restatement precedence gate

## Defect

`documentsShareOperativeAuthority()` permitted bidirectional predecessor↔successor
matching from confirmed restatement edges alone — conflating verified document
succession with operative authority for the specific provision as-of date.

## Correction

| Piece | Behavior |
|---|---|
| `resolveOperativeGoverningDocumentId` | As-of effective-date + supersession precedence; refuse missing dates, conflicts, unresolved succession |
| `documentsShareOperativeAuthority` | Provision governing must equal operative document; unit may be operative or its confirmed predecessor (discovery). Superseded predecessor governing REFUSES unless `verifiedContinuingProvisionRefs` |
| `authorityForUnit` | Passes handoff `asOfDate`, restatement scope, and partial provision refs |

Does **not** reopen unrelated-document section matching. No issuer exceptions.
Historical evidence preserved; amounts never invent authority.

## Adversarial coverage

- Differing basket amounts ($50M pred / $100M succ) — superseded predecessor REFUSES after effective date
- Temporal directions — pre-effective successor REFUSES; predecessor remains
- Missing effective date / conflicting confirmed successors / missing asOf REFUSE
- Unresolved succession + materially amended partial provision REFUSE
- Explicitly verified continuing provision on predecessor permitted

## Failing-before → passing-after

On tip `77ebc89b` before this gate (filtered): **6 failed**.
After: remediation **29/29** (+ compile / access / VE targeted suite).
