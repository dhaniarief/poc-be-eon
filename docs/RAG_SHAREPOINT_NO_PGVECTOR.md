# EON SOP / IK RAG - PostgreSQL Array Version

This implementation does **not** require pgvector.

Embeddings are stored in PostgreSQL as `double precision[]`. At query time the
backend loads the active chunk embeddings and calculates cosine similarity in
Node.js. This is intentionally simple for the current SOP/IK volume.

## Source

- Host: `eonchemicals1.sharepoint.com`
- Site: `/sites/MIS-SOPIK`
- List: `Site Pages`
- List ID: `2b9a5ffe-11d9-4f4c-af28-3ee548943605`
- Main page content field: `CanvasContent1`
- Indexed document types: `SOP` and `IK`
- Searchable status: `Active`, effective, and not expired

## 1. PostgreSQL

Run this file in pgAdmin Query Tool against the `be_eon_ai` database:

```text
db/001_rag_sharepoint_array.sql
```

No `CREATE EXTENSION vector` command is needed.

Expected objects:

```text
rag.documents
rag.chunks
rag.sync_state
```

## 2. Environment variables

Add to `.env.development` / `.env.production`:

```env
SHAREPOINT_SOP_HOSTNAME=eonchemicals1.sharepoint.com
SHAREPOINT_SOP_SITE_PATH=/sites/MIS-SOPIK
SHAREPOINT_SOP_LIST_ID=2b9a5ffe-11d9-4f4c-af28-3ee548943605

RAG_SOURCE_KEY=sharepoint:mis-sopik:sitepages
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_EMBED_BATCH_SIZE=32
RAG_SEARCH_TOP_K=5
RAG_MIN_SCORE=0.35
RAG_CHUNK_SIZE_CHARS=1800
RAG_CHUNK_OVERLAP_CHARS=250

RAG_SYNC_ENABLED=true
RAG_SYNC_ON_START=true
RAG_SYNC_INTERVAL_MS=300000
```

The existing `OPENAI_API_KEY`, `DATABASE_URL`, and Microsoft application
credentials are reused.

The Microsoft Entra app needs permission to read the MIS-SOPIK site through
Microsoft Graph. `Sites.Read.All` is the standard application permission; if
EON uses `Sites.Selected`, grant the application read access to this site.

## 3. Install

```powershell
npm i
```

No additional package is required for this RAG implementation.

## 4. Initial sync

```powershell
npm run rag:sync:full
```

The first run enumerates the current Site Pages through Microsoft Graph delta,
reads the latest fields including `CanvasContent1`, cleans the page content,
chunks it, creates OpenAI embeddings, stores the vectors as PostgreSQL arrays,
and saves the returned Graph delta link.

## 5. Verify PostgreSQL

```sql
SELECT
  source_item_id,
  title,
  doc_number,
  doc_type,
  process,
  status,
  doc_version,
  is_searchable,
  indexed_at
FROM rag.documents
ORDER BY source_item_id::integer;
```

```sql
SELECT
  d.title,
  COUNT(c.id) AS chunks,
  MAX(cardinality(c.embedding)) AS embedding_dimensions
FROM rag.documents d
LEFT JOIN rag.chunks c ON c.document_id = d.id
GROUP BY d.id, d.title
ORDER BY d.title;
```

With `text-embedding-3-small`, the default vector length is normally 1536, but
the database does not hard-code the size.

## 6. Direct search test

```powershell
npm run rag:search -- "berapa maksimal waktu development aplikasi in-house"
```

## 7. Start application

```powershell
npm run dev
```

The Sales Agent now exposes `knowledge.search`. Questions about SOP, IK,
internal procedures, responsibilities, SLA/limits, approvals, and work
instructions are routed to the internal knowledge tool.

## 8. Automatic sync

When enabled, the server checks Microsoft Graph delta every five minutes by
default. Only changed/deleted list items are processed after the first sync.
If a delta token becomes invalid (`410 Gone`), the service performs one fresh
enumeration and stores a new delta link.

## Important operational note

This array-based search is appropriate while the internal knowledge base is
small (for example hundreds or a few thousand chunks). If the corpus grows
substantially, migrate `rag.chunks.embedding` to pgvector or a dedicated vector
store so similarity search can be indexed instead of calculated in Node.js.
