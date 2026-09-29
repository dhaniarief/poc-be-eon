-- =========================================================
-- DATABASE : be_eon_ai
-- PURPOSE  : EON AI Backend
-- =========================================================


-- =========================================================
-- 1. SCHEMAS
-- =========================================================

CREATE SCHEMA IF NOT EXISTS eon_ai;
CREATE SCHEMA IF NOT EXISTS rag;
CREATE SCHEMA IF NOT EXISTS mastra;
CREATE SCHEMA IF NOT EXISTS mastra_editor;


-- =========================================================
-- 2. TEAMS CONVERSATION CONTEXT
-- =========================================================

CREATE TABLE IF NOT EXISTS eon_ai.teams_conversation_context (
    id BIGSERIAL PRIMARY KEY,

    tenant_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    thread_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,

    opportunity_id TEXT NOT NULL,
    opportunity_no TEXT NOT NULL,

    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_teams_conversation_context
        UNIQUE (
            tenant_id,
            platform,
            channel_id,
            thread_id,
            user_id
        )
);


CREATE INDEX IF NOT EXISTS ix_teams_context_opportunity
ON eon_ai.teams_conversation_context(opportunity_id);


CREATE INDEX IF NOT EXISTS ix_teams_context_last_used
ON eon_ai.teams_conversation_context(last_used_at DESC);



-- =========================================================
-- 3. RAG DOCUMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS rag.documents (
    id BIGSERIAL PRIMARY KEY,

    source_key TEXT NOT NULL,
    source_item_id TEXT NOT NULL,

    source_type TEXT NOT NULL
        DEFAULT 'sharepoint_site_page',

    title TEXT NOT NULL,
    file_name TEXT,

    doc_number TEXT,
    doc_type TEXT,
    process TEXT,
    status TEXT,

    doc_version NUMERIC,

    effective_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,

    reminder_to_update TEXT,
    manager_approval_status TEXT,
    qa_approval_status TEXT,

    source_url TEXT,
    source_etag TEXT,
    source_modified_at TIMESTAMPTZ,

    content_hash TEXT,
    indexed_content_hash TEXT,

    content_text TEXT,

    is_searchable BOOLEAN NOT NULL
        DEFAULT FALSE,

    metadata JSONB NOT NULL
        DEFAULT '{}'::JSONB,

    embedding_model TEXT,

    indexed_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT uq_rag_documents_source
        UNIQUE (
            source_key,
            source_item_id
        )
);


CREATE INDEX IF NOT EXISTS ix_rag_documents_source_key
ON rag.documents(source_key);


CREATE INDEX IF NOT EXISTS ix_rag_documents_status
ON rag.documents(status);


CREATE INDEX IF NOT EXISTS ix_rag_documents_doc_type
ON rag.documents(doc_type);


CREATE INDEX IF NOT EXISTS ix_rag_documents_process
ON rag.documents(process);


CREATE INDEX IF NOT EXISTS ix_rag_documents_source_modified
ON rag.documents(source_modified_at DESC);



-- =========================================================
-- 4. RAG CHUNKS
-- =========================================================
-- Catatan:
-- Project kamu tidak memakai pgvector.
-- Embedding disimpan sebagai DOUBLE PRECISION[].
-- =========================================================

CREATE TABLE IF NOT EXISTS rag.chunks (
    id BIGSERIAL PRIMARY KEY,

    document_id BIGINT NOT NULL
        REFERENCES rag.documents(id)
        ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,

    content TEXT NOT NULL,

    embedding DOUBLE PRECISION[] NOT NULL,

    token_hint INTEGER,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT uq_rag_chunks_document_chunk
        UNIQUE (
            document_id,
            chunk_index
        ),

    CONSTRAINT ck_rag_chunks_embedding_not_empty
        CHECK (
            CARDINALITY(embedding) > 0
        )
);


CREATE INDEX IF NOT EXISTS ix_rag_chunks_document_id
ON rag.chunks(document_id);



-- =========================================================
-- 5. RAG SYNC STATE
-- =========================================================

CREATE TABLE IF NOT EXISTS rag.sync_state (
    source_key TEXT PRIMARY KEY,

    site_id TEXT,
    list_id TEXT,

    delta_link TEXT,

    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);



-- =========================================================
-- 6. FUNCTION : AUTO UPDATE updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION eon_ai.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION rag.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;



-- =========================================================
-- 7. TRIGGERS
-- =========================================================

DROP TRIGGER IF EXISTS trg_teams_context_updated_at
ON eon_ai.teams_conversation_context;


CREATE TRIGGER trg_teams_context_updated_at
BEFORE UPDATE
ON eon_ai.teams_conversation_context
FOR EACH ROW
EXECUTE FUNCTION eon_ai.touch_updated_at();



DROP TRIGGER IF EXISTS trg_rag_documents_updated_at
ON rag.documents;


CREATE TRIGGER trg_rag_documents_updated_at
BEFORE UPDATE
ON rag.documents
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();



DROP TRIGGER IF EXISTS trg_rag_chunks_updated_at
ON rag.chunks;


CREATE TRIGGER trg_rag_chunks_updated_at
BEFORE UPDATE
ON rag.chunks
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();



DROP TRIGGER IF EXISTS trg_rag_sync_state_updated_at
ON rag.sync_state;


CREATE TRIGGER trg_rag_sync_state_updated_at
BEFORE UPDATE
ON rag.sync_state
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();



-- =========================================================
-- 8. VERIFICATION
-- =========================================================

SELECT
    schemaname,
    tablename
FROM pg_tables
WHERE schemaname IN (
    'eon_ai',
    'rag',
    'mastra',
    'mastra_editor'
)
ORDER BY
    schemaname,
    tablename;