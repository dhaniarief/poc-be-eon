import dotenv from "dotenv";
import { z } from "zod";

const nodeEnv = process.env.NODE_ENV ?? "development";

const envFile =
  nodeEnv === "production" ? ".env.production" : ".env.development";

dotenv.config({
  path: envFile,
});

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),

  PORT: z.coerce.number().int().positive().default(3001),

  HOST: z.string().default("0.0.0.0"),

  ENABLE_DEV_UI: booleanFromString.default(false),

  ENABLE_DEV_TOKEN_ENDPOINT: booleanFromString.default(false),

  ENABLE_RUN_DEBUG: booleanFromString.default(false),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  JWT_SECRET: z.string().min(16),

  JWT_ISSUER: z.string().default("eon-ai-backend"),

  JWT_AUDIENCE: z.string().default("eon-ai-client"),

  JWT_EXPIRES_IN: z.string().default("8h"),

  OPENAI_API_KEY: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  MASTRA_DB_SCHEMA: z.string().default("mastra"),

  MASTRA_EDITOR_DB_SCHEMA: z.string().default("mastra_editor"),

  MASTRA_SERVICE_NAME: z.string().default("eon-ai"),

  MASTRA_MEMORY_LAST_MESSAGES: z.coerce
    .number()
    .int()
    .min(1)
    .max(40)
    .default(8),

  LOCAL_AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(30).default(12),

  CLOUD_AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(30).default(12),

  AGENT_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(16000)
    .default(6000),

  SEARXNG_SNIPPET_MAX_CHARS: z.coerce
    .number()
    .int()
    .min(100)
    .max(2000)
    .default(700),

  MASTRA_OBSERVATIONAL_MEMORY: booleanFromString.default(false),

  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),

  OLLAMA_MODEL: z.string().default("gpt-oss:20b"),

  SEARXNG_BASE_URL: z.string().url().default("http://localhost:8080"),

  SEARXNG_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  SEARXNG_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(5),

  CRM_TENANT_ID: z.string().min(1),

  CRM_CLIENT_ID: z.string().min(1),

  CRM_CLIENT_SECRET: z.string().min(1),

  CRM_BASE_URL: z.string().url(),

  FINOPS_BASE_URL: z.string().url(),

  SHAREPOINT_HOSTNAME: z.string().default("eonchemicals1.sharepoint.com"),

  SHAREPOINT_SITE_PATH: z.string().default(""),

  SHAREPOINT_MSDS_LIBRARY_NAME: z.string().default("MSDS File"),

  // ==================================================
  // SHAREPOINT SOP / IK RAG
  // ==================================================

  SHAREPOINT_SOP_HOSTNAME: z
    .string()
    .default("eonchemicals1.sharepoint.com"),

  SHAREPOINT_SOP_SITE_PATH: z.string().default("/sites/MIS-SOPIK"),

  SHAREPOINT_SOP_LIST_ID: z
    .string()
    .default("2b9a5ffe-11d9-4f4c-af28-3ee548943605"),

  RAG_SOURCE_KEY: z
    .string()
    .default("sharepoint:mis-sopik:sitepages"),

  RAG_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  RAG_EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(128).default(32),

  RAG_SEARCH_TOP_K: z.coerce.number().int().min(1).max(20).default(5),

  RAG_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0.35),

  RAG_CHUNK_SIZE_CHARS: z.coerce
    .number()
    .int()
    .min(500)
    .max(8000)
    .default(1800),

  RAG_CHUNK_OVERLAP_CHARS: z.coerce
    .number()
    .int()
    .min(0)
    .max(2000)
    .default(250),

  RAG_SYNC_ENABLED: booleanFromString.default(false),

  RAG_SYNC_ON_START: booleanFromString.default(false),

  RAG_SYNC_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .default(300_000),

  TEAMS_APP_ID: z.string().min(1),
  TEAMS_APP_PASSWORD: z.string().min(1),
  TEAMS_APP_TENANT_ID: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    z.treeifyError(parsed.error),
  );

  process.exit(1);
}

export const env = parsed.data;
