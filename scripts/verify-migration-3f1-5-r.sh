#!/usr/bin/env bash
# Phase 3F.1.6 Final Foundation Certification - Section 25: Migration
# Certification. Read-only verification script for migration
# 20260829232147_phase_3f1_5_r_claim_review_safe_failure (the current head
# migration as of this audit). Never mutates the database beyond what
# `prisma migrate status`/`db pull` themselves do (both read-only against
# the actual schema; db pull writes only to the given --schema scratch path).
set -euo pipefail
cd "$(dirname "$0")/.."

MIGRATION_DIR="prisma/migrations/20260829232147_phase_3f1_5_r_claim_review_safe_failure"
SQL_FILE="$MIGRATION_DIR/migration.sql"

echo "=== 1. Migration status (real Postgres, read-only) ==="
npx prisma migrate status

echo ""
echo "=== 2. Migration SQL file: destructive statement scan (expect NONE) ==="
if grep -inE '^\s*DROP |DROP COLUMN|DROP TABLE|DROP CONSTRAINT|ALTER .*DROP' "$SQL_FILE"; then
  echo "FOUND DESTRUCTIVE STATEMENTS - INVESTIGATE"
  exit 1
else
  echo "OK: no DROP / destructive ALTER statements found - migration is purely additive."
fi

echo ""
echo "=== 3. CREATE INDEX / CREATE UNIQUE INDEX statements in migration.sql ==="
grep -n "CREATE.*INDEX" "$SQL_FILE"

echo ""
echo "=== 4. @@index / @@unique declarations for the 3 new models in schema.prisma ==="
awk '/^model ClaimReviewItem /,/^}/' prisma/schema.prisma | grep -E "@@unique|@@index"
awk '/^model ClaimReviewObservation /,/^}/' prisma/schema.prisma | grep -E "@@unique|@@index"
awk '/^model ClaimReviewDecision /,/^}/' prisma/schema.prisma | grep -E "@@unique|@@index"

echo ""
echo "=== 5. Live DB indexes on the 3 new tables (psql \\d) ==="
for t in claim_review_items claim_review_observations claim_review_decisions; do
  echo "--- $t ---"
  PGPASSWORD="${PGPASSWORD:-headroom}" psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-headroom}" -c "\d $t" | sed -n '/Indexes:/,/Foreign-key/p'
done

echo ""
echo "=== 6. Foreign keys on the 3 new tables (live DB) ==="
for t in claim_review_items claim_review_observations claim_review_decisions; do
  echo "--- $t ---"
  PGPASSWORD="${PGPASSWORD:-headroom}" psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-headroom}" -c "\d $t" | sed -n '/Foreign-key/,$p'
done

echo ""
echo "=== DONE - see output above for Section 25 certification evidence ==="
