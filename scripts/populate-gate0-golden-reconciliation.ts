/**
 * Gate-0 golden-row reconciliation, run AFTER the TRANSACTION_SECURITY_SCOPE
 * fix (lib/solver/types.ts, lib/solver/election.ts,
 * scripts/populate-coherent-security-scope-fix.ts) and after re-running
 * `npx tsx scripts/golden-test.ts coherent` against the fixed engine.
 *
 * Scope: exactly 3 Coherent golden_tests rows - Q22 (cmt7vicwr002pj1d33vvdfvav)
 * and the two SSNL-binding-constraint spot checks, rows 16/17
 * (cmt7vicwj002dj1d3bv3zwd1w, cmt7vicwk002fj1d3nnpsqqdp). No other row is
 * touched by this script.
 *
 * ============================================================================
 * WHAT THE FIX CHANGED, OBSERVED DIRECTLY AGAINST THE POST-FIX ENGINE
 * ============================================================================
 * Before the fix, all three rows' solver-native binding citation was
 * `coh-ca-d-incr-ratiobased-unsecjr` (ca_incremental_ratio_based_unsecured_or_junior)
 * - the permission whose action label restricts it to unsecured-or-junior
 * debt but which had no eligibilityConditions enforcing that. After the fix
 * (that permission now carries a TRANSACTION_SECURITY_SCOPE/UNSECURED_OR_JUNIOR
 * condition, which correctly FAILS for these rows' secured, uncharacterized-
 * lien-priority transactions), that permission IS confirmed excluded from
 * these rows' winning elections - re-run and read directly. But the
 * SOLVER-NATIVE CITATION now shown is a DIFFERENT permission,
 * `coh-ca-d-permitted-601p` (ca_permitted_debt_601p, "General Permitted Debt
 * catch-all", §6.01(p)) - and the computed dollar figure for Q22 is
 * UNCHANGED at 4629 (not 3541, and not some third number). This is not a
 * bug in this fix: ca_permitted_debt_601p shares the exact same
 * LEVERAGE_RATIO_ROOM/TNL<=4.25x formula and threshold as the excluded
 * permission (confirmed by direct DB read), has no TRANSACTION_SECURITY_SCOPE
 * or any other restriction on it, and is itself reviewStatus VERIFIED - so
 * it is a genuinely different, legitimately-modeled, unrestricted basket that
 * happens to compute the identical ratio room.
 *
 * ============================================================================
 * A SEPARATE, PRE-EXISTING, NOT-FIXED-BY-THIS-TASK CONCERN THIS SURFACES
 * ============================================================================
 * ca_permitted_debt_601p's own `notes` column states explicitly: "No
 * independent lien link - secured use of this basket requires independent
 * §6.02(kk) clearance (not automatically lien-eligible under §6.02(hh))."
 * Confirmed against `PermissionRelationship`: unlike
 * coh-ca-d-incr-ratiobased-unsecjr (which DOES carry an
 * AUTOMATIC_LINKED_PERMISSION relationship to a LIEN permission,
 * coh-ca-l-hh-linked-601v), coh-ca-d-permitted-601p has NO
 * AUTOMATIC_LINKED_PERMISSION relationship to any LIEN permission at all.
 * Yet the solver still reports it CLEAR for a `secured: true` transaction,
 * because - exactly as this task's own design doc already discloses -
 * `requestedLienPriority` is always `[]` from every live caller today, so
 * nothing mechanically checks "does this election actually include a LIEN
 * leg, or an established collateral-pool scope, backing this secured
 * transaction." This is the SAME already-disclosed "no live signal
 * distinguishing lien priority/pairing per-transaction" limitation named in
 * this task's own instructions (not a newly-discovered, differently-shaped
 * defect of the kind that would warrant stopping before Part 2 - it is not
 * an "action label claims a restriction the data doesn't enforce" case: this
 * permission's own action label makes NO secured/unsecured claim at all).
 * It is documented here, not fixed, because fixing it would mean adding a
 * general "a secured transaction requires at least one LIEN leg or
 * established collateral scope in the winning election" check to
 * lib/solver/election.ts - a lib/solver/** feasibility-algorithm change
 * beyond what this task specifies, and explicitly out of scope
 * ("Do NOT change lib/solver/** election/graph/feasibility algorithms beyond
 * what's specified above merely to make a golden row pass").
 *
 * ============================================================================
 * WHY expectedAnswer/bindingProvision ARE LEFT UNCHANGED ON ALL 3 ROWS
 * ============================================================================
 * The prior investigation (docs/founder-legal-review-2026-08-25.md §3) held
 * back a correction to 4629/ca_incremental_ratio_based_unsecured_or_junior
 * because that citation rested on an under-modeled permission and "neither
 * figure [was] confirmed correct." This task's fix resolves EXACTLY that
 * specific concern - but the post-fix re-run surfaces a DIFFERENT, still-open
 * question about the new citation (ca_permitted_debt_601p's own undisputed
 * lack of verified lien authority for a secured use). Genuine ambiguity about
 * whether 4629 is the truly correct SECURED capacity figure therefore still
 * remains, for a different underlying reason than before. Per this task's own
 * instruction ("Do NOT do so if ambiguity remains"), this script does NOT
 * overwrite expectedAnswer/bindingProvision - it appends this finding to
 * reviewerNotes (never overwriting prior notes), preserving full audit trail,
 * and leaves 3541/mila_secured exactly as stored.
 *
 * `golden_tests.status` is NOT touched by this script (stays VERIFIED per
 * docs/legal-review-status-model.md §0/§10 - legal review and engineering
 * correctness are separate dimensions; this script only adds an engineering
 * finding, not a legal-review determination).
 *
 * Idempotent: guarded by a fixed marker string in reviewerNotes - safe to
 * re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Resolved by `stableKey` (docs/database-replay-safety.md), NOT a hardcoded
// golden_tests.id cuid literal - a fresh database rebuild regenerates every
// GoldenTest.id, so a hardcoded cuid here would silently stop matching any
// row (see the `if (rows.length !== 3)` guard below, which is exactly what
// caught this empirically against a from-scratch database before this fix).
const ROW_STABLE_KEYS = ["coherent:q22", "coherent:q17a", "coherent:q17b"];

const MARKER = "GATE-0 SECURITY-SCOPE FIX RECONCILIATION (2026-08-25)";

const NOTE = `${MARKER}: The TRANSACTION_SECURITY_SCOPE eligibility-condition fix (lib/solver/types.ts, lib/solver/election.ts) was implemented and applied to coh-ca-d-incr-ratiobased-unsecjr (scripts/populate-coherent-security-scope-fix.ts). Re-running the golden harness confirms that permission is now correctly EXCLUDED from this row's winning election for a secured, uncharacterized-lien-priority transaction (its TRANSACTION_SECURITY_SCOPE/UNSECURED_OR_JUNIOR condition FAILS, per design). However, the solver-native citation this row now reports is a DIFFERENT permission, coh-ca-d-permitted-601p (ca_permitted_debt_601p, §6.01(p)) - which shares the identical LEVERAGE_RATIO_ROOM/TNL<=4.25x formula and threshold, so the computed dollar figure is unchanged (4629 for Q22). This permission's own notes and PermissionRelationship data confirm it has NO automatic lien linkage and is not independently lien-eligible without separate §6.02(kk) clearance - yet the solver reports it CLEAR for a secured transaction, because (as this task's own instructions already disclose) no live caller populates requestedLienPriority, so nothing mechanically verifies a winning election actually carries lien authority for a "secured" query. This is the SAME already-disclosed "no live lien-priority signal" limitation named in this task's own design, not a new defect of the kind this task's eligibility fix targets - it is intentionally NOT fixed here (would require a lib/solver/** feasibility-algorithm change beyond this task's authorized scope). Net effect: expectedAnswer (3541/mila_secured) is NOT confirmed correct (unchanged from the prior investigation), and neither is the new solver-native figure (4629/ca_permitted_debt_601p) - a different, still-open reason than before. expectedAnswer/bindingProvision are therefore left UNCHANGED, per this task's own instruction not to update when ambiguity remains. golden_tests.status is left VERIFIED (legal review and this engineering finding are separate dimensions - docs/legal-review-status-model.md §0/§10). Recommended future follow-up (not performed, separately authorizable): add a general "a secured transaction's winning election must include at least one LIEN leg or established collateral-pool scope" check to lib/solver/election.ts, and/or populate requestedLienPriority from a live caller so PRIORITY_CONDITION checks actually run.`;

async function main() {
  const rows = await prisma.goldenTest.findMany({ where: { stableKey: { in: ROW_STABLE_KEYS } } });
  if (rows.length !== 3) {
    throw new Error(`Expected exactly 3 golden_tests rows (Q22, 16, 17 - stableKeys ${ROW_STABLE_KEYS.join(", ")}) - found ${rows.length}. Refusing to proceed.`);
  }

  for (const row of rows) {
    if (row.reviewerNotes?.includes(MARKER)) {
      console.log(`${row.id}: reviewerNotes already contains this reconciliation note - no-op, idempotent re-run confirmed.`);
      continue;
    }
    const updated = row.reviewerNotes ? `${row.reviewerNotes}\n\n${NOTE}` : NOTE;
    await prisma.goldenTest.update({
      where: { id: row.id },
      data: { reviewerNotes: updated },
    });
    console.log(`${row.id}: appended Gate-0 reconciliation note to reviewerNotes.`);
  }

  // Confirm expectedAnswer/bindingProvision/status are untouched.
  const after = await prisma.goldenTest.findMany({ where: { stableKey: { in: ROW_STABLE_KEYS } } });
  for (const row of after) {
    console.log(`${row.id}: expectedAnswer=${row.expectedAnswer} bindingProvision=${row.bindingProvision} status=${row.status}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
