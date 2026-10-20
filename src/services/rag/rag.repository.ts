import type { PoolClient } from "pg";

import { postgresPool } from "../database/postgres.js";

export type RagDocumentInput = {
  sourceKey: string;
  sourceItemId: string;
  sourceType: string;
  title: string;
  fileName: string | null;
  category: string | null;
  productName: string | null;
  industryTypes: string[];
  applications: string[];
  equipment: string[];
  sourceUrl: string | null;
  sourceEtag: string | null;
  sourceModifiedAt: string | null;
  contentHash: string | null;
  contentText: string | null;
  isSearchable: boolean;
  metadata: Record<string, unknown>;
};

export type RagStoredDocument = {
  id: number;
  sourceItemId: string;
  contentHash: string | null;
  indexedContentHash: string | null;
  embeddingModel: string | null;
  isSearchable: boolean;
};

export type RagChunkInsert = {
  chunkIndex: number;
  content: string;
  embedding: number[];
  tokenHint?: number | null;
};

export type RagSearchCandidate = {
  chunkId: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
  title: string;
  category: string | null;
  productName: string | null;
  industryTypes: string[];
  applications: string[];
  equipment: string[];
  sourceUrl: string | null;
  sourceModifiedAt: string | null;
};

export type RagSyncState = {
  sourceKey: string;
  siteId: string | null;
  listId: string | null;
  deltaLink: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
};

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isFinite);
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^\{/, "").replace(/\}$/, "");
    if (!trimmed) return [];
    return trimmed.split(",").map(Number).filter(Number.isFinite);
  }

  return [];
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^\{/, "").replace(/\}$/, "");
    if (!trimmed) return [];

    return trimmed
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  }

  return [];
}

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return value.toISOString();

  const text = String(value).trim();
  if (!text) return null;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

export async function findRagDocument(
  sourceKey: string,
  sourceItemId: string,
): Promise<RagStoredDocument | null> {
  const result = await postgresPool.query<{
    id: string | number;
    source_item_id: string;
    content_hash: string | null;
    indexed_content_hash: string | null;
    embedding_model: string | null;
    is_searchable: boolean;
  }>(
    `
      SELECT
        id,
        source_item_id,
        content_hash,
        indexed_content_hash,
        embedding_model,
        is_searchable
      FROM rag.documents
      WHERE source_key = $1
        AND source_item_id = $2
      LIMIT 1
    `,
    [sourceKey, sourceItemId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    sourceItemId: row.source_item_id,
    contentHash: row.content_hash,
    indexedContentHash: row.indexed_content_hash,
    embeddingModel: row.embedding_model,
    isSearchable: row.is_searchable,
  };
}

export async function upsertRagDocument(
  input: RagDocumentInput,
): Promise<RagStoredDocument> {
  const result = await postgresPool.query<{
    id: string | number;
    source_item_id: string;
    content_hash: string | null;
    indexed_content_hash: string | null;
    embedding_model: string | null;
    is_searchable: boolean;
  }>(
    `
      INSERT INTO rag.documents (
        source_key,
        source_item_id,
        source_type,
        title,
        file_name,
        category,
        product_name,
        industry_types,
        applications,
        equipment,
        source_url,
        source_etag,
        source_modified_at,
        content_hash,
        content_text,
        is_searchable,
        metadata,
        last_synced_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::text[], $9::text[], $10::text[],
        $11, $12, $13, $14, $15, $16, $17::jsonb, now()
      )
      ON CONFLICT (source_key, source_item_id)
      DO UPDATE SET
        source_type = EXCLUDED.source_type,
        title = EXCLUDED.title,
        file_name = EXCLUDED.file_name,
        category = EXCLUDED.category,
        product_name = EXCLUDED.product_name,
        industry_types = EXCLUDED.industry_types,
        applications = EXCLUDED.applications,
        equipment = EXCLUDED.equipment,
        source_url = EXCLUDED.source_url,
        source_etag = EXCLUDED.source_etag,
        source_modified_at = EXCLUDED.source_modified_at,
        content_hash = EXCLUDED.content_hash,
        content_text = EXCLUDED.content_text,
        is_searchable = EXCLUDED.is_searchable,
        metadata = EXCLUDED.metadata,
        last_synced_at = now()
      RETURNING
        id,
        source_item_id,
        content_hash,
        indexed_content_hash,
        embedding_model,
        is_searchable
    `,
    [
      input.sourceKey,
      input.sourceItemId,
      input.sourceType,
      input.title,
      input.fileName,
      input.category,
      input.productName,
      input.industryTypes,
      input.applications,
      input.equipment,
      input.sourceUrl,
      input.sourceEtag,
      input.sourceModifiedAt,
      input.contentHash,
      input.contentText,
      input.isSearchable,
      JSON.stringify(input.metadata),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Failed to upsert RAG document.");

  return {
    id: Number(row.id),
    sourceItemId: row.source_item_id,
    contentHash: row.content_hash,
    indexedContentHash: row.indexed_content_hash,
    embeddingModel: row.embedding_model,
    isSearchable: row.is_searchable,
  };
}

async function insertChunks(
  client: PoolClient,
  documentId: number,
  chunks: RagChunkInsert[],
) {
  for (const chunk of chunks) {
    await client.query(
      `
        INSERT INTO rag.chunks (
          document_id,
          chunk_index,
          content,
          embedding,
          token_hint
        ) VALUES ($1, $2, $3, $4::double precision[], $5)
      `,
      [
        documentId,
        chunk.chunkIndex,
        chunk.content,
        chunk.embedding,
        chunk.tokenHint ?? null,
      ],
    );
  }
}

export async function replaceRagDocumentChunks(input: {
  documentId: number;
  chunks: RagChunkInsert[];
  indexedContentHash: string;
  embeddingModel: string;
}) {
  const client = await postgresPool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM rag.chunks WHERE document_id = $1", [
      input.documentId,
    ]);

    await insertChunks(client, input.documentId, input.chunks);

    await client.query(
      `
        UPDATE rag.documents
        SET
          is_searchable = true,
          indexed_content_hash = $2,
          embedding_model = $3,
          indexed_at = now(),
          last_synced_at = now()
        WHERE id = $1
      `,
      [input.documentId, input.indexedContentHash, input.embeddingModel],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function disableRagDocument(documentId: number) {
  const client = await postgresPool.connect();

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM rag.chunks WHERE document_id = $1", [
      documentId,
    ]);

    await client.query(
      `
        UPDATE rag.documents
        SET
          is_searchable = false,
          indexed_content_hash = NULL,
          embedding_model = NULL,
          indexed_at = NULL,
          last_synced_at = now()
        WHERE id = $1
      `,
      [documentId],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteRagDocumentBySource(
  sourceKey: string,
  sourceItemId: string,
) {
  const result = await postgresPool.query(
    `
      DELETE FROM rag.documents
      WHERE source_key = $1
        AND source_item_id = $2
    `,
    [sourceKey, sourceItemId],
  );

  return result.rowCount ?? 0;
}

export async function getRagSearchCandidates(input: {
  sourceKey: string;
  industryTypesAny?: string[];
}): Promise<RagSearchCandidate[]> {
  const conditions = [
    "d.source_key = $1",
    "d.is_searchable = true",
  ];

  const params: unknown[] = [input.sourceKey];

  const industries = (input.industryTypesAny ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

  if (industries.length > 0) {
    params.push(industries);
    conditions.push(`d.industry_types && $${params.length}::text[]`);
  }

  const result = await postgresPool.query<{
    chunk_id: string | number;
    document_id: string | number;
    chunk_index: number;
    content: string;
    embedding: unknown;
    title: string;
    category: string | null;
    product_name: string | null;
    industry_types: unknown;
    applications: unknown;
    equipment: unknown;
    source_url: string | null;
    source_modified_at: string | Date | null;
  }>(
    `
      SELECT
        c.id AS chunk_id,
        c.document_id,
        c.chunk_index,
        c.content,
        c.embedding,
        d.title,
        d.category,
        d.product_name,
        d.industry_types,
        d.applications,
        d.equipment,
        d.source_url,
        d.source_modified_at
      FROM rag.chunks c
      INNER JOIN rag.documents d
        ON d.id = c.document_id
      WHERE ${conditions.join("\n        AND ")}
    `,
    params,
  );

  return result.rows.map((row) => ({
    chunkId: Number(row.chunk_id),
    documentId: Number(row.document_id),
    chunkIndex: Number(row.chunk_index),
    content: row.content,
    embedding: toNumberArray(row.embedding),
    title: row.title,
    category: row.category,
    productName: row.product_name,
    industryTypes: toStringArray(row.industry_types),
    applications: toStringArray(row.applications),
    equipment: toStringArray(row.equipment),
    sourceUrl: row.source_url,
    sourceModifiedAt: toIsoString(row.source_modified_at),
  }));
}

export async function getRagSyncState(
  sourceKey: string,
): Promise<RagSyncState | null> {
  const result = await postgresPool.query<{
    source_key: string;
    site_id: string | null;
    list_id: string | null;
    delta_link: string | null;
    last_sync_at: string | Date | null;
    last_sync_status: string | null;
    last_error: string | null;
  }>(
    `
      SELECT
        source_key,
        site_id,
        list_id,
        delta_link,
        last_sync_at,
        last_sync_status,
        last_error
      FROM rag.sync_state
      WHERE source_key = $1
      LIMIT 1
    `,
    [sourceKey],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    sourceKey: row.source_key,
    siteId: row.site_id,
    listId: row.list_id,
    deltaLink: row.delta_link,
    lastSyncAt: toIsoString(row.last_sync_at),
    lastSyncStatus: row.last_sync_status,
    lastError: row.last_error,
  };
}

export async function saveRagSyncState(input: {
  sourceKey: string;
  siteId: string | null;
  listId: string | null;
  deltaLink: string | null;
  status: string;
  error?: string | null;
}) {
  await postgresPool.query(
    `
      INSERT INTO rag.sync_state (
        source_key,
        site_id,
        list_id,
        delta_link,
        last_sync_at,
        last_sync_status,
        last_error
      ) VALUES ($1, $2, $3, $4, now(), $5, $6)
      ON CONFLICT (source_key)
      DO UPDATE SET
        site_id = EXCLUDED.site_id,
        list_id = EXCLUDED.list_id,
        delta_link = EXCLUDED.delta_link,
        last_sync_at = now(),
        last_sync_status = EXCLUDED.last_sync_status,
        last_error = EXCLUDED.last_error
    `,
    [
      input.sourceKey,
      input.siteId,
      input.listId,
      input.deltaLink,
      input.status,
      input.error ?? null,
    ],
  );
}

export async function deleteRagDocumentsNotInSourceIds(
  sourceKey: string,
  sourceItemIds: string[],
) {
  if (sourceItemIds.length === 0) {
    const result = await postgresPool.query(
      `DELETE FROM rag.documents WHERE source_key = $1`,
      [sourceKey],
    );

    return result.rowCount ?? 0;
  }

  const result = await postgresPool.query(
    `
      DELETE FROM rag.documents
      WHERE source_key = $1
        AND NOT (source_item_id = ANY($2::text[]))
    `,
    [sourceKey, sourceItemIds],
  );

  return result.rowCount ?? 0;
}
