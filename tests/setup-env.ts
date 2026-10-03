process.env.NODE_ENV = "test";

process.env.JWT_SECRET ??= "test-only-secret-at-least-16-chars";

process.env.CRM_TENANT_ID ??= "test-tenant";

process.env.CRM_CLIENT_ID ??= "test-client";

process.env.CRM_CLIENT_SECRET ??= "test-secret";

process.env.CRM_BASE_URL ??= "https://crm.example.test";

process.env.FINOPS_BASE_URL ??= "https://finops.example.test";

// HAPUS INI:
// process.env.DATABASE_URL = "";

process.env.ENABLE_DEV_UI ??= "false";

process.env.ENABLE_DEV_TOKEN_ENDPOINT ??= "false";

process.env.TEAMS_APP_ID ??= "test-teams-app";

process.env.TEAMS_APP_PASSWORD ??= "test-teams-secret";

process.env.TEAMS_APP_TENANT_ID ??= "test-teams-tenant";

process.env.OPENAI_API_KEY ??= "test-openai-key";
