# Full Code - LE Mining Intelligence Agent

This folder is a complete working project snapshot based on the Product-Knowledge-only RAG refactor.

## What changed from the previous LE Mining Product Agent

The `le-mining` agent is now an **LE Mining Intelligence Agent**.

It can use:

1. CRM Product - hard-filtered to LE + Active + Mining East/West.
2. SharePoint Product Knowledge - Mining Contractor/Mining Owner only.
3. CRM Account/customer search.
4. CRM Contact/person search.
5. Restricted LE product public web - only eonchemicals.com and lelubricants.com.
6. General public intelligence - company/customer/person/mining project/market/news only.
7. Current-time tool.

It still has no SOP/IK source.

## New files

```text
src/services/microsoft/dynamics-crm/le-mining-intelligence.service.ts
src/services/web/le-public-intelligence.service.ts
src/mastra/tools/le-mining/search-customers.tool.ts
src/mastra/tools/le-mining/search-contacts.tool.ts
src/mastra/tools/le-mining/search-public-intelligence.tool.ts
docs/LE_MINING_INTELLIGENCE_USAGE.md
```

## Replaced/updated files

```text
src/mastra/schemas/le-mining.schema.ts
src/mastra/tools/le-mining/search-public-web.tool.ts
src/mastra/tools/tool.registry.ts
src/mastra/agents/le-mining.agent.ts
src/mastra/prompts/le-mining.instructions.ts
```

## Usage

See:

```text
docs/LE_MINING_INTELLIGENCE_USAGE.md
```

## Important customer limitation

Product filtering is fully enforced because the relevant Product fields are known.

Customer Account search intentionally does **not** claim a hard Mining filter yet. The authoritative custom CRM Account field that classifies Mining customers has not been supplied. The tool therefore returns CRM Accounts and the agent may use public evidence to establish Mining relevance when needed.

Do not invent a Mining Account filter until the actual Account field and option values are confirmed.
