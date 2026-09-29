# EON AI Backend Simplification Design

**Date:** 2026-09-19

## 1. Objective

Refactor the current EON AI Mastra backend into a smaller, easier-to-extend architecture while preserving existing business behavior and Local-vs-Cloud comparison capability.

The refactor must:

- remove Mastra workflows that are only thin wrappers around ordinary services;
- keep deterministic business logic in reusable services;
- reduce duplicate tool code and centralize common runtime helpers;
- simplify multi-turn API conversation memory so clients only manage a `conversationId`;
- standardize logging across HTTP requests, agent runs, tools, and external integrations;
- reduce prompt, tool-result, memory, and web-search token usage for both Local and Cloud;
- preserve direct fine-grained tools so new capabilities can still be added without modifying a monolithic workflow;
- add a compact opportunity intelligence capability for broad opportunity-summary requests;
- keep route calculation opt-in rather than automatically included in broad opportunity summaries;
- keep Local web research on SearXNG and Cloud web research on the OpenAI native web-search capability.

## 2. Current-State Findings

The latest uploaded source contains five Mastra workflows:

- `resolve-opportunity-items.workflow.ts`
- `stock-availability.workflow.ts`
- `delivery-context.workflow.ts`
- `route-estimate.workflow.ts`
- `msds.workflow.ts`

They are invoked by tools through `runtime/workflow-runner.ts`. Their current purpose is primarily to sequence one or two deterministic service calls. They do not currently provide long-running waits, approval gates, human intervention, resumable checkpoints, or meaningful branching that requires a workflow runtime.

The current Sales Agent also exposes many fine-grained tools simultaneously. On the Local benchmark this produced 14 agent steps, 106,654 total tokens, and about 252.7 seconds for the broad internal-plus-external intelligence prompt. Cloud handled the same request in 2 steps, 50,662 tokens, and about 102.1 seconds.

Other current-state observations:

- `sales.instructions.ts` repeats source authority, missing-data, and tool-selection rules in multiple sections.
- `agent.runner.ts` contains cloud execution, local execution, tool tracking, tool-result normalization, synthesis fallback, and benchmark metrics in one file.
- Local allows up to 30 steps and 12,000 output tokens.
- application context is serialized into the user prompt even though opportunity identity is already available through `RequestContext`.
- memory currently uses caller-provided `threadId` and `resourceId`; the development UI does not send them, so normal comparison requests are effectively isolated conversations.
- memory defaults to 20 recent messages.
- logging differs by component and tool; some tools log their own fields while others do not.
- SearXNG returns raw snippets without payload compaction or result deduplication.
- current workflow-related tests and runtime patterns can drift because workflow mechanics are exposed to ordinary tools.

## 3. Target Architecture

The target is a service-first architecture with thin Mastra tools.

```text
HTTP API
  |
  +-- Conversation Runtime
  |     +-- conversationId -> Mastra threadId
  |     +-- authenticated userId -> Mastra resourceId
  |
  +-- Agent Runtime
        |
        +-- Sales Agent
        |     +-- getOpportunityIntelligence  (broad summary)
        |     +-- fine-grained CRM tools      (specific questions)
        |     +-- fine-grained FinOps tools
        |     +-- fine-grained SharePoint tools
        |     +-- route/location tools        (only when requested)
        |     +-- Local SearXNG / Cloud native web search
        |
        +-- General Agent
              +-- currentTime
              +-- Local SearXNG / Cloud native web search

Services
  +-- CRM
  +-- FinOps
  +-- SharePoint
  +-- Routing
  +-- Web
  +-- Opportunity Intelligence Aggregator
```

### 3.1 Layer Responsibilities

**Controller / API**

- validates the transport contract;
- resolves a conversation identity;
- derives memory resource scope from the authenticated user;
- calls the agent runtime;
- returns response, `conversationId`, tools used, and compact metrics.

**Agent runtime**

- prepares `RequestContext`;
- applies memory;
- executes Local or Cloud agent behavior;
- tracks tool use;
- performs Local synthesis only when actually needed;
- emits one standardized agent-run metric event.

**Mastra tools**

- contain schemas and concise descriptions;
- obtain active opportunity identity from `RequestContext` when needed;
- call reusable services directly;
- use a shared execution/logging helper;
- do not contain business OData/Graph logic.

**Services**

- contain deterministic source-specific business logic;
- can call other services when composition is required;
- can be tested independently of Mastra.

**Utilities**

- only contain genuinely reusable, source-agnostic helpers;
- examples include text normalization, compacting payloads, logging operation wrappers, conversation ID handling, and tool-name normalization;
- utilities must not become a dumping ground for business-domain logic.



## 3.2 Mastra-Native Extensibility Contract

The refactor must keep Mastra as the composition boundary instead of moving provider/runtime logic into application services.

**Agents**

- Each business agent owns its agent factory, concise instructions, and tool selection.
- `agent.registry.ts` is the only registry that maps public `agentId` values to Local/Cloud Mastra agent instances.
- `mastra/index.ts` consumes the exported registry and does not require a new branch or import each time a business agent is added.
- The shared runner resolves agents through the registry and must remain unaware of agent-specific tools or prompts.

**Tools**

- Every tool is created with `createTool()` and keeps its input/output contracts in Zod schemas.
- Opportunity-bound tools declare the shared `requestContextSchema` so `opportunityId`, request metadata, and conversation metadata are validated by Mastra at runtime.
- Tool descriptions explain *when to use the capability* and the source authority; detailed routing manuals should not be duplicated in the agent system prompt.
- Large or rich tool responses keep their full structured result for application/storage use, but define `toModelOutput` so the model receives only the fields needed for reasoning. This is the default token-control mechanism for stock, opportunity intelligence, MSDS, Sales Order, delivery, invoice, and web-search results.

**Workflows**

- Keep an explicit `workflow.registry.ts` even when there are no production workflows after cleanup.
- Add a Mastra workflow only when the process benefits from deterministic multi-step semantics such as branching, parallel steps, suspend/resume, approvals, retries, or auditable long-running state.
- Ordinary source lookups and simple service composition remain services/tools rather than workflows.

**Hooks and observability**

- Mastra observability remains the canonical trace for model calls, agent steps, tool calls, token usage, latency, and errors.
- Agent-level tool hooks are used for cross-cutting tool lifecycle metadata where supported by the installed Mastra version, rather than repeating start/complete logger code in every tool.
- Custom EON logs record only business-relevant metadata not already represented well in Mastra traces, such as request ID, authenticated user scope, business source, result count, and normalized business error code.
- Sensitive payloads and credentials remain protected by `SensitiveDataFilter`.


## 4. Remove Thin Mastra Workflows

Delete the five existing thin workflow files and `runtime/workflow-runner.ts`.

Their deterministic behavior is preserved in services:

- item resolution remains in the FinOps item resolver services;
- stock availability directly composes item resolution plus stock lookup in a service;
- delivery context remains a reusable service;
- route estimate directly composes delivery context plus OSRM routing in a service;
- MSDS directly composes opportunity item resolution plus SharePoint lookup in a service.

Mastra workflows should be reintroduced only for processes that materially benefit from workflow semantics, such as long-running approvals, waiting for external state, resumability, human checkpoints, or branching business processes.

Mastra Studio therefore no longer needs to show the five current low-level workflows after this refactor.

## 5. Opportunity Intelligence Aggregator

Create one reusable service for broad opportunity requests:

```ts
getOpportunityIntelligence(opportunityId: string): Promise<OpportunityIntelligence>
```

It returns a compact internal snapshot containing only facts useful for broad sales summarization:

- opportunity overview;
- stage/status/PO/verification state;
- relevant activities summary;
- products summary;
- stock summary and per-item readiness;
- Sales Order summary;
- delivery summary;
- invoice summary;
- MSDS availability summary.

It does **not** automatically include:

- geocoding;
- route calculation;
- driving time;
- external web research.

Those remain on-demand capabilities.

The aggregator should issue independent source calls concurrently where safe. A failure in one non-critical subsection should not discard all successful sections. Its output includes section status metadata so the agent can distinguish `available`, `empty`, and `failed` without inventing missing facts.

### 5.1 Tool Routing

Add a thin tool:

```text
common.get_opportunity_intelligence
```

Use it for broad requests such as:

- "ringkas kondisi opportunity ini";
- "beri overview lengkap opportunity ini";
- broad internal-plus-external intelligence requests.

Fine-grained tools remain available for narrow questions:

- stock-only -> `finops.check_stock_availability`;
- invoice-only -> `finops.get_invoices`;
- MSDS-only -> `sharepoint.get_msds`;
- route-only -> `common.get_route_estimate`;
- etc.

Adding a new future tool therefore remains independent. It is added to the appropriate tool registry and prompt capability map. It is added to the broad aggregator only if the information should normally be part of a general opportunity summary.

## 6. Conversation API Simplification

### 6.1 Public Request Contract

The client-facing chat request becomes:

```json
{
  "message": "kalau stok yang kurang tadi kapan bisa dikirim?",
  "modelMode": "local",
  "conversationId": "optional-existing-conversation-id",
  "context": {
    "opportunityId": "active-opportunity-guid"
  }
}
```

The client no longer sends `threadId` or `resourceId`.

### 6.2 Server Mapping

- `conversationId` maps internally to Mastra `threadId`.
- authenticated `req.user.userId` maps internally to Mastra `resourceId`.
- if `conversationId` is missing, the server generates a UUID for a new conversation.
- the response always returns the effective `conversationId`.

This preserves multi-turn continuity while preventing the client from selecting another user's memory resource scope.

### 6.3 Opportunity Context

`opportunityId` remains live request context, not conversational source-of-truth memory.

Follow-up chat may use language such as "stok yang kurang tadi", but current stock, SO, delivery, and invoice facts must still be retrieved from authoritative tools when current enterprise data is required.

The runtime must not duplicate the full application context into the textual prompt when the same structured identity is already available through `RequestContext`.

### 6.4 Development UI

The `/dev` comparison UI maintains separate Local and Cloud `conversationId` values because Local and Cloud responses should not contaminate each other's memory histories.

A "New Conversation" action resets both conversation IDs while retaining the selected opportunity unless the user clears it.

## 7. Memory and Token Budget

### 7.1 Memory Window

Change the default recent-message memory window from 20 to 8 messages.

Keep the value environment-configurable:

```text
MASTRA_MEMORY_LAST_MESSAGES=8
```

Observational memory remains disabled by default.

### 7.2 Prompt Compaction

Replace the current long Sales instructions with a smaller capability-oriented prompt containing each rule only once:

1. internal source authority;
2. capability-to-tool mapping;
3. web intelligence classification rules;
4. missing-data rules;
5. response-grounding and output rules.

Repeated per-domain wording should be removed when a single general rule is sufficient.

### 7.3 Context Compaction

Do not insert pretty-printed full application context JSON into every model request.

The runtime provides only the minimal model-visible context required for reasoning, while authoritative IDs remain in `RequestContext`.

### 7.4 Local Runtime Limits

Centralize agent runtime limits in configuration instead of hard-coding them in `agent.runner.ts`.

Initial defaults after refactor:

```text
LOCAL_AGENT_MAX_STEPS=12
LOCAL_AGENT_MAX_OUTPUT_TOKENS=6000
CLOUD_AGENT_MAX_STEPS=12
AGENT_MAX_OUTPUT_TOKENS=6000
```

These are safety ceilings, not expected normal behavior. Broad internal opportunity requests should normally require the compact internal intelligence tool rather than many serial internal tool rounds.

### 7.5 Tool Result Compaction

Tools return only fields useful to the model. Large raw integration payloads must stay inside services and not be surfaced as tool results.

For broad intelligence specifically, the aggregator returns summaries rather than concatenating all raw underlying responses.

## 8. SearXNG Result Compaction

Preserve SearXNG for Local web research, but clean the evidence before returning it to the model.

The SearXNG service should:

- normalize whitespace;
- remove results without usable URLs;
- deduplicate identical URLs;
- deduplicate obvious duplicate results with the same normalized URL/title;
- cap snippet length to 700 characters per result;
- preserve title, URL, compact snippet, and engine;
- preserve the configured result limit, initially 5.

The agent remains allowed to perform multiple targeted searches when competitor, stakeholder, and customer/industry research are all requested. The goal is not to artificially force one search, but to reduce noisy payload and repetitive context.

## 9. Standardized Logging

Create shared structured logging helpers rather than custom log shapes in individual tools.

### 9.1 HTTP Event

```text
event=HTTP_REQUEST
phase=start|complete
requestId
method
path
statusCode?
durationMs?
```

### 9.2 Tool Event

```text
event=AI_TOOL
requestId?
agentId?
modelMode?
tool
source
status=success|error
durationMs
resultCount?
errorCode?
```

### 9.3 Agent Event

```text
event=AI_RUN
requestId
agentId
modelMode
conversationId
status
steps
durationMs
inputTokens
outputTokens
totalTokens
cachedInputTokens
reasoningTokens
toolCount
toolsUsed
synthesisUsed
```

Business payloads, secrets, bearer tokens, raw OData responses, and large tool results must not be logged.

Tool files should use one helper such as `runLoggedTool()` rather than implementing timing and log formatting independently.

## 10. Runtime Decomposition

Split the oversized runtime responsibilities into focused modules.

Target modules:

```text
src/mastra/runtime/
  agent.runner.ts             # high-level execution only
  conversation.ts             # conversationId/thread/resource mapping
  request-context.ts          # RequestContext construction
  tool-tracker.ts             # normalized tool tracking
  tool-results.ts             # Local synthesis result extraction/compaction
  agent-metrics.ts            # token/step/duration metrics
```

Existing opportunity-specific context validation remains reusable but should be renamed only if necessary for clarity; avoid gratuitous renaming.

The Local synthesis fallback remains available, but its prompt uses current tool IDs and compact labeled results. It runs only when the first pass ended without a usable final answer.

## 11. Shared Tool Execution Helpers

Introduce a reusable helper for opportunity-scoped tools, conceptually:

```ts
runOpportunityTool({
  context,
  tool,
  source,
  execute,
  countResult,
})
```

Responsibilities:

- read and validate the opportunity ID from `RequestContext`;
- time execution;
- standardize successful and failed tool logs;
- return the service result unchanged.

A generic `runLoggedOperation()` can be used by non-opportunity tools such as web search and current time.

Do not move CRM-, FinOps-, SharePoint-, or routing-specific logic into these helpers.

## 12. Prompt Design

The Sales prompt should be substantially shorter and organized around capabilities rather than lengthy repeated procedural sections.

Core behavior:

- internal business facts must come from CRM / FinOps / SharePoint tools;
- broad opportunity summary -> `getOpportunityIntelligence`;
- narrow request -> relevant fine-grained tool;
- route/location tools only when explicitly relevant;
- public research -> runtime web-search capability;
- public stakeholder names are candidates, not confirmed opportunity decision makers;
- similar-market companies are market candidates unless actual involvement is supported;
- tool-not-called, tool-failed, and empty-result remain distinct states;
- never invent enterprise facts, names, IDs, URLs, or relationships;
- use the user's language.

The prompt should not duplicate schemas already expressed in tool descriptions.

## 13. Tool Descriptions

Tool descriptions should be concise enough to reduce context while still telling the model:

- when to use the tool;
- what authoritative source it represents;
- the most important restriction.

Avoid long descriptions that restate implementation details such as workflow internals.

Example target description:

```text
Check current stock readiness for all products in the active opportunity using FinOps. Item mapping is resolved deterministically; unresolved items are reported, not guessed.
```

## 14. Public Comparison UI

Keep the Local-vs-Cloud side-by-side comparison capability.

Enhance metrics shown in the comparison panel using backend metrics rather than browser timing alone:

- backend response duration;
- steps;
- input tokens;
- output tokens;
- total tokens;
- cached input tokens;
- tool count;
- source coverage;
- web-search used/not used.

Browser wall-clock duration may remain as a secondary client-side value.

Conversation IDs remain invisible by default but can be shown in a debug detail area if needed.

## 15. Source and Tool Extensibility

The refactor must make a new tool easy to add without changing the central agent runner.

A new tool should normally require only:

1. source service function;
2. tool wrapper + schema;
3. registration in the correct tool group;
4. one capability rule in the prompt when model selection is not obvious;
5. tests.

The new capability is added to `getOpportunityIntelligence` only when it belongs in a normal broad opportunity summary.

## 16. Error Handling

All external-service errors are normalized to application errors at the service boundary.

For broad opportunity intelligence:

- a failing subsection is represented as `failed` with a safe short reason;
- successful sections remain available;
- the tool does not replace failed data with guessed values.

For individual tools:

- integration failure remains distinguishable from successful empty data;
- errors are logged with safe codes/metadata, not credentials or full remote payloads.

## 17. Files Removed

The implementation is expected to remove:

```text
src/mastra/workflows/delivery-context.workflow.ts
src/mastra/workflows/msds.workflow.ts
src/mastra/workflows/resolve-opportunity-items.workflow.ts
src/mastra/workflows/route-estimate.workflow.ts
src/mastra/workflows/stock-availability.workflow.ts
src/mastra/runtime/workflow-runner.ts
```

Mastra root workflow registration is removed accordingly.

## 18. Files Added or Reorganized

Expected focused additions include:

```text
src/services/opportunity/opportunity-intelligence.service.ts
src/mastra/tools/common/get-opportunity-intelligence.tool.ts
src/mastra/runtime/conversation.ts
src/mastra/runtime/request-context.ts
src/mastra/runtime/tool-results.ts
src/mastra/runtime/agent-metrics.ts
src/logging/operation-logger.ts
src/utils/text.util.ts
src/utils/result.util.ts
```

Exact file names may be adjusted during implementation only to match existing conventions, but the responsibility boundaries in this specification must remain intact.

## 19. Compatibility

Preserve:

- `POST /api/agents/:agentId/chat`;
- `modelMode: local | cloud`;
- current authentication;
- active `context.opportunityId` behavior;
- current Local SearXNG and Cloud OpenAI web-search split;
- PostgreSQL-backed Mastra memory when `DATABASE_URL` is configured;
- Mastra Studio agents and global tools;
- fine-grained tool behavior and source-of-truth rules;
- Local-vs-Cloud development comparison page.

The request may temporarily accept legacy `threadId` during migration only if needed for compatibility, but the documented/public contract becomes `conversationId` and response output should not encourage continued client use of `threadId` or `resourceId`.

## 20. Testing Strategy

Implementation must use test-first changes for behavior modifications.

Required test groups:

1. direct-service replacements for each removed workflow preserve current outputs;
2. opportunity intelligence returns compact successful sections and preserves partial failures;
3. opportunity intelligence does not calculate route by default;
4. conversation ID is created when absent and reused when provided;
5. resource scope always comes from the authenticated user rather than client request body;
6. memory options are attached only when durable memory is available and conversation identity is valid;
7. SearXNG duplicate filtering and snippet truncation;
8. standardized tool logging success and failure;
9. Local synthesis receives compact labeled results and current tool authority names;
10. broad Sales prompt selects opportunity intelligence while narrow prompts still retain fine-grained capabilities;
11. `/dev` keeps independent Local and Cloud conversation IDs;
12. TypeScript typecheck and complete Vitest suite remain green.

## 21. Benchmark Acceptance Criteria

Use the existing broad internal-plus-external intelligence prompt against opportunity `OP00112711` as the regression benchmark.

Correctness requirements:

- internal opportunity facts remain consistent with current authoritative results;
- stock remains 7 products, 1 sufficient, 6 shortage, 0 unresolved for the existing fixture/current data if source data has not changed;
- route is **not** called merely because broad delivery readiness is requested;
- Local web research remains SearXNG;
- Cloud web research remains provider-native web search;
- public stakeholder/competitor claims retain uncertainty classification;
- no fabricated business values or public identities.

Performance goals are directional rather than hard pass/fail because model and external-service latency vary:

- materially fewer Local steps than the 14-step baseline;
- materially fewer Local input tokens than the 102,107-input-token baseline;
- Cloud token count should not increase from the refactor;
- broad internal data should normally be obtained in one compact internal tool call;
- conversation follow-ups should not require the client to resend earlier user/assistant messages.

## 22. Non-Goals

This refactor does not:

- replace PostgreSQL with a custom chat-table implementation;
- replace Mastra Memory;
- replace Ollama or OpenAI models;
- replace SearXNG with another Local search engine;
- create a deterministic intent router outside the LLM;
- create a full workflow builder;
- add write/update actions to CRM or FinOps;
- alter business source-of-truth ownership.

## 23. Migration Outcome

After the refactor, the normal broad request path becomes:

```text
Client
  -> POST /api/agents/sales/chat
  -> conversationId resolved
  -> Sales Agent
  -> common.get_opportunity_intelligence
  -> compact internal snapshot
  -> optional Local/Cloud web research
  -> final grounded answer
  -> response + conversationId + compact metrics
```

A narrow request remains simple:

```text
"berapa invoice-nya?"
  -> finops.get_invoices
```

A route request remains explicit:

```text
"berapa estimasi jarak dan waktu kirim?"
  -> common.get_route_estimate
```

This keeps the backend smaller, extensible, multi-turn capable, and less token-heavy without sacrificing authoritative source separation.
