/**
 * Canonical knowledge-factory import contract for basket/formula research records.
 *
 * This is an import surface for eventual Covenant Knowledge Factory integration.
 * It does NOT create a competing production schema and does NOT write into
 * lib/contract-model/runtime/capacity.
 *
 * Hypotheses stay separate from reviewer-verified representations.
 */
import { z } from "zod";

export const IMPORT_CONTRACT_VERSION = "knowledge-factory-import.basket-formula.v1";

export const KnowledgeFactoryImportRecordSchema = z.object({
  contractVersion: z.literal(IMPORT_CONTRACT_VERSION),
  /** Stable identity — idempotent across re-imports. */
  stableId: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["BASKET_FORMULA_HYPOTHESIS", "BASKET_FORMULA_VERIFIED", "ADVERSARIAL_EXAMPLE", "TYPED_FORMULA"]),
  /** Hypothesis vs reviewer-verified separation. */
  verificationLane: z.enum(["SOURCE_SUPPORTED_HYPOTHESIS", "REVIEWER_VERIFIED"]),
  instrumentId: z.string().min(1),
  issuerKey: z.string().min(1),
  basketFamily: z.string().min(1),
  capacitySemantics: z.enum(["AFFIRMATIVE_CAPACITY", "NOT_CAPACITY", "INCOMPLETE_SEMANTICS"]),
  provenance: z.object({
    documentPath: z.string(),
    sourceHashSha256: z.string(),
    extractedSpanHashSha256: z.string(),
    matchKind: z.enum(["BYTE_EXACT", "WHITESPACE_NORMALIZED", "NOT_FOUND"]),
    byteExact: z.boolean(),
    byteOffsetStart: z.number().nullable(),
    byteOffsetEnd: z.number().nullable(),
    normalizationVersion: z.string(),
  }),
  typedFormulaStatus: z.enum(["REPRESENTED", "UNSUPPORTED", "REVIEW_REQUIRED"]).nullable(),
  unresolvedDependencies: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  importedAt: z.string().optional(),
});

export type KnowledgeFactoryImportRecord = z.infer<typeof KnowledgeFactoryImportRecordSchema>;

export function assertImportRecord(value: unknown): KnowledgeFactoryImportRecord {
  return KnowledgeFactoryImportRecordSchema.parse(value);
}
