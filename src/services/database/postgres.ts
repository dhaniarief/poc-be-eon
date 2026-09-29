import { Pool } from "pg";

import { env } from "../../config/env.js";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

export const postgresPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

postgresPool.on("error", (error) => {
  console.error("[POSTGRES POOL ERROR]", error);
});
