# Product Knowledge RAG

The active RAG source is SharePoint Product Knowledge only:

`https://eonchemicals1.sharepoint.com/sites/aidata/Product%20Knowledge/Forms/AllItems.aspx`

Legacy MIS-SOPIK ingestion has been removed.

## Setup

1. Configure `.env.development`.
2. Run `npm run rag:migrate`.
3. Run `npm run rag:sync:full`.
4. Verify with `db/002_rag_product_knowledge_verify.sql`.
5. Test retrieval with `npm run rag:search -- "industrial gearbox"`.

## Product Knowledge metadata

- Category
- Product Name
- Industry Type
- Application
- Equipment
- PDF text
- Document URL

## LE Mining agent

Public REST agent id: `le-mining`

Example development endpoint:

`POST /api/agents/le-mining/chat`

Its internal product scope is hard-coded to:

- Product Family = `100000021` (Lubrication Engineers)
- State = `0` (Active)
- Industry = `100000002` (Mining East) OR `100000003` (Mining West)

Public web research is restricted to:

- `eonchemicals.com`
- `lelubricants.com`
