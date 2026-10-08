import { z } from "zod";
import {
  ADVERSARIAL_ROLES,
  BASKET_FAMILIES,
  CAPACITY_SEMANTICS,
  FORMULA_KINDS,
  VERIFICATION_STATUSES,
} from "./types";

export const SourceVersionSchema = z.object({
  instrumentId: z.string().min(1),
  documentPath: z.string().min(1),
  sourceLabel: z.string().min(1),
  versionNote: z.string().min(1),
});

export const AmountOrFormulaCandidateSchema = z.object({
  formulaKind: z.enum(FORMULA_KINDS),
  expressionText: z.string().min(1),
  structured: z
    .object({
      fixedDollar: z.string().optional(),
      percentage: z.string().optional(),
      metric: z.string().optional(),
      ratioTest: z.string().optional(),
      components: z.array(z.string()).optional(),
    })
    .optional(),
});

export const BasketCandidateSchema = z
  .object({
    id: z.string().min(1),
    exactSourceSpan: z.string().min(20),
    governingCovenant: z.string().min(1),
    basketFamily: z.enum(BASKET_FAMILIES),
    secondaryFamilies: z.array(z.enum(BASKET_FAMILIES)).optional(),
    amountOrFormulaCandidate: AmountOrFormulaCandidateSchema,
    measurementDate: z.string().nullable(),
    financialInputs: z.array(z.string()),
    entityScope: z.string().min(1),
    conditions: z.array(z.string()),
    sharedCapacityDependencies: z.array(z.string()),
    reclassificationRights: z.string().nullable(),
    sourceVersion: SourceVersionSchema,
    verificationStatus: z.enum(VERIFICATION_STATUSES),
    capacitySemantics: z.enum(CAPACITY_SEMANTICS),
    capacityComputable: z.boolean(),
    capacityComputationBlockers: z.array(z.string()),
    notes: z.string(),
  })
  .superRefine((rec, ctx) => {
    if (rec.capacityComputable) {
      if (rec.capacitySemantics !== "AFFIRMATIVE_CAPACITY") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "capacityComputable requires AFFIRMATIVE_CAPACITY semantics",
          path: ["capacityComputable"],
        });
      }
      if (rec.capacityComputationBlockers.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "capacityComputable records must have empty blockers",
          path: ["capacityComputationBlockers"],
        });
      }
    }
    if (rec.capacitySemantics === "AFFIRMATIVE_CAPACITY" && !rec.capacityComputable) {
      if (rec.capacityComputationBlockers.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-computable affirmative capacity must state blockers",
          path: ["capacityComputationBlockers"],
        });
      }
    }
    if (rec.capacitySemantics === "NOT_CAPACITY" && rec.capacityComputable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NOT_CAPACITY cannot be capacityComputable",
        path: ["capacityComputable"],
      });
    }
  });

export const AdversarialExampleSchema = z.object({
  id: z.string().min(1),
  role: z.enum(ADVERSARIAL_ROLES),
  exactSourceSpan: z.string().min(20),
  governingProvision: z.string().min(1),
  whyNotAffirmativeCapacity: z.string().min(1),
  lookalikeTrap: z.string().min(1),
  pairedCapacityControlId: z.string().nullable(),
  sourceVersion: SourceVersionSchema,
  verificationStatus: z.enum(VERIFICATION_STATUSES),
});

export const FormulaTaxonomyEntrySchema = z.object({
  formulaKind: z.enum(FORMULA_KINDS),
  label: z.string().min(1),
  description: z.string().min(1),
  typicalBasketFamilies: z.array(z.enum(BASKET_FAMILIES)),
  requiredInputs: z.array(z.string()),
  commonFailureModes: z.array(z.string()),
});
