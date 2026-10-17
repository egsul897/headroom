export declare const OWNER_LABEL: "owner-approved-protected-paths";
export declare const PROTECTED_TOKEN: RegExp;
export declare const PROTECTED_PATTERN: RegExp;
export declare const PROTECTED_PATHS: readonly string[];
export declare const SOURCE_EXTENSIONS: readonly string[];
export declare const SOURCE_WARN_ALLOWLIST: readonly string[];
export type Symlink = { link: string; target: string };
export declare function resolveLinkTarget(link: string, target: string): string | null;
export declare function symlinkIsProtected(s: Symlink, protectedTracked?: readonly string[]): boolean;
export declare function parseRawZ(out: string): { srcMode: string; dstMode: string; dstSha: string; status: string; paths: string[] }[];
export declare function protectedTrackedAt(head?: string, cwd?: string): string[];
export declare function symlinksBetween(base: string, head?: string, cwd?: string): Symlink[];
export declare function classifyPath(file: string, opts?: { warnAllowlist?: readonly string[] }): { status: "protected" | "warn" | "ok"; reason: string };
export declare function isProtectedPath(file: string): boolean;
export declare function checkProtectedPaths(
  changedPaths: readonly string[],
  labels: readonly string[],
  symlinks?: readonly Symlink[],
  protectedTracked?: readonly string[],
): { ok: boolean; approved: boolean; protectedChanged: string[]; warnings: string[] };
export declare function parseLabels(raw: string | undefined): string[];
export declare function changedPathsBetween(base: string, head?: string, cwd?: string): string[];
