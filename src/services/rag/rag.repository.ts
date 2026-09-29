import type { PoolClient } from "pg";

import { postgresPool } from "../database/postgres.js";

export type RagDocumentInput = {
  sourceKey: string;
  sourceItemId: string;
  sourceType: string;
  title: string;
  fileName: string | null;
  docNumber: string | null;
  docType: string | null;
  process: string | null;
  status: string | null;
  docVersion: number | null;
  effectiveFrom: string | null;
  validTo: string | null;
  reminderToUpdate: string | null;
  managerApprovalStatus: string | null;
  qaApprovalStatus: string | null;
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
  docNumber: string | null;
  docType: string | null;
  process: string | null;
  docVersion: number | null;
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

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return trimmed;
  }

  const parsed = new Date(String(value));

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
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
        doc_number,
        doc_type,
        process,
        status,
        doc_version,
        effective_from,
        valid_to,
        reminder_to_update,
        manager_approval_status,
        qa_approval_status,
        source_url,
        source_etag,
        source_modified_at,
        content_hash,
        content_text,
        is_searchable,
        metadata,
        last_synced_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22::jsonb, now()
      )
      ON CONFLICT (source_key, source_item_id)
      DO UPDATE SET
        source_type = EXCLUDED.source_type,
        title = EXCLUDED.title,
        file_name = EXCLUDED.file_name,
        doc_number = EXCLUDED.doc_number,
        doc_type = EXCLUDED.doc_type,
        process = EXCLUDED.process,
        status = EXCLUDED.status,
        doc_version = EXCLUDED.doc_version,
        effective_from = EXCLUDED.effective_from,
        valid_to = EXCLUDED.valid_to,
        reminder_to_update = EXCLUDED.reminder_to_update,
        manager_approval_status = EXCLUDED.manager_approval_status,
        qa_approval_status = EXCLUDED.qa_approval_status,
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
      input.docNumber,
      input.docType,
      input.process,
      input.status,
      input.docVersion,
      input.effectiveFrom,
      input.validTo,
      input.reminderToUpdate,
      input.managerApprovalStatus,
      input.qaApprovalStatus,
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

export async function getRagSearchCandidates(input?: {
  docType?: string | null;
  process?: string | null;
}): Promise<RagSearchCandidate[]> {
  const conditions = [
    "d.is_searchable = true",
    "LOWER(COALESCE(d.status, '')) = 'active'",
    "(d.effective_from IS NULL OR d.effective_from <= now())",
    "(d.valid_to IS NULL OR d.valid_to >= now())",
  ];
  const params: unknown[] = [];

  if (input?.docType?.trim()) {
    params.push(input.docType.trim());
    conditions.push(
      `LOWER(COALESCE(d.doc_type, '')) = LOWER($${params.length})`,
    );
  }

  if (input?.process?.trim()) {
    params.push(input.process.trim());
    conditions.push(
      `LOWER(COALESCE(d.process, '')) = LOWER($${params.length})`,
    );
  }

  const result = await postgresPool.query<{
    chunk_id: string | number;
    document_id: string | number;
    chunk_index: number;
    content: string;
    embedding: unknown;
    title: string;
    doc_number: string | null;
    doc_type: string | null;
    process: string | null;
    doc_version: number | string | null;
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
        d.doc_number,
        d.doc_type,
        d.process,
        d.doc_version,
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
    docNumber: row.doc_number,
    docType: row.doc_type,
    process: row.process,

    docVersion:
      row.doc_version === null || row.doc_version === undefined
        ? null
        : Number(row.doc_version),

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
    last_sync_at: string | null;
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
    lastSyncAt: row.last_sync_at,
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
