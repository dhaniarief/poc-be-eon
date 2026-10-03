# EON AI Backend

Backend AI EON berbasis Mastra, Microsoft Teams, Dynamics 365 CRM/FinOps, SharePoint, dan PostgreSQL.

## Runtime utama

- Production chat: Mastra Teams adapter pada `sales-cloud-agent`.
- REST `/api/agents/:agentId/chat`: tetap tersedia untuk development/integration test.
- Mastra Memory: hanya untuk continuity percakapan; CRM/FinOps tetap source of truth.

## Sales tool surface

Model hanya melihat capability bisnis utama:

- `resolveEntity`
- `querySales`
- `getOpportunity`
- `checkStock`
- `getMsds`
- `searchKnowledge`
- `currentTime`

Endpoint CRM/F&O yang detail tetap berada di service layer dan tidak dijadikan tool satu per satu.

## Struktur penting

```text
src/mastra/agents/                 agent definitions + registry
src/mastra/tools/                  thin Mastra tools + registry
src/mastra/runtime/                generic request/memory runtime
src/services/microsoft/            CRM, FinOps, SharePoint clients/services
src/services/sales/                Sales orchestration + aggregation
docs/ARCHITECTURE_2026-10-03.md    extension guide + business rules
```

## Development

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

Mastra Studio:

```bash
npm run studio
```

Copy `.env.example` to `.env` and fill the environment-specific credentials/URLs.

## Menambah capability

Panduan menambah resolvable entity, context entity, Sales tool, atau agent ada di:

`docs/ARCHITECTURE_2026-10-03.md`
