-- =========================================================
-- PRODUCT KNOWLEDGE RAG VERIFICATION QUERIES
-- =========================================================

-- 1. Confirm only the Product Knowledge source exists.
SELECT
    source_key,
    COUNT(*) AS documents,
    COUNT(*) FILTER (WHERE is_searchable) AS searchable_documents
FROM rag.documents
GROUP BY source_key
ORDER BY source_key;

-- 2. Category distribution.
SELECT
    category,
    COUNT(*) AS documents
FROM rag.documents
GROUP BY category
ORDER BY documents DESC, category;

-- 3. Industry coverage.
SELECT
    industry,
    COUNT(*) AS documents
FROM rag.documents
CROSS JOIN LATERAL UNNEST(industry_types) AS industry
GROUP BY industry
ORDER BY documents DESC, industry;

-- 4. Application coverage.
SELECT
    application,
    COUNT(*) AS documents
FROM rag.documents
CROSS JOIN LATERAL UNNEST(applications) AS application
GROUP BY application
ORDER BY documents DESC, application;

-- 5. Equipment coverage.
SELECT
    equipment_name,
    COUNT(*) AS documents
FROM rag.documents
CROSS JOIN LATERAL UNNEST(equipment) AS equipment_name
GROUP BY equipment_name
ORDER BY documents DESC, equipment_name;

-- 6. Mining-only Product Knowledge documents.
SELECT
    id,
    title,
    category,
    product_name,
    industry_types,
    applications,
    equipment,
    source_url,
    source_modified_at
FROM rag.documents
WHERE industry_types && ARRAY['Mining Contractor', 'Mining Owner']::TEXT[]
ORDER BY source_modified_at DESC NULLS LAST, title;

-- 7. Chunk / embedding coverage.
SELECT
    d.id,
    d.title,
    d.product_name,
    COUNT(c.id) AS chunk_count,
    MAX(CARDINALITY(c.embedding)) AS embedding_dimension,
    d.embedding_model,
    d.indexed_at
FROM rag.documents d
LEFT JOIN rag.chunks c
    ON c.document_id = d.id
GROUP BY d.id
ORDER BY d.title;

-- 8. Documents that are not searchable.
SELECT
    id,
    title,
    file_name,
    category,
    product_name,
    content_hash,
    indexed_content_hash,
    embedding_model,
    indexed_at
FROM rag.documents
WHERE is_searchable = FALSE
ORDER BY title;

-- 9. Confirm SOP/IK source is gone.
SELECT COUNT(*) AS legacy_sop_documents
FROM rag.documents
WHERE source_key = 'sharepoint:mis-sopik:sitepages';

-- 10. Current delta state.
SELECT *
FROM rag.sync_state
ORDER BY source_key;
