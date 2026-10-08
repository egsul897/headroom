# HEADROOM — Parallel Agent Operating Rules (normative for this fleet)

**Artifact:** `docs/architecture/parallel-agents/00-operating-rules.md`  
**Workstream:** `WS-PAR`  
**Authority:** founder-dispatched concurrent Cursor Cloud Agent operating mandate (2026-10-08)  
**Does not supersede:** North Star v2, architecture invariants, NS-4 soft gates, Phase-3 seals

## Before coding

1. Fetch current `origin/main` and record its SHA in the workstream progress ledger.
2. Identify assigned workstream and exclusive file ownership from `01-workstream-map.json` (or claim only unowned paths after publishing an ownership amendment in WS-PAR docs — never silently).
3. Create an own branch matching `cursor/<descriptive-name>-0e3f` (or the agent’s registered suffix) and open a **draft** PR.
4. Read controlling North Star (`docs/headroom-north-star-v2.md`) and relevant architecture contracts for the workstream.
5. Inspect existing interfaces before introducing new ones.

## Must

1. Work only within assigned scope.
2. Avoid modifying another agent’s owned production files.
3. Reuse existing architecture and schemas.
4. Publish interface contracts before depending on unfinished work.
5. Commit and push independently.
6. Run focused tests and verify CI.
7. Report exact SHAs, changed files, test results, and integration dependencies.
8. Continue autonomously through the available session.
9. Maintain an append-only progress ledger in own workstream documentation.

## Never

- Merge without authorization.
- Rewrite sealed evidence.
- Change certification status.
- Modify Claude-owned acceptance expectations.
- Make paid provider calls or provision paid infrastructure without authorization.
- Introduce company-specific legal logic or silently certify AI-generated interpretations.
- Solve integration conflicts by silently changing another agent’s contract.

## Blocking rule

If another workstream blocks progress, create a **tested mock or interface adapter** in the blocked workstream’s exclusive tree (or a shared contract path published first by WS-PAR) and continue independently.

## Reporting

Every mission report from a fleet agent should include, at minimum:

- `baseMainSha`
- `branchTipSha`
- `changedFiles[]`
- `focusedTestCommand` + pass/fail counts
- `ciStatus` if known
- `integrationDependencies[]` (contracts consumed / published)
- `ownershipViolations` (must be empty, or disclose and revert)

Deliver mission reports in a four-backtick fenced block per `CLAUDE.md`.
