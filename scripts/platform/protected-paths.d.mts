export declare const OWNER_LABEL: "owner-approved-protected-paths";
export declare const PROTECTED_PATTERN: RegExp;
export declare function isProtectedPath(file: string): boolean;
export declare function checkProtectedPaths(
  changedPaths: readonly string[],
  labels: readonly string[],
): { ok: boolean; approved: boolean; protectedChanged: string[] };
export declare function parseLabels(raw: string | undefined): string[];
export declare function changedPathsBetween(base: string, head?: string, cwd?: string): string[];
