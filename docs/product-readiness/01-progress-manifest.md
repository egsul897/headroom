# Progress manifest — independent product validation (branch `claude/independent-product-validation`)

| checkpoint | content | status |
|---|---|---|
| 0 | baseline recorded; branch from `origin/main` `9de4e573`; open Cursor PRs #125–#135 noted; repository map | done |
| 1 | synthetic corpus A–H with independent expectation manifests and hash-pinned integrity test | pending |
| 2 | offline acceptance runner + coverage/omission auditor + structured report | pending |
| 3 | acceptance and safety-invariant tests | pending |
| 4 | acceptance run artefacts, defect register, readiness scorecard | pending |
| 5 | MVP specification, commercial validation plan, draft PR | pending |

Rules kept: no provider call; no edit under `lib/`, `app/`, `prisma/`, existing tests, CI, sealed evidence; no fixture tuned to make Headroom look good; every finding records input, expectation, actual, SHA, severity and an outcome class.
