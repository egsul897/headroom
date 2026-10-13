# Canonical PR plan (post-`8374fa2a`)

## Landing tip

| | |
|--|--|
| Branch | `cursor/package-wide-covenant-execution-b8f6` |
| Base | `main` @ `8374fa2a` |
| Absorbs | #340 verified-remaining authority (selective) |
| Preserves | #333 PAI-01–12, #334 NS-4 binder |

## Open PR disposition

| PR | Action |
|---|---|
| #340 | Superseded by this tip for cross-domain authority + Simulate panel |
| #336 | Already superseded; do not merge |
| #342 / #343 | Competing NS-4 landings — do not dual-merge; reconcile only if unique modules remain after this lands |
| #322 / #325 / #327 / #338 / #339 | EBITDA / leverage product PRs — absorb later only if non-overlapping with #334 binder |
| #308 / #310 | Separate follow-ons (capacity boundary / compiler) |

## Anti-patterns refused

- Parallel covenant / capacity engines  
- Caller-boolean verified remaining  
- False EXECUTABLE from synthetic fixtures  
- Company-id hardcoding in evaluator  
- Self-merge / production authority activation
