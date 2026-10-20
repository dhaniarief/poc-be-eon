-- =========================================================
-- DATABASE BOOTSTRAP
-- =========================================================
-- Mastra owns its own tables inside mastra / mastra_editor.
-- Product Knowledge RAG is created/reset by:
--   db/001_rag_product_knowledge.sql
-- =========================================================

CREATE SCHEMA IF NOT EXISTS eon_ai;
CREATE SCHEMA IF NOT EXISTS mastra;
CREATE SCHEMA IF NOT EXISTS mastra_editor;

-- Do not recreate the old SOP/IK RAG schema here.
-- Run `npm run rag:migrate` after DATABASE_URL is configured.
