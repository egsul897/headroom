# Gibraltar Pass A: 946 versus 901

Sealed file `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/development-pipeline/execution.json` is unchanged. Its offline block records 946 Pass A candidates and 2087 structural nodes. That file was written at `f5d57ab`.

The same package, parsed by the current tree with no provider call, produces 901 candidates and 1978 nodes. `lib/contract-model/compiler/discovery/pass-a-signals.ts` is identical between `f5d57ab` and this tree. The only structural commit after the seal is `8590be6` (a restarted letter run does not nest when an open list of the same alphabet has already reached that letter).

Regenerate both sides with `npx tsx scripts/p3-development-pipeline/dump-pass-a-compare.ts <out.json>` from this tree and from a checkout of `f5d57ab`. No provider key is read.

## The 45

Text identity is the whitespace-normalized own text of the node. 102 candidate texts occur fewer times. 57 occur more times. The net is 45 fewer candidates. Node count falls by 109. The other 64 nodes never fired a Pass A signal.

| section | candidate texts lost | candidate texts gained | net | what changed |
| --- | ---: | ---: | ---: | --- |
| 1.01 | 92 | 37 | −55 | Restarted letter runs inside definitions were nested as extra nodes (`1.01(9)(c)`, `1.01(3)(31)`, `1.01(9)(b)`). Those nodes carried definition prose (`except`, `may`, dollar limbs) and were counted as candidates. They are not separate covenants. The prose remains in the definition. |
| 2.05 | 2 | 10 | +8 | Clauses the false nesting had swallowed are addressed again, including `2.05(b)(ii)` through `2.05(b)(ix)`. |
| 2.18 | 1 | 2 | +1 | `2.18(a)` stays, and `2.18(a)(z)` is its own clause. |
| 4.01 | 2 | 3 | +1 | `4.01(a)(vii)` is its own clause. The collateral-document sentence is readdressed, not deleted. |
| 2.14 | 3 | 3 | 0 | Same sentences, corrected paths (`2.14(a)(y)`, `2.14(a)(z)`). |
| 7.05 | 2 | 2 | 0 | `7.05(a)(4)` stays. The shared-cap limb is readdressed as `7.05(a)(y)`. `resolveUniqueNodeByRef("7.05(a)(y)")` is UNIQUE because that clause is a node. The sealed tree swallowed it, so the same citation was NOT_FOUND. The sentence that defines the Available Amount Builder Basket moved from the false path `7.05(a)(4)(ii)(vi)(B)` to `7.05(a)(y)(vi)(B)`. |

−55 + 8 + 1 + 1 = −45.

Article VII baskets are not in the net loss. `7.01(b)(15)`, `7.01(b)(15)(i)` (`$172,000,000`), and `7.01(b)(15)(ii)` are candidates on both parses. Headline sections stay 33. Dollar-value signals stay 51. The signal drops (exception 454 to 436, permission 275 to 258, covenant verb 217 to 205) are the definition-tree rows, not a change to the signal patterns.

`2.05(b)(ii)` through `2.05(b)(ix)`, `2.18(a)(z)`, and `4.01(a)(vii)` are the operative clauses the guard gives back. They are the same legal sentences the sealed parse had buried under a wrong parent.

The expected live count in `tests/stratified-cert/gibraltar-development-pipeline.test.ts` is 901 candidates and 1978 nodes for that reason. `execution.json` and `structure/structure-summary.json` still say 946 and 2087. Those files are the sealed run, not a second parse.
