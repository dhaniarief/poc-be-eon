-- Legacy custom active-Opportunity state is no longer used.
-- Mastra memory remains the conversation store; entity IDs are explicit tool
-- inputs or request-scoped generic entity context.

DROP TABLE IF EXISTS eon_ai.teams_conversation_context;
