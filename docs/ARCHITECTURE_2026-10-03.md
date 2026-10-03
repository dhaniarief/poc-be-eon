# EON AI Sales Backend - Refactored Architecture

## Goal

Keep the model-visible surface small while keeping Microsoft integration code easy to extend.

```text
Teams / REST dev
      |
      v
Sales Agent
      |
      +-- resolveEntity
      +-- querySales
      +-- getOpportunity
      +-- checkStock
      +-- getMsds
      +-- searchKnowledge
      +-- currentTime
      |
      v
Services
  CRM | FinOps | SharePoint | Sales orchestration
```

There is no persisted Active Opportunity. Conversation memory is only for conversational continuity.

## Where to change things

### Add a new resolvable entity

1. Add the entity name to `SALES_ENTITY_TYPES` in `sales-crm.service.ts`.
2. Add one resolver branch in `resolveEntity()`.
3. If it becomes a `querySales` filter, add the ID field to `sales.schema.ts` and `querySales()`.

Generic request context does **not** need schema changes for new host context entities:

```json
{
  "entities": {
    "vendor": { "id": "...", "name": "Vendor A" },
    "project": { "id": "...", "name": "Project X" }
  }
}
```

### Add a new Sales tool

1. Create one file in `src/mastra/tools/sales/`.
2. Put business logic in a service, not inside the tool.
3. Register the tool once in `src/mastra/tools/tool.registry.ts`.
4. Add a short routing rule to `sales.instructions.ts` when necessary.

### Add a new agent

1. Create `src/mastra/agents/<name>.agent.ts`.
2. Register local/cloud instances in `agent.registry.ts`.
3. Add the public agent key in `publicAgentKeys`.

No changes are required in `agent.runner.ts`.

## Business rules captured in code

### Opportunity / owner

Salesman name -> CRM `systemuserid` -> Opportunity `_ownerid_value`.

Customer is CRM Account -> `accountid` -> Opportunity `_customerid_value`.

### Actual Revenue

```text
Actual Revenue
= Opportunity.actualvalue
+ SUM(new_opportunityhistorypartials.new_extendedamount)
```

Partial count:

```text
COUNT DISTINCT new_opportunityhistorypartialid
```

Partial date is `new_actualclosedatepartial`.

For product grouping, revenue is line-based to avoid duplicating an Opportunity header value across multiple products.

### Stock

```text
CRM Product Name + CRM UOM Name
-> FinOps ProductsV2 exact ProductName
-> ProductNumber
-> ReleasedProductsV2 ItemNumber
-> InventorySitesOnHandV2
```

If only productId is supplied, UOMs from the CRM UOM Schedule are candidates; a candidate is valid only when it resolves to a real FinOps item.

### SO / DO / Invoice

```text
opportunityId
-> CRM new_noopp
-> FinOps CustomersOrderReference = "new_noopp*"
-> SalesOrderNumber
-> Packing Slip / Invoice
```

The literal `*` behavior is preserved because that is the working EON environment convention.

SO amount uses `SalesOrderLinesV3.LineAmount`, not the header `OrderTotalAmount` sample that can be zero.

Document counts use distinct business keys:

- SO: SalesOrderNumber
- DO: PackingSlipId
- Invoice: InvoiceNumber

### MSDS

```text
productId
-> CRM Product Name
-> SharePoint filename prefix
-> Category = "MSDS for Email"
-> not deleted
-> latest Modified document
```

MSDS does not use UOM or FinOps item resolution.

## Important files

```text
src/mastra/agents/sales.agent.ts
src/mastra/prompts/sales.instructions.ts
src/mastra/tools/tool.registry.ts
src/mastra/tools/sales/
src/mastra/runtime/request-context.ts

src/services/microsoft/dynamics-crm/sales-crm.service.ts
src/services/microsoft/dynamics-finops/sales-finops.service.ts
src/services/microsoft/dynamics-finops/item-resolver.service.ts
src/services/microsoft/sharepoint/msds.service.ts
src/services/sales/sales-intelligence.service.ts
```

## Removed legacy complexity

- custom Copilot bot/ingress/background queue
- Copilot Teams middleware
- persisted Teams Active Opportunity context
- `setActiveOpportunity`
- one-model-tool-per-CRM/F&O-endpoint pattern
- MSDS dependency on FinOps ItemId

Mastra Teams adapter is now the production Teams entry path.

## Product filtering and partial history

A Product filter considers both current `opportunityproducts` and
`new_opportunityhistorypartials`. This prevents a Product that has already been
partially realized from disappearing from Sales analytics simply because only
its partial history remains relevant.

When `productId` is present, revenue and transaction metrics use product-line
facts instead of assigning the full Opportunity header value to that Product.

## Verification notes

The refactor was syntax-checked across `src/` and `tests/`. A global TypeScript
compiler pass reported no internal refactor diagnostics after dependency-related
"module not found" errors were excluded. Full `npm run typecheck` / `npm test`
requires a normal dependency install (`npm ci`) in the target development
environment.
