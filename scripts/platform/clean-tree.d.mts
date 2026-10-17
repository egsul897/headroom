export interface DirtyEntry {
  status: string;
  path: string;
}
export declare function parsePorcelain(porcelain: string): DirtyEntry[];
export declare function dirtyEntries(cwd?: string): DirtyEntry[];
