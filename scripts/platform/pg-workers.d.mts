type Env = Readonly<Record<string, string | undefined>>;
export declare function workerDatabaseName(templateDb: string, poolId: string | number): string;
export declare function withDatabase(templateUrl: string, dbName: string): string;
export declare function templateDatabaseName(templateUrl: string): string;
export declare function workerDatabaseUrl(env?: Env): string | null;
export declare function createWorkerDatabases(templateUrl: string, workers: number, opts?: { cwd?: string }): Promise<string[]>;
export declare function dropWorkerDatabases(templateUrl: string, names: string[], opts?: { cwd?: string }): Promise<void>;
export declare function pgVitestConfigSource(toolsDir: string): string;
export declare const PG_VITEST_CONFIG_RELATIVE: "node_modules/.pr-gate/vitest.pg.config.mts";
