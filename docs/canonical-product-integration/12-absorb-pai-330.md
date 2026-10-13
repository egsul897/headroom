# Absorb PR #330 into canonical product

## Sources
| PR | Tip | Role |
|---|---|---|
| #328 | `b88b9616451a991f7536c69992faec7258166102` | Canonical #312+#311+#319+#317 tip |
| #330 | `76d63127c0761d409fbb7a581637b0c6fe364d2c` | PAI-01–12 safety closures + adversarial suite |
| #316/#317 | ancestors of #328 | Restatement as-of supersession precedence (OCP) |
| #318/#319 | ancestors of #328 | Operative-source GROSS binding |

## Integration tip
Branch: `cursor/absorb-pai-330-canonical-44cd`  
Merge commit preserves both #328 separatedClaims AUTHORITATIVE gate and PAI-08 GROSS_CONTRACTUAL labeling.

## Reconciliation
- **position-view.ts**: only content conflict. Combined: `separatedClaims.remainingAuthoritative` alone may publish AVAILABLE remaining; modeled dashboard dollars → `GROSS_CONTRACTUAL` (never `REMAINING`).
- **fixed-dollar / greater-of evaluate**: extract source-backed GROSS when PAI-04 floors status for unknown utilization — does not restore AVAILABLE remaining or activate production authority.
- **#317/#319 OCP gates**: untouched; remain on tip.

## Product consumption
| Surface | Consumes |
|---|---|
| Position (`buildPositionView` + separatedClaims) | PAI-05/08 labeling + #328 authority gate |
| Home (`loadCompanyOverview`) | PAI-05 headroom withhold |
| Capacity runtime | PAI-04 UNKNOWN default |
| VTE / simulate | `evaluateVerifiedCapacity` → PAI-04 default UNKNOWN |
| OCP / VE compile | GROSS from provisional/grossCapacity under utilization floor |
| Amendment tip / OA | PAI-01/02/03/06/12 |

## Do not
- Activate production authority without evidence
- Weaken adversarial expected results
- Self-merge
