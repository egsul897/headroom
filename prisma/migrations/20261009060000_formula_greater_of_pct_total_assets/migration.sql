-- Additive FormulaType for greater-of flat / % Consolidated Total Assets growers.
-- Required so counsel-compiled baskets (e.g. CONMED §7.2) evaluate the grower
-- leg instead of silently modeling only the fixed-dollar floor.
ALTER TYPE "formula_type" ADD VALUE IF NOT EXISTS 'GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS';
