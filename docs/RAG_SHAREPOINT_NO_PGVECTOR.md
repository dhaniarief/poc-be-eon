# EON Product Knowledge RAG - PostgreSQL Array Version

This RAG contains **Product Knowledge only**.

Source:
- Site: `/sites/aidata`
- Library: `Product Knowledge`
- List ID: `3c6e2865-ecf6-4ce7-ad34-98481dceb7de`

SOP / IK and MIS-SOPIK are intentionally not part of this RAG anymore.

## SharePoint metadata indexed

- `Category`
- `ProductName`
- `IndustryType`
- `Application`
- `Equipment`
- PDF text
- SharePoint document URL

`Application` and `Equipment` are Text columns in SharePoint. The ingestion service splits semicolon-delimited values into PostgreSQL `TEXT[]` arrays.

## PostgreSQL

Tables:

- `rag.documents`
- `rag.chunks`
- `rag.sync_state`

Embeddings remain `DOUBLE PRECISION[]`; pgvector is not required.

## Commands

```bash
npm run rag:migrate
npm run rag:sync:full
npm run rag:search -- "open gear lubrication ball mill"
```

`rag:migrate` drops and recreates the `rag` schema. It does not drop `mastra` or `mastra_editor`.

## Mining filter

The LE Mining agent searches Product Knowledge only when `IndustryType` overlaps:

- `Mining Contractor`
- `Mining Owner`

This is enforced by the repository query, not only by the system prompt.
