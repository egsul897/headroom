/**
 * Production ContractExtractionProvider, calling the real Claude API
 * (docs/document-onboarding-pipeline-foundation.md).
 *
 * UNVERIFIED FROM THIS SANDBOX: no ANTHROPIC_API_KEY is available here, so
 * this file cannot be exercised against a live model from this environment.
 * It is written and type-checked against @anthropic-ai/sdk 0.120.0's own
 * actual published types (read directly from node_modules/@anthropic-ai/sdk,
 * never guessed) and compiles cleanly; its live behavior can only be
 * confirmed once deployed with real credentials. tests/extraction/**
 * exercise the pipeline end-to-end against SyntheticExtractionProvider
 * instead - see that file's own header comment.
 *
 * Structured output, not chat: every stage is one `client.messages.parse()`
 * call with `output_config.format: zodOutputFormat(<stage schema>)` (the
 * SDK's own recommended structured-outputs path - see
 * node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts). This
 * file deliberately never sets `thinking` - the response is exactly the
 * parsed JSON object the schema describes, so there is no extended-reasoning
 * content in the response to strip in the first place. The SDK validates
 * the model's JSON against the schema at the API layer (`parsed_output` is
 * null on a parse failure, handled as a hard error below); regardless,
 * lib/extraction/run-stage.ts independently re-validates whatever ANY
 * provider returns before persisting anything, so this file's own
 * correctness is never the sole validation gate.
 *
 * Model: EXTRACTION_MODEL env var, default `claude-opus-5` - Anthropic's
 * current, most capable generally-available model (see the model table this
 * project's claude-api skill ships). Legal-document extraction feeds
 * downstream covenant-capacity review, so this pipeline defaults to the
 * strongest available model rather than a cheaper one; EXTRACTION_MODEL
 * lets a deployment trade accuracy for cost/latency deliberately, but the
 * pipeline itself never picks that tradeoff on its own.
 *
 * Auth: ANTHROPIC_API_KEY, the SDK's own standard env var (confirmed against
 * its published README/client constructor - `new Anthropic()` reads it with
 * no explicit wiring needed).
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type {
  ChunkRef,
  ContractExtractionProvider,
  CoverageGapInput,
  CoverageGapResult,
  DefinitionExtractionInput,
  DefinitionExtractionResult,
  FinancialInputExtractionInput,
  FinancialInputExtractionResult,
  PermissionExtractionInput,
  PermissionExtractionResult,
  RelationshipExtractionInput,
  RelationshipExtractionResult,
  StructureExtractionInput,
  StructureExtractionResult,
} from "./provider";
import { CoverageStageResultSchema, DefinitionsStageResultSchema, FinancialInputsStageResultSchema, PermissionsStageResultSchema, RelationshipsStageResultSchema, StructureStageResultSchema } from "./schemas";

export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5";
/** Bumped whenever BASE_SYSTEM_PROMPT or a stage's own instruction text changes materially - recorded on ExtractionRun.promptVersion so a re-run/retry can be attributed to the prompt version that produced it. */
export const PROMPT_VERSION = "2026-08-25.1";
/** Bumped whenever lib/extraction/schemas.ts's shapes change - recorded on ExtractionRun.schemaVersion. */
export const SCHEMA_VERSION = "2026-08-25.1";

function renderChunks(chunks: ChunkRef[]): string {
  return chunks
    .map((c) => {
      const loc = [c.articleRef, c.sectionRef, c.heading].filter(Boolean).join(" / ");
      return `--- chunk ${c.id}${c.page !== null ? ` (page ${c.page})` : ""}${loc ? ` [${loc}]` : ""} ---\n${c.text}`;
    })
    .join("\n\n");
}

const BASE_SYSTEM_PROMPT = [
  "You are a precise legal-document extraction engine for a covenant-capacity analytics platform.",
  "You extract STRUCTURED FACTS from credit agreements and indentures - you never solve, opine on, or resolve legal ambiguity yourself.",
  "Every proposal you produce is reviewed by a human before it is trusted: a low confidence score and an honest, explicit 'not modeled' flag are always preferable to a confident guess.",
  "Ground every proposal in the chunk(s) you actually read it from and cite their ids in sourceChunkIds - never fabricate a citation.",
  "Keep rationale short and factual: a one or two sentence justification of what you found and why, never a step-by-step reasoning trace.",
  "If a section is ambiguous, contested, or you are not confident, say so via a lower confidence value rather than omitting the proposal or inventing a resolution.",
].join(" ");

export class AnthropicExtractionProvider implements ContractExtractionProvider {
  private readonly client: Anthropic;
  readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic(options?.apiKey ? { apiKey: options.apiKey } : {});
    this.model = options?.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
  }

  private async runStage<Schema extends z.ZodType>(schema: Schema, instruction: string, chunks: ChunkRef[], extraContext?: unknown): Promise<z.infer<Schema>> {
    const parts = [instruction];
    if (extraContext !== undefined) parts.push(`\n\nContext from prior extraction stages (JSON):\n${JSON.stringify(extraContext)}`);
    parts.push(`\n\nDocument chunks:\n${renderChunks(chunks)}`);

    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: BASE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parts.join("") }],
      output_config: { format: zodOutputFormat(schema) },
    });

    if (!message.parsed_output) {
      throw new Error(`AnthropicExtractionProvider: model response did not parse against the expected schema (stop_reason=${message.stop_reason})`);
    }
    return message.parsed_output;
  }

  async extractDocumentStructure(input: StructureExtractionInput): Promise<StructureExtractionResult> {
    return this.runStage(
      StructureStageResultSchema,
      "Identify this document's type (CREDIT_AGREEMENT, INDENTURE, AMENDMENT, INTERCREDITOR_AGREEMENT, COMPLIANCE_CERTIFICATE, or OTHER), whether it states that it supersedes/amends another document (name it in supersedesDocumentRef if so), and its Article/Section outline. Propose exactly one DOCUMENT_RELATIONSHIP candidate.",
      input.chunks
    );
  }

  async extractDefinitions(input: DefinitionExtractionInput): Promise<DefinitionExtractionResult> {
    return this.runStage(DefinitionsStageResultSchema, 'Extract every defined term (a \'"Term" means ...\' sentence) found in these chunks as a DEFINED_TERM candidate, with its exact section reference and full definition text.', input.chunks, input.structure);
  }

  async extractPermissions(input: PermissionExtractionInput): Promise<PermissionExtractionResult> {
    return this.runStage(
      PermissionsStageResultSchema,
      "Extract every debt-incurrence or lien-permission basket in these chunks as a PERMISSION candidate, and its collateral scope (priority tier / collateral pool) as a separate COLLATERAL_SCOPE candidate wherever one is stated. Reference the defined terms below by name in definedTermRefs where a basket's formula relies on them.",
      input.chunks,
      input.definitions
    );
  }

  async extractRelationships(input: RelationshipExtractionInput): Promise<RelationshipExtractionResult> {
    return this.runStage(
      RelationshipsStageResultSchema,
      "Given this document's own permissions and the company's other already-extracted permissions below, identify RELATIONSHIP (stacking / alternative / mutually-exclusive / linked / pull-up / etc.), SHARED_CONSTRAINT (a cap shared across several baskets), and ACTIVATION_CONDITION (step-up, springing, usage-limited) candidates connecting them. Only propose a relationship you can point to specific supporting text for.",
      input.chunks,
      { thisDocument: input.permissions, company: input.companyPermissions }
    );
  }

  async extractCoverageGaps(input: CoverageGapInput): Promise<CoverageGapResult> {
    return this.runStage(
      CoverageStageResultSchema,
      "Compare these chunks against the company's already-extracted candidates below (summarized). For any section in these chunks that states a real debt-incurrence or lien permission but has NO corresponding candidate among the company's existing candidates, propose a PERMISSION candidate with modelingStatus KNOWN_NOT_MODELED flagging the gap for a human reviewer - do not attempt to fully model it yourself.",
      input.chunks,
      input.companyCandidateSummaries
    );
  }

  async extractFinancialInputs(input: FinancialInputExtractionInput): Promise<FinancialInputExtractionResult> {
    return this.runStage(
      FinancialInputsStageResultSchema,
      "Identify every financial fact this document's formulas require as an external input (e.g. a defined EBITDA/leverage measure, an assumed interest rate, a borrowing-base certificate line item) as an EXTERNAL_INPUT_REQUIREMENT candidate.",
      input.chunks,
      input.definitions
    );
  }
}
