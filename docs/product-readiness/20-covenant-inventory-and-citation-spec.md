# Covenant inventory data contract and evidence-citation interface (directive product backlog 5–6)

Both are derived from what the offline acceptance runner already serialises per unit; nothing here needs a new
production capability to be *stored*, only to be *shown*. Fields are named as the production types name them so the
product never re-derives them. Where a field is unavailable today, the register id that blocks it is given.

## 1. Covenant inventory — one row per unit

| field | source (production type / acceptance report) | shown to | today |
|---|---|---|---|
| unitId | `DiscoveredCandidate.discoveryId` / `IRRule.ruleId` | all | available |
| document, sectionRef, occurrence, nodeId | `StructuralNode` (documentId, sectionRef, nodeId); occurrence from `findNodesByRef` | all | available; duplicate labels surface as AMBIGUOUS (E, G) — show the occurrence, never pick one |
| family, role, posture, action | `IRRule.covenantFamily / ruleType / posture / action` | treasury, legal | available; unknown families relabelled (IPV-18) — show the "verify manually" issue |
| entityScope / entityScopeExcluded | `IRRule.entityScope*` | legal | available; widened scope certifies (IPV-01) — product-layer rule until fixed |
| capacity expression (amount, currency, percent-of-metric, ratio gate, builder) | `IRRule.capacityExpression` | treasury, CFO | available; EUR never converted (F); builder pools not representable (IPV-15); threshold-as-cap certifies (IPV-22) |
| conditions, exceptions, shared caps | `IRRule.conditions / exceptions`, `IRSharedCapacity` | legal | available; dropped "together with" certifies (IPV-02), lineage-cited dropped proviso certifies (IPV-03) |
| dependsOn (other units), definitions used, unresolved dependencies | `IRRule.dependsOn`, bundle items, `unresolvedDependencies` | legal | available; definition-mediated links rejected (IPV-15); plural terms unresolved (IPV-09) |
| operative lineage (base text, applied chain, current text, source document, as-of) | `OperativeProvisionView` (fullChain, appliedChain, currentText, currentSourceDocumentId) | all | available at clause level for section restate/delete (C); definition amendments wrong (IPV-19/20); overrides absent (IPV-16); unresolved amendments silent (IPV-05) |
| sufficiency and reasons | `IRRule.sufficiency / sufficiencyReasons` | legal | available |
| certification record (status, blockers), verification findings | `certifyDiscoveredCovenantPackage` results | legal | available; false refusals (IPV-21) must be shown as blockers, never hidden |
| clause text hash, cache key, sourceContentVersion | `textSha256` (manifest), `computeCacheKey`, `sourceContentVersion` | system | available; node ids positional (doc 09 §3) |
| reviewer disposition (approved / returned / escalated), who, when, note with citation | product-layer (W1–W3) | all | not built |

Inventory completeness is a property of discovery (Pass B–D NOT_RUN offline); the inventory must therefore always
show the omission audit: units with a Pass A signal not examined (doc 08 `notExamined`) and referenced agreements
absent from the package (`referencedExternalAgreements`).

## 2. Evidence citation — what every number, condition and refusal must point to

A citation is complete when it carries all of:

1. **Document identity**: documentId, label, role (base / amendment / indenture / intercreditor / exhibit / unclassified
   override), content hash.
2. **Location**: sectionRef, occurrence ordinal (when the label is duplicated), node type, char span (`charStart`,
   `charEnd`) in that document version.
3. **Verbatim excerpt** equal to a substring of the located text (the acceptance runner's provenance check; ledger #35).
4. **As-of and lineage**: the as-of date the citation is valid for; for amended provisions the chain (which amendment,
   effective date, operation) and whether the cited text is base, superseded or current.
5. **Role of the figure**: cap, floor, threshold of a gate, ratio comparator and direction — stated, not inferred
   (IPV-22 is the reason this field exists).
6. **Dependencies**: the definitions the cited text relies on, each with its own citation (1–4), and the unresolved
   ones named.
7. **Authority status**: the operative-source authentication result once PR #136 lands (CURRENT_OPERATIVE /
   KNOWN_SUPERSEDED / UNKNOWN), and the document's classification (a recital, exhibit or contents line is never a
   capacity citation — G cases, BM-07).

Interface requirements (from docs 05 W7–W9, 13 §2 and 18 §3–4):

- Every figure in an answer is a link to its citation; a figure without a complete citation is rendered as a refusal,
  not as a number.
- Superseded text is visible on demand next to current text (W4); the chain is ordered by effective date.
- Refusals carry their reason code and the citation of what was missing (undefined term, missing document, unresolved
  amendment, conflicting duplicate, override document).
- The export (W7) is the citation set plus the unit rows, in a machine-readable form that the acceptance report
  already defines (`report.json` per candidate), so a counsel reviewer can diff two exports.
- Nothing in the interface may show a model's paraphrase as a citation; the excerpt is always the source text.
