/** vitest setupFile (gate only): point this worker's DATABASE_URL at its own cloned database. */
import { workerDatabaseUrl } from "./pg-workers.mjs";

const url = workerDatabaseUrl();
if (url) process.env.DATABASE_URL = url;
