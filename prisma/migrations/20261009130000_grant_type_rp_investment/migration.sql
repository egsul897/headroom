-- Expand Permission / CoverageDeclaration GrantType for counsel-compiled
-- restricted payment and investment baskets (additive only).
ALTER TYPE "grant_type" ADD VALUE IF NOT EXISTS 'RESTRICTED_PAYMENT';
ALTER TYPE "grant_type" ADD VALUE IF NOT EXISTS 'INVESTMENT';
