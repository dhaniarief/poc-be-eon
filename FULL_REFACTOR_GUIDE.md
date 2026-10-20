# EON AI - LE Mining + Product Knowledge RAG Refactor

## Target

- Add dedicated public agent ID: `le-mining`
- CRM product scope is hard-coded to:
  - `new_productfamily = 100000021` (LE)
  - `statecode = 0` (Active)
  - `new_industryproduct` contains `100000002` (Mining East) or `100000003` (Mining West)
- RAG source is only SharePoint `/sites/aidata/Product Knowledge`
- Product Knowledge metadata: `Category`, `ProductName`, `IndustryType`, `Application`, `Equipment`
- Public web for LE Mining is code-restricted to `eonchemicals.com` and `lelubricants.com`
- Legacy SOP/IK / MIS-SOPIK ingestion is removed.

## Add

- `db/001_rag_product_knowledge.sql`
- `db/002_rag_product_knowledge_verify.sql`
- `docs/LE_MINING_QUERIES.md`
- `src/mastra/agents/le-mining.agent.ts`
- `src/mastra/prompts/le-mining.instructions.ts`
- `src/mastra/schemas/le-mining.schema.ts`
- `src/mastra/tools/le-mining/search-products.tool.ts`
- `src/mastra/tools/le-mining/search-mining-knowledge.tool.ts`
- `src/mastra/tools/le-mining/search-public-web.tool.ts`
- `src/services/microsoft/dynamics-crm/le-mining-product.service.ts`
- `src/services/web/le-public-search.service.ts`

## Replace / update

- `.env.example`
- `package.json`
- `db/db awal.sql`
- `db/query liat msg.sql`
- `docs/RAG_SHAREPOINT_NO_PGVECTOR.md`
- `src/config/env.ts`
- `src/scripts/rag-migrate.ts`
- `src/scripts/rag-search.ts`
- `src/scripts/rag-sync.ts`
- `src/mastra/agents/agent.registry.ts`
- `src/mastra/agents/local-synthesis.agent.ts`
- `src/mastra/prompts/sales.instructions.ts`
- `src/mastra/runtime/model-output.ts`
- `src/mastra/runtime/tool-results.ts`
- `src/mastra/schemas/knowledge.schema.ts`
- `src/mastra/tools/knowledge/search-knowledge.tool.ts`
- `src/mastra/tools/tool.registry.ts`
- `src/services/microsoft/sharepoint/product-knowledge-rag.service.ts`
- `src/services/rag/knowledge-search.service.ts`
- `src/services/rag/product-knowledge-rag-sync.service.ts`
- `src/services/rag/rag-sync.scheduler.ts`
- `src/services/rag/rag.repository.ts`

## Delete

- `src/services/microsoft/sharepoint/sop-ik-rag.service.ts`
- `src/services/rag/sharepoint-rag-sync.service.ts`
- `src/services/rag/content-cleaner.ts`

## PostgreSQL migration warning

`db/001_rag_product_knowledge.sql` runs:

```sql
DROP SCHEMA IF EXISTS rag CASCADE;
```

This intentionally deletes the old RAG index, including MIS-SOPIK data, and rebuilds only the `rag` schema. It does **not** drop Mastra memory/editor schemas.

Back up the existing `rag` schema first if you need rollback.

## Run order

```powershell
# 1. Back up DB if needed.

# 2. Install dependencies from the project root.
npm install

# 3. Typecheck/tests.
npm run typecheck
npm test

# 4. Recreate Product Knowledge-only RAG schema.
npm run rag:migrate

# 5. Full sync from SharePoint Product Knowledge.
npm run rag:sync:full

# 6. Test retrieval.
npm run rag:search -- "open gear ball mill"
npm run rag:search -- "industrial gearbox"

# 7. Run the API.
npm run dev
```

## Verify PostgreSQL

Run `db/002_rag_product_knowledge_verify.sql` or at minimum:

```sql
SELECT source_key, COUNT(*)
FROM rag.documents
GROUP BY source_key;
```

Expected source:

```text
sharepoint:aidata:product-knowledge
```

Confirm old SOP source is gone:

```sql
SELECT COUNT(*)
FROM rag.documents
WHERE source_key = 'sharepoint:mis-sopik:sitepages';
```

Expected: `0`.

## Test new agent

```http
POST /api/agents/le-mining/chat
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "Produk LE apa yang cocok untuk open gear ball mill?",
  "modelMode": "cloud"
}
```

The recommendation flow is:

1. `le-mining.knowledge` finds Product Knowledge evidence for Mining.
2. `le-mining.products` validates the recommended product is currently Active + LE + Mining in CRM.
3. If public research is requested, `le-mining.web` only returns URLs under `eonchemicals.com` or `lelubricants.com`.

## Important implementation details

### CRM

The production CRM service intentionally queries `LE + Active` server-side, then **re-checks Mining in code** before returning a row. This is defense-in-depth and keeps the service safe even if the OData query changes.

### SharePoint

- `IndustryType` is a MultiChoice field.
- `Application` and `Equipment` are Text fields.
- Semicolon/newline-delimited Application and Equipment values are normalized into PostgreSQL arrays.

### RAG

No pgvector is required. Embeddings remain `DOUBLE PRECISION[]`, with cosine similarity calculated in application code. This is appropriate for the current small Product Knowledge corpus.

### Sales Agent

Legacy SOP/IK knowledge is removed from Sales Agent instructions and Product Knowledge search is the only RAG knowledge source.
