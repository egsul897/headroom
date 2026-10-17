export interface PrGateCollectedReport {
  testResults: Array<{
    name: string;
    status: string;
    message: string;
    assertionResults: Array<{
      ancestorTitles: string[];
      fullName: string;
      title: string | undefined;
      status: string;
      failureMessages: string[];
    }>;
  }>;
}

export function collectReport(files: unknown[]): PrGateCollectedReport;

export default class PrGateReporter {
  onInit(ctx: unknown): void;
  onFinished(files?: unknown[]): void;
}
