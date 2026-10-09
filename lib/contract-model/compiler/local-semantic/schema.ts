/**
 * Strict local-compiler output schema for experimentation.
 * Aligned with submit_compilation wire fields but stricter about source support
 * and unresolved semantics. Model output is never labelled verified.
 */
import { z } from "zod";

export const LOCAL_SEMANTIC_COMPILER_VERSION = "local-semantic-compiler.v1";
export const LOCAL_SEMANTIC_SCHEMA_VERSION = "local-semantic-output.v1";

const SourceSupportSchema = z.object({
  citation: z.string().min(1),
  excerpt: z.string().min(1),
  documentId: z.string().nullable().default(null),
});

export const LocalCompiledRuleSchema = z.object({
  localRef: z.string().min(1),
  permissionOrProhibition: z.enum(["PERMISSION", "PROHIBITION", "UNRESOLVED"]),
  basketType: z.string().nullable().default(null),
  capacityFormula: z.unknown().nullable().default(null),
  conditions: z.array(z.object({ description: z.string(), support: SourceSupportSchema.nullable() })).default([]),
  exceptions: z.array(z.object({ description: z.string(), support: SourceSupportSchema.nullable() })).default([]),
  entityScope: z.object({ include: z.array(z.string()).default([]), exclude: z.array(z.string()).default([]) }).default({ include: [], exclude: [] }),
  sharedCaps: z.array(z.string()).default([]),
  crossDocumentRestrictions: z.array(z.string()).default([]),
  amendmentLineage: z.array(z.string()).default([]),
  support: SourceSupportSchema,
  sufficiency: z.enum(["COMPLETE", "PARTIAL", "UNSUPPORTED", "MISSING_CONTEXT", "AMBIGUOUS"]),
  missingInputs: z.array(z.string()).default([]),
  unsupportedSemantics: z.array(z.string()).default([]),
});

export const LocalCompiledDefinitionSchema = z.object({
  localRef: z.string().min(1),
  termName: z.string().min(1),
  support: SourceSupportSchema,
  sufficiency: z.enum(["COMPLETE", "PARTIAL", "UNSUPPORTED", "MISSING_CONTEXT", "AMBIGUOUS"]),
  missingInputs: z.array(z.string()).default([]),
  unsupportedSemantics: z.array(z.string()).default([]),
});

export const LocalSemanticOutputSchema = z.object({
  schemaVersion: z.literal(LOCAL_SEMANTIC_SCHEMA_VERSION).default(LOCAL_SEMANTIC_SCHEMA_VERSION),
  verificationStatus: z.literal("UNVERIFIED").default("UNVERIFIED"),
  rules: z.array(LocalCompiledRuleSchema).default([]),
  definitions: z.array(LocalCompiledDefinitionSchema).default([]),
  sharedCaps: z.array(z.object({
    localRef: z.string(),
    description: z.string(),
    memberRefs: z.array(z.string()).default([]),
    support: SourceSupportSchema,
  })).default([]),
  missingInputs: z.array(z.string()).default([]),
  unsupportedSemantics: z.array(z.string()).default([]),
});
export type LocalSemanticOutput = z.infer<typeof LocalSemanticOutputSchema>;
