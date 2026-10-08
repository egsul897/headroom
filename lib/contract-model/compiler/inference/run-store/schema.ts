/**
 * WS-VIC compile-run artifact schemas (not WS-CKF corpus persistence).
 * Extends existing IR / verified-unit concepts; does not create a second
 * competing covenant engine. Model output is NEVER labelled verified.
 */
import { z } from "zod";

export const VIC_RUN_STORE_SCHEMA_VERSION = "vic-run-store.v1";
/** @deprecated alias — prefer VIC_RUN_STORE_SCHEMA_VERSION */
export const COVENANT_KNOWLEDGE_SCHEMA_VERSION = VIC_RUN_STORE_SCHEMA_VERSION;

export const VerificationStatusSchema = z.enum([
  "UNVERIFIED",
  "PENDING_REVIEW",
  "REVIEWER_ACCEPTED",
  "REVIEWER_REJECTED",
  "INDEPENDENTLY_VERIFIED",
  "INVALIDATED",
]);

export const KnowledgeRecordKindSchema = z.enum([
  "SOURCE_DOCUMENT",
  "OPERATIVE_VERSION",
  "STRUCTURAL_PROVISION",
  "COVENANT_CANDIDATE",
  "SEMANTIC_HYPOTHESIS",
  "VALIDATED_REPRESENTATION",
  "DEPENDENCY",
  "AMENDMENT_EFFECT",
  "PROVENANCE",
  "UNCERTAINTY",
  "REVIEWER_DECISION",
  "VERIFICATION_STATUS",
  "DETERMINISTIC_FACT",
  "COMPILATION_RUN",
]);

export const KnowledgeRecordSchema = z.object({
  schemaVersion: z.literal(VIC_RUN_STORE_SCHEMA_VERSION),
  recordId: z.string().min(1),
  kind: KnowledgeRecordKindSchema,
  contentHash: z.string().min(1),
  /** Near-duplicate cluster id when applicable. */
  duplicateGroupId: z.string().nullable().default(null),
  companyId: z.string().nullable().default(null),
  packageKey: z.string().nullable().default(null),
  instrumentKey: z.string().nullable().default(null),
  documentId: z.string().nullable().default(null),
  candidateRef: z.string().nullable().default(null),
  verificationStatus: VerificationStatusSchema.default("UNVERIFIED"),
  /** True only after independent verification — never set from model output alone. */
  modelGenerated: z.boolean().default(false),
  body: z.record(z.string(), z.unknown()),
  provenance: z.object({
    sourceSpans: z.array(z.object({
      documentId: z.string().nullable(),
      citation: z.string().nullable(),
      excerpt: z.string(),
      startOffset: z.number().nullable().optional(),
      endOffset: z.number().nullable().optional(),
    })).default([]),
    compilerVersion: z.string().nullable().default(null),
    inferenceMode: z.string().nullable().default(null),
    contextHash: z.string().nullable().default(null),
    createdAt: z.string(),
  }),
  uncertainty: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  invalidatedBy: z.string().nullable().default(null),
  reviewerDecision: z.object({
    decision: z.enum(["ACCEPT", "REJECT", "ESCALATE"]).nullable(),
    reviewerId: z.string().nullable(),
    notes: z.string().nullable(),
    decidedAt: z.string().nullable(),
  }).nullable().default(null),
});
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;

export function assertNotAutoVerified(record: KnowledgeRecord): void {
  if (record.modelGenerated && record.verificationStatus === "INDEPENDENTLY_VERIFIED") {
    throw new Error("Refusing to label model-generated output as INDEPENDENTLY_VERIFIED without a separate verification record.");
  }
}
