BEGIN;

-- =========================================================
-- PRODUCT KNOWLEDGE ONLY RAG RESET
-- Drops only schema rag. Mastra memory/editor schemas are untouched.
-- =========================================================

DROP SCHEMA IF EXISTS rag CASCADE;
CREATE SCHEMA rag;

-- =========================================================
-- DOCUMENTS
-- =========================================================

CREATE TABLE rag.documents (
    id BIGSERIAL PRIMARY KEY,

    source_key TEXT NOT NULL,
    source_item_id TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'sharepoint_document_library',

    title TEXT NOT NULL,
    file_name TEXT,

    category TEXT,
    product_name TEXT,
    industry_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    applications TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    equipment TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    source_url TEXT,
    source_etag TEXT,
    source_modified_at TIMESTAMPTZ,

    content_hash TEXT,
    indexed_content_hash TEXT,
    content_text TEXT,

    is_searchable BOOLEAN NOT NULL DEFAULT FALSE,
    embedding_model TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    indexed_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rag_documents_source
        UNIQUE (source_key, source_item_id)
);

CREATE INDEX ix_rag_documents_source_key
ON rag.documents(source_key);

CREATE INDEX ix_rag_documents_category
ON rag.documents(category);

CREATE INDEX ix_rag_documents_product_name_lower
ON rag.documents(LOWER(product_name));

CREATE INDEX ix_rag_documents_industry_types
ON rag.documents USING GIN(industry_types);

CREATE INDEX ix_rag_documents_applications
ON rag.documents USING GIN(applications);

CREATE INDEX ix_rag_documents_equipment
ON rag.documents USING GIN(equipment);

CREATE INDEX ix_rag_documents_source_modified
ON rag.documents(source_modified_at DESC);

CREATE INDEX ix_rag_documents_searchable
ON rag.documents(is_searchable)
WHERE is_searchable = TRUE;

-- =========================================================
-- CHUNKS
-- No pgvector. Embeddings remain DOUBLE PRECISION[].
-- =========================================================

CREATE TABLE rag.chunks (
    id BIGSERIAL PRIMARY KEY,

    document_id BIGINT NOT NULL
        REFERENCES rag.documents(id)
        ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding DOUBLE PRECISION[] NOT NULL,
    token_hint INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_rag_chunks_document_chunk
        UNIQUE (document_id, chunk_index),

    CONSTRAINT ck_rag_chunks_embedding_not_empty
        CHECK (CARDINALITY(embedding) > 0)
);

CREATE INDEX ix_rag_chunks_document_id
ON rag.chunks(document_id);

-- =========================================================
-- SHAREPOINT DELTA STATE
-- =========================================================

CREATE TABLE rag.sync_state (
    source_key TEXT PRIMARY KEY,
    site_id TEXT,
    list_id TEXT,
    delta_link TEXT,
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION rag.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rag_documents_updated_at
BEFORE UPDATE ON rag.documents
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();

CREATE TRIGGER trg_rag_chunks_updated_at
BEFORE UPDATE ON rag.chunks
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();

CREATE TRIGGER trg_rag_sync_state_updated_at
BEFORE UPDATE ON rag.sync_state
FOR EACH ROW
EXECUTE FUNCTION rag.touch_updated_at();

COMMIT;
