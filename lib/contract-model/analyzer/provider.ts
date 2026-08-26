import type { ContractAnalysisResult, ContractAnalyzerInput } from "./schema";

/** One-method provider interface for the Phase C0 analyzer vertical slice. */
export interface ContractAnalyzerProvider {
  analyze(input: ContractAnalyzerInput): Promise<ContractAnalysisResult>;
}
