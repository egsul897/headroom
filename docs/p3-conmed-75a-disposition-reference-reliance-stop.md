# CONMED §7.5(a) — do not synthesize a `Disposition` term reference

Soft gate. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

No pin. No pin folder. No new condition type. No section-specific branch. No new discoveryId. Knife River was not opened. The historical evidence file was not edited. This note does not re-execute the #124 replay and does not reclassify the open finding. The compiler’s qualitative-gate pass still does not insert a term node; a regression locks that absence.

| Field | Value |
|---|---|
| Main tip | `554698a0e9403436c637f6789a663321fa03701a` (merge of #124) |
| Candidate | `discovery-candidate:baca43714b8502cc9c596c23` |
| Rule | `ir-rule:b752bbaf461e4c3b704300d2` |
| Section | §7.5(a) |
| Sealed evidence | `docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json` |
| Evidence sha256 | `19e2173b3fd261f74f55f36c5e4b9210ff1d1c841dd1e15bdfd4f1f41f7c636c` |
| Operative sha256 | `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0` (89 chars) |
| Lane D expected shape | `docs/p3-lane-d-conmed-7.5a-discrepancy-1acdff3.md` |
| Replay | `docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.md` |
| Pin eligibility | **N** |
| Phase-3 CERTIFICATION | **N** |

Lane D says the capitalized word `Disposition` in the operative clause is a `DEFINED_TERM_REFERENCE`, and that the definition body stays on the definition’s own unit. The #124 replay recorded `definitionCount` 0 and no such node. This note asks whether a deterministic pass may insert that node. It may not.

---

## What the sealed bundle already records

Operative text (89 characters, including the newline after `(a)` and the trailing newline):

```
(a)
the Disposition of obsolete or worn out property in the ordinary course of business;
```

Context items on the sealed bundle:

| type | normalizedRef |
|---|---|
| `OPERATIVE_SOURCE` | `7.5(a)` |
| `PARENT_SCOPE` | `7.5` |
| `DEFINITION` | `Disposition` |
| `DEFINITION_DEPENDENCY` | `Division` |
| `DEFINITION_DEPENDENCY` | `Property` |

Edges that matter:

- Operative item → `Disposition`: `DEPENDS_ON_DEFINITION`, reason `Directly used defined term.`
- `Disposition` → `Division`: `DEPENDS_ON_DEFINITION`, reason `Transitive definition dependency.`
- `Disposition` → `Property`: `DEPENDS_ON_DEFINITION`, reason `Transitive definition dependency.`

Discovery on this candidate records `definedTermDependencyLikely: false` (`tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json`, `discovery-candidate:baca43714b8502cc9c596c23`). The parent §7.5 candidate records `definedTermDependencyLikely: true`. Those flags stay as sealed.

Lowercase `property` in clause (a) is the object-class phrase already carried as an `UNSUPPORTED` gate. It is not the defined term `Property`.

---

## Mention stays retrieval

`computeSemanticSourceContract` (`lib/contract-model/phase3-certification/semantic-source-contract.ts`) treats a compiled `DEFINED_TERM_REFERENCE` as reliance. `referencedDefinedTerms` collects those nodes from `capacityExpression`, `conditions`, `exceptions`, and `transactionScope`. A relied-upon `DEFINITION` item then closes over the bundle’s own `DEPENDS_ON_DEFINITION` edges.

The same function’s comment states the other half: an operative item’s `DEPENDS_ON_DEFINITION` edge is retrieval. The closure does not start from that edge. A term the compiled units never reference stays unattributed, however often the operative text uses it.

The existing certificate test states the closure the other way around. When §7.01’s compiled units reference Consolidated EBITDA, the contract relies on that definition and on Consolidated Net Income and Interest Expense through `DEPENDS_ON_DEFINITION`, and `definitions` on the basket stays empty (`tests/contract-model/certified/certification.test.ts`). That closure is the licensed meaning of a compiled term node. It is also why this candidate cannot grow one after the fact.

Probe against the sealed `contextBundle`, same function, no model call, no rewrite of the evidence file. A rule with `UNLIMITED_CAPACITY` and `gatedBy: null` yields:

```json
{
  "attributionMode": "RELIED_UPON",
  "definedTerms": [],
  "reliedDefinitionRefs": []
}
```

The same rule with `gatedBy` set to one `DEFINED_TERM_REFERENCE` (`termName` `Disposition`, `resolvedDefinitionId` null) yields:

```json
{
  "attributionMode": "RELIED_UPON",
  "definedTerms": ["disposition"],
  "reliedDefinitionRefs": [
    { "type": "DEFINITION_DEPENDENCY", "normalizedRef": "Division" },
    { "type": "DEFINITION", "normalizedRef": "Disposition" },
    { "type": "DEFINITION_DEPENDENCY", "normalizedRef": "Property" }
  ]
}
```

One synthesized node makes the contract rely on `Disposition`, `Division`, and `Property`. Clause (a) does not use `Division`. It uses lowercase `property`. Lane D left importing `Property` as the uncertain step. This probe is that import.

---

## Refused attachment points

Each existing place a `DEFINED_TERM_REFERENCE` can sit is an expression the runtime evaluates (`lib/contract-model/runtime/evaluate-expression.ts`, kind `DEFINED_TERM_REFERENCE`: resolve the term to a value or expand a definition). `Disposition` is the name of the permitted act. It is not an amount and it is not a gate operand.

| Slot | What inserting the node would do |
|---|---|
| `UNLIMITED_CAPACITY.gatedBy` | The source contract relies on `Disposition`, `Division`, and `Property`. Evaluation treats the term as a value inside the gate. |
| `conditions[].expression` | Same reliance. The covenant map walks condition expressions (`lib/contract-model/covenant-map/assemble.ts`). The qualitative gates stay `expression: null` on purpose. |
| `definitions[]` / `WireDefinition` | Copies defining text the 89-character operative window does not contain. Source ownership emits a definition only when the defining text is inside the operative window (`lib/contract-model/compiler/semantic/prompt.ts`). |
| `resolvedDefinitionId` set | `validate.ts` rejects a `resolvedDefinitionId` that is not a definition in this compilation unit. Null is the honest unresolved state. Setting it requires the body. |
| `dependsOn` / `EXCLUDED_FROM` toward `Section 7.5` | The operative window cites no section. The #124 replay classified that stored edge `MODEL_INVENTED_REFERENCE`. `dependsOn` on the replay is empty. |
| New rule field | A new carrier would be a new abstraction. The licensed kind is still an expression, and the collectors that give that kind meaning are the ones above. |

`#120` (`applyUnlimitedCarveOutQualitativeGates`) does not synthesize a term reference. The normalizer is locked to that absence by `tests/contract-model/semantic-compiler/defined-term-mention-not-reliance.test.ts`: a capitalized act name present as a context `DEFINITION`, with its own `DEFINITION_DEPENDENCY`, is left unreferenced, and `computeSemanticSourceContract` relies on neither term. A `DEFINED_TERM_REFERENCE` the wire already submitted is kept, and that kept node is reliance. The fixture uses `Conveyance` / `Asset`, not this candidate’s section or term names.

---

## The open finding

`ca99bcbc49fce9df8ab2548f5a7dbdc7c66a7621122d35070f745d2f86030c5c` remains `MISSING_DEPENDENCY`, `UNCERTAIN`, `OPEN`, irPath `rules[0].dependsOn; definitions`. The sealed reasoning looks for the `Disposition` body and the `Property` body in those two arrays. This note does not copy either body and does not mark the finding closed.

The #120 carry stands as recorded on #124: two `UNSUPPORTED` gates, `AND` on `gatedBy`, sufficiency `PARTIAL`, pin eligibility **N**. That carry is not a certification.

---

## Phase-3 CERTIFICATION

**N.**

`discovery-candidate:baca43714b8502cc9c596c23` is not a Phase-3 certification candidate on this record. No row was added to `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json`. The matrix status stays `OFFLINE_PIN_MATRIX_PARTIAL`. The formal board stays **BLOCKED_BY_EVIDENCE**, **CERTIFIED 0/12**. This note does not raise that figure.

---

## Terminal

`MENTION_IS_NOT_RELIANCE`
