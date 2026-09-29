import { MastraCompositeStore } from "@mastra/core/storage";
import { DuckDBStore } from "@mastra/duckdb";
import { PostgresStore } from "@mastra/pg";
import { env } from "../config/env.js";

/**
 * PostgreSQL is the durable operational store for Mastra state.
 * It is optional in development so the existing API can still run before a
 * database is configured. Memory and Agent Editor are enabled only when this
 * store exists.
 */
export const mastraPostgresStore = env.DATABASE_URL
  ? new PostgresStore({
      id: "eon-ai-postgres",
      connectionString: env.DATABASE_URL,
      schemaName: env.MASTRA_DB_SCHEMA,
    })
  : undefined;

/**
 * Agent Editor versions/configuration are kept in a separate PostgreSQL
 * schema. This keeps editable agent configuration isolated from runtime
 * memory/workflow state while using the same PostgreSQL server.
 */
export const mastraEditorStore = env.DATABASE_URL
  ? new PostgresStore({
      id: "eon-ai-editor-postgres",
      connectionString: env.DATABASE_URL,
      schemaName: env.MASTRA_EDITOR_DB_SCHEMA,
    })
  : undefined;

/**
 * Observability is deliberately routed to DuckDB. Mastra's Studio metrics
 * perform analytical/time-series queries and DuckDB is the supported local
 * columnar store for traces, logs, metrics, cost and latency analysis.
 */
const duckdbStore = new DuckDBStore();
const observabilityStore = await duckdbStore.getStore("observability");

/**
 * One storage facade for the Mastra runtime:
 * - default: PostgreSQL (when configured)
 * - editor: PostgreSQL editor schema (when configured)
 * - observability: DuckDB
 */
export const mastraStorage = new MastraCompositeStore({
  id: "eon-ai-composite-storage",
  ...(mastraPostgresStore ? { default: mastraPostgresStore } : {}),
  ...(mastraEditorStore ? { editor: mastraEditorStore } : {}),
  domains: {
    observability: observabilityStore,
  },
});
