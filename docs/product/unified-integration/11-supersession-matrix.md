# Supersession matrix — canonical candidate

**Do not auto-merge or auto-close.** Human review required.

| PR | Tip | Disposition after canonical lands |
|---|---|---|
| **Canonical** `cursor/canonical-integrated-product-10ff` | (this PR) | **Merge candidate** |
| #250 | `ac0ff925` | Superseded by canonical (includes Stages 2–5 + delta) |
| #249 | `f6322ed7` | Superseded (in #250 ancestry) |
| #248 | `dd727d2b` | Superseded (in #250 ancestry) |
| #247 | `0838455d` | Superseded (in #250 ancestry) |
| #251 | `887d7011` | Superseded — sequential overlap; secured floor replaced by #231 packageAuthoritative |
| #243 / #223 | older | Superseded by #247/#250 sequential |
| #213 | `696bd7fa` | Superseded by #250 Stage 5 |
| #220 | tip | Superseded by #248 |
| #231 | `ee460cc3` | Partially absorbed (election + packageAuthoritative); do not merge tip wholesale (would regress #237 util fail-closed in election) |
| #218 / #221 | tips | Selective content in #249/#250; close as superseded after verify |
| #232 / #234 / #239 / #241 | — | Already superseded by #237 on main |

## Merge order recommendation

1. Human-review **canonical PR** only (this branch).
2. After land: close superseded opens listed above (human action).
3. Do **not** merge #231 tip or #251 independently afterward.
