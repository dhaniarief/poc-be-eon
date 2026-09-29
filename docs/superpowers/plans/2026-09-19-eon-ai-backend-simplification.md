# EON AI Backend Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the EON AI backend so broad opportunity requests use one compact internal intelligence capability, multi-turn API chat uses a server-managed `conversationId`, thin Mastra workflows are removed, repeated runtime/tool code is centralized, logs are uniform, and Local/Cloud token use is materially lower without losing source-of-truth behavior.

**Architecture:** Keep Mastra agents and fine-grained tools, but make tools thin wrappers over reusable services. Broad opportunity summaries use `common.get_opportunity_intelligence`, which composes internal CRM/FinOps/SharePoint services with shared intermediate results and partial-failure handling. Conversation identity, request context, tool execution logging, tool result extraction, metrics, and prompt construction become focused runtime modules rather than one large runner.

**Tech Stack:** Node.js 22+, TypeScript ESM, Express 5, Mastra 1.67 core / Mastra 1.30 CLI, Vitest 5, Zod 4, PostgreSQL-backed Mastra Memory, OpenAI cloud model, Ollama local model, SearXNG, Dynamics 365 CRM/Finance OData, Microsoft Graph/SharePoint, OSRM.

**Spec:** `docs/superpowers/specs/2026-09-19-eon-ai-backend-simplification-design.md`

## Global Constraints

- Preserve `POST /api/agents/:agentId/chat`.
- Preserve `modelMode: local | cloud`.
- Preserve authentication and `context.opportunityId` behavior.
- Preserve Local SearXNG and Cloud OpenAI native web-search split.
- Preserve PostgreSQL-backed Mastra Memory when `DATABASE_URL` exists.
- Preserve fine-grained tools for narrow questions and future extensibility.
- Remove the five current low-level Mastra workflows and `runtime/workflow-runner.ts`.
- Route/geocoding must not run as part of a normal broad opportunity summary.
- Default `MASTRA_MEMORY_LAST_MESSAGES=8`.
- Default `LOCAL_AGENT_MAX_STEPS=12`, `CLOUD_AGENT_MAX_STEPS=12`, `AGENT_MAX_OUTPUT_TOKENS=6000`.
- SearXNG keeps the configured result limit, initially 5, but snippets are capped at 700 characters and duplicate results are removed.
- Broad internal intelligence must distinguish `available`, `empty`, and `failed` sections instead of inventing missing data.
- Do not log credentials, bearer tokens, raw OData payloads, or large tool results.
- New business agents must be added through `agent.registry.ts`; `agent.runner.ts` and `mastra/index.ts` must not gain agent-specific branches.
- Keep `workflow.registry.ts` as the single extension point for future real workflows even though the five current wrapper workflows are removed.
- Opportunity-bound tools must use the shared Mastra `requestContextSchema`.
- Potentially large tool results must define `toModelOutput` so the model receives a compact projection while application code retains the structured result.
- Generic model/tool latency, token, step, and trace data comes from Mastra observability; custom EON logs add business metadata instead of duplicating full lifecycle telemetry.
- Tool descriptions own capability-selection guidance; Sales instructions must not duplicate a long per-tool manual.

## Review Focus

1. A client supplies another user's `resourceId`: the backend must ignore it and derive memory resource scope only from authenticated `req.user.userId`.
2. One internal source fails during broad opportunity intelligence: successful sections must remain available and only the failing section becomes `failed`.
3. A broad summary mentions delivery readiness but not route/distance: `common.get_route_estimate` and geocoding must not execute.
4. Local web results contain duplicate URLs and long snippets: results must be deduplicated and each snippet must be at most 700 characters.
5. A Local first pass ends with tool calls or length limit: synthesis must receive compact labeled results with current tool authority names and must not receive duplicated pretty-printed application context.

---

## Target File Map

### Add

- `src/mastra/runtime/conversation.ts` - public `conversationId` validation/generation and memory identity mapping.
- `src/mastra/runtime/request-context.ts` - builds Mastra `RequestContext` once with opportunity and request metadata.
- `src/mastra/runtime/tool-results.ts` - extracts and labels tool results for Local synthesis.
- `src/mastra/runtime/agent-metrics.ts` - builds uniform AI run metrics.
- `src/mastra/runtime/prompt-builder.ts` - builds minimal model-visible request prompt.
- `src/mastra/runtime/tool-execution.ts` - reusable opportunity-tool/service execution helper without duplicating generic Mastra telemetry.
- `src/mastra/runtime/tool-hooks.ts` - shared agent-level Mastra tool hooks for normalized business metadata.
- `src/mastra/workflows/workflow.registry.ts` - single registry for future real workflows; empty after thin-workflow cleanup.
- `src/logging/operation-logger.ts` - uniform HTTP/tool/agent event writers.
- `src/services/microsoft/dynamics-crm/opportunity.service.ts` - reusable CRM opportunity overview/products/activities/stage service functions.
- `src/services/opportunity/opportunity-intelligence.service.ts` - compact broad internal snapshot with partial failures.
- `src/mastra/schemas/opportunity-intelligence.schema.ts` - Zod schema for compact broad snapshot.
- `src/mastra/tools/common/get-opportunity-intelligence.tool.ts` - thin broad-summary tool.
- `src/utils/result.util.ts` - reusable section/result status helpers.
- `tests/mastra/runtime/conversation.test.ts`
- `tests/mastra/runtime/tool-execution.test.ts`
- `tests/mastra/runtime/prompt-builder.test.ts`
- `tests/services/opportunity/opportunity-intelligence.service.test.ts`
- `tests/services/web/searxng.service.test.ts`
- `tests/controllers/agent.controller.test.ts`

### Modify

- `.env.example`
- `src/config/env.ts`
- `src/controllers/agent.controller.ts`
- `src/middleware/request-logger.middleware.ts`
- `src/mastra/memory.ts`
- `src/mastra/index.ts`
- `src/mastra/agents/sales.agent.ts`
- `src/mastra/agents/general.agent.ts`
- `src/mastra/agents/local-synthesis.agent.ts`
- `src/mastra/prompts/sales.instructions.ts`
- `src/mastra/runtime/agent.runner.ts`
- `src/mastra/runtime/opportunity-context.ts`
- `src/mastra/runtime/tool-tracker.ts`
- `src/mastra/tools/tool.registry.ts`
- the existing CRM, FinOps, SharePoint, Common and Web tool wrappers
- `src/services/microsoft/dynamics-finops/delivery.service.ts`
- `src/services/microsoft/dynamics-finops/invoice.service.ts`
- `src/services/web/searxng.service.ts`
- `public/dev/index.html`

### Delete

- `src/mastra/workflows/delivery-context.workflow.ts`
- `src/mastra/workflows/msds.workflow.ts`
- `src/mastra/workflows/resolve-opportunity-items.workflow.ts`
- `src/mastra/workflows/route-estimate.workflow.ts`
- `src/mastra/workflows/stock-availability.workflow.ts`
- `src/mastra/runtime/workflow-runner.ts`
- `tests/mastra/workflow-runner.test.ts`

---

### Task 1: Simplify conversation identity and memory contract

**Files:**
- Create: `src/mastra/runtime/conversation.ts`
- Create: `src/mastra/runtime/request-context.ts`
- Modify: `src/mastra/runtime/opportunity-context.ts`
- Modify: `src/controllers/agent.controller.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `src/mastra/memory.ts`
- Test: `tests/mastra/runtime/conversation.test.ts`
- Test: `tests/controllers/agent.controller.test.ts`

**Interfaces:**
- Consumes: authenticated `userId`, optional client `conversationId`, optional legacy `threadId`, active `context.opportunityId`, request metadata.
- Produces: `resolveConversationIdentity()`, `buildAgentRequestContext()`, controller response field `conversationId`, memory options using `thread=conversationId` and `resource=userId`.

- [ ] **Step 1: Write failing conversation identity tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveConversationIdentity } from "../../../src/mastra/runtime/conversation.js";

describe("resolveConversationIdentity", () => {
  it("creates a conversation id when none is supplied", () => {
    const result = resolveConversationIdentity({ userId: "user-1" });
    expect(result.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.threadId).toBe(result.conversationId);
    expect(result.resourceId).toBe("user-1");
  });

  it("reuses an existing conversation id", () => {
    const result = resolveConversationIdentity({
      userId: "user-1",
      conversationId: "conv-sales-001",
    });
    expect(result).toEqual({
      conversationId: "conv-sales-001",
      threadId: "conv-sales-001",
      resourceId: "user-1",
    });
  });

  it("uses legacy threadId only as a migration fallback", () => {
    const result = resolveConversationIdentity({
      userId: "user-1",
      legacyThreadId: "legacy-thread",
    });
    expect(result.conversationId).toBe("legacy-thread");
    expect(result.resourceId).toBe("user-1");
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npx vitest run tests/mastra/runtime/conversation.test.ts
```

Expected: FAIL because `conversation.ts` does not exist.

- [ ] **Step 3: Implement conversation identity**

```ts
// src/mastra/runtime/conversation.ts
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../errors/app.error.js";

const conversationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export type ConversationIdentity = {
  conversationId: string;
  threadId: string;
  resourceId: string;
};

export function resolveConversationIdentity(input: {
  userId?: string;
  conversationId?: string;
  legacyThreadId?: string;
}): ConversationIdentity {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new AppError("Authenticated user is required", 401, "UNAUTHORIZED");
  }

  const requested = input.conversationId ?? input.legacyThreadId;
  let conversationId = randomUUID();
  if (requested) {
    const parsed = conversationIdSchema.safeParse(requested);
    if (!parsed.success) {
      throw new AppError("Invalid conversationId", 400, "VALIDATION_ERROR");
    }
    conversationId = parsed.data;
  }

  return {
    conversationId,
    threadId: conversationId,
    resourceId: userId,
  };
}
```

- [ ] **Step 4: Expand request context metadata and centralize construction**

```ts
// src/mastra/runtime/opportunity-context.ts
import { z } from "zod";

export const opportunityRequestContextSchema = z.object({
  opportunityId: z.string().uuid(),
  requestId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  modelMode: z.enum(["local", "cloud"]).optional(),
  conversationId: z.string().min(1).optional(),
});

export function requireOpportunityId(context: unknown): string {
  const toolContext = context as
    | { requestContext?: { get?: (key: string) => unknown } }
    | undefined;
  const parsed = z
    .string()
    .uuid()
    .safeParse(toolContext?.requestContext?.get?.("opportunityId"));
  if (!parsed.success) {
    throw new Error("Valid opportunityId is missing from RequestContext.");
  }
  return parsed.data;
}
```

```ts
// src/mastra/runtime/request-context.ts
import { RequestContext } from "@mastra/core/request-context";
import type { ModelMode } from "../../config/models/model.types.js";

export type EonRequestContext = {
  opportunityId?: string;
  requestId?: string;
  agentId?: string;
  modelMode?: ModelMode;
  conversationId?: string;
};

export function buildAgentRequestContext(input: {
  opportunityId?: string;
  requestId?: string;
  agentId: string;
  modelMode: ModelMode;
  conversationId: string;
}) {
  const requestContext = new RequestContext<EonRequestContext>();
  if (input.opportunityId?.trim()) {
    requestContext.set("opportunityId", input.opportunityId.trim());
  }
  if (input.requestId) requestContext.set("requestId", input.requestId);
  requestContext.set("agentId", input.agentId);
  requestContext.set("modelMode", input.modelMode);
  requestContext.set("conversationId", input.conversationId);
  return requestContext;
}
```

- [ ] **Step 5: Change memory defaults and runtime limits in env**

Add to `src/config/env.ts`:

```ts
MASTRA_MEMORY_LAST_MESSAGES: z.coerce.number().int().min(1).max(40).default(8),
LOCAL_AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(30).default(12),
CLOUD_AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(30).default(12),
AGENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16000).default(6000),
SEARXNG_SNIPPET_MAX_CHARS: z.coerce.number().int().min(100).max(2000).default(700),
```

Update `.env.example` with:

```text
MASTRA_MEMORY_LAST_MESSAGES=8
LOCAL_AGENT_MAX_STEPS=12
CLOUD_AGENT_MAX_STEPS=12
AGENT_MAX_OUTPUT_TOKENS=6000
SEARXNG_SNIPPET_MAX_CHARS=700
```

- [ ] **Step 6: Write failing controller test proving client resourceId is ignored**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const runAgent = vi.fn();
vi.mock("../../src/mastra/runtime/agent.runner.js", () => ({ runAgent }));

import { chatAgent } from "../../src/controllers/agent.controller.js";

describe("chatAgent", () => {
  beforeEach(() => runAgent.mockReset());

  it("derives resource scope from authenticated user and returns conversationId", async () => {
    runAgent.mockResolvedValue({
      text: "ok",
      toolsUsed: [],
      metrics: {},
      conversationId: "conv-1",
    });

    const req = {
      params: { agentId: "sales" },
      body: {
        message: "hello",
        modelMode: "local",
        conversationId: "conv-1",
        resourceId: "attacker-user",
        context: { opportunityId: "59cf2a22-6281-4465-9232-8ebeab009e5e" },
      },
      user: { userId: "real-user" },
      requestId: "req-1",
    } as any;

    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as any;

    await chatAgent(req, res);

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        resourceId: "real-user",
      }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
    );
  });
});
```

- [ ] **Step 7: Update controller public contract**

Controller body handling becomes conceptually:

```ts
const {
  message,
  modelMode,
  context,
  conversationId,
  threadId: legacyThreadId,
} = req.body;

const conversation = resolveConversationIdentity({
  userId: req.user?.userId,
  conversationId,
  legacyThreadId,
});

const result = await runAgent({
  agentId,
  modelMode,
  message,
  context,
  conversationId: conversation.conversationId,
  threadId: conversation.threadId,
  resourceId: conversation.resourceId,
  requestId: req.requestId,
});

res.status(200).json({
  answer: result.text,
  agentId,
  modelMode,
  opportunityId: context?.opportunityId,
  requestId: req.requestId,
  conversationId: conversation.conversationId,
  toolsUsed: result.toolsUsed,
  metrics: result.metrics,
});
```

Do not return `resourceId` or encourage client use of `threadId`.

- [ ] **Step 8: Run targeted tests and typecheck**

```bash
npx vitest run tests/mastra/runtime/conversation.test.ts tests/controllers/agent.controller.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add .env.example src/config/env.ts src/controllers/agent.controller.ts src/mastra/memory.ts src/mastra/runtime/conversation.ts src/mastra/runtime/request-context.ts src/mastra/runtime/opportunity-context.ts tests/mastra/runtime/conversation.test.ts tests/controllers/agent.controller.test.ts
git commit -m "refactor: simplify conversation memory contract"
```

---


### Task 2: Establish Mastra-native registries, request context, compact tool output, and hooks

**Files:**
- Modify: `src/mastra/agents/agent.registry.ts`
- Modify: `src/mastra/index.ts`
- Create: `src/mastra/workflows/workflow.registry.ts`
- Create: `src/mastra/runtime/tool-hooks.ts`
- Modify: `src/mastra/runtime/opportunity-context.ts`
- Modify: representative opportunity-bound tools first, then apply the same pattern to all remaining opportunity-bound tools
- Test: `tests/mastra/runtime/tool-contracts.test.ts`

**Interfaces:**
- Consumes: Local/Cloud agent instances, Mastra `requestContextSchema`, existing tool raw outputs, Mastra observability.
- Produces: `registeredAgents`, `registeredWorkflows`, shared `eonRequestContextSchema`, reusable tool hooks, and compact `toModelOutput` projections.

- [ ] **Step 1: Write failing registry and tool-contract tests**

The tests must prove:

```ts
expect(getAgentKey("sales", "local")).toBe("salesLocal");
expect(getAgentKey("general", "cloud")).toBe("generalCloud");
expect(Object.keys(registeredWorkflows)).toEqual([]);
```

For one opportunity-bound tool, assert the tool exposes the shared request-context contract and that its model-facing output omits raw/noisy fields while preserving the raw structured result returned by `execute`.

Run:

```bash
npx vitest run tests/mastra/runtime/tool-contracts.test.ts
```

Expected: RED because the registry/output contract is not centralized yet.

- [ ] **Step 2: Make the agent registry the only agent-registration extension point**

`agent.registry.ts` imports all registered agents and exports both the registry object and key resolver:

```ts
export const registeredAgents = {
  generalLocal: generalLocalAgent,
  generalCloud: generalCloudAgent,
  salesLocal: salesLocalAgent,
  salesCloud: salesCloudAgent,
  localSynthesis: localSynthesisAgent,
} as const;

export type RegisteredAgentKey = keyof typeof registeredAgents;
```

`mastra/index.ts` must use:

```ts
agents: registeredAgents,
```

and must not import individual business agents.

- [ ] **Step 3: Add an explicit future-workflow registry**

Create:

```ts
export const registeredWorkflows = {};
```

After removal of the current wrapper workflows, `mastra/index.ts` consumes this registry. Future real workflows are added only to this file; no workflow-specific imports belong in `mastra/index.ts`.

- [ ] **Step 4: Use one shared Mastra request-context schema**

Export the Zod schema from `opportunity-context.ts` and attach it to the Sales Agent and every opportunity-bound tool with `requestContextSchema`. The schema contains the active `opportunityId` plus optional `requestId`, `agentId`, `modelMode`, and `conversationId` metadata.

Tools continue reading the active opportunity from `context.requestContext`; the model never supplies or rewrites that identifier.

- [ ] **Step 5: Add `toModelOutput` to large-result tools**

Start with stock and the new broad opportunity-intelligence tool, then apply the same pattern to MSDS, SO, delivery, invoice, and Local web search.

Example stock projection:

```ts
toModelOutput: (output) => ({
  type: "text",
  value: JSON.stringify({
    warehouse: output.warehouse,
    summary: output.summary,
    items: output.items.map((item) => ({
      productName: item.productName,
      itemNumber: item.itemNumber,
      requiredQuantity: item.requiredQuantity,
      availableQuantity: item.availableQuantity,
      status: item.status,
    })),
  }),
}),
```

Do not remove fields from the raw `execute` result solely to reduce model tokens; compact the model-facing representation instead.

- [ ] **Step 6: Add shared Mastra tool hooks for cross-cutting business metadata**

Create `tool-hooks.ts` with agent-level `beforeToolCall` / `afterToolCall` handlers supported by the installed Mastra version. The hooks may attach normalized metadata or emit concise business log events, but must not log raw tool arguments/results.

Mastra observability remains responsible for generic trace hierarchy, latency, token, step, and tool-call telemetry. Do not reproduce all of that in each individual tool.

- [ ] **Step 7: Verify typecheck and Studio discovery**

```bash
npm run typecheck
npm test
```

Expected: PASS. Studio still lists all agents and tools, and future workflow registration has one clear registry file.

- [ ] **Step 8: Commit**

```bash
git add src/mastra/agents/agent.registry.ts src/mastra/index.ts src/mastra/workflows/workflow.registry.ts src/mastra/runtime/tool-hooks.ts src/mastra/runtime/opportunity-context.ts src/mastra/tools tests/mastra/runtime/tool-contracts.test.ts
git commit -m "refactor: establish mastra native extension contracts"
```

---

### Task 3: Standardize HTTP and business logging without duplicating Mastra observability

**Files:**
- Create: `src/logging/operation-logger.ts`
- Create: `src/mastra/runtime/tool-execution.ts`
- Modify: `src/middleware/request-logger.middleware.ts`
- Test: `tests/mastra/runtime/tool-execution.test.ts`

**Interfaces:**
- `runOpportunityTool<T>()` only resolves the active `opportunityId` from validated `RequestContext` and invokes the service.
- `operation-logger.ts` writes concise standardized EON business events.
- Agent-level Mastra hooks from Task 2 emit the same `AI_TOOL` event shape for every tool call; individual tool files do not duplicate start/complete logging.
- Mastra observability remains canonical for trace hierarchy, model/tool latency, token usage, agent steps, and generic execution errors.

- [ ] **Step 1: Write the failing opportunity-tool helper test**

```ts
import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import { runOpportunityTool } from "../../../src/mastra/runtime/tool-execution.js";

describe("runOpportunityTool", () => {
  it("reads opportunityId from RequestContext and passes it to the service", async () => {
    const requestContext = new RequestContext<any>();
    requestContext.set("opportunityId", "59cf2a22-6281-4465-9232-8ebeab009e5e");
    const execute = vi.fn(async (id: string) => ({ id }));

    const result = await runOpportunityTool({
      context: { requestContext },
      execute,
    });

    expect(execute).toHaveBeenCalledWith("59cf2a22-6281-4465-9232-8ebeab009e5e");
    expect(result.id).toBe("59cf2a22-6281-4465-9232-8ebeab009e5e");
  });
});
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/mastra/runtime/tool-execution.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the minimal opportunity execution helper**

```ts
import { requireOpportunityId } from "./opportunity-context.js";

type ToolContext = {
  requestContext?: { get?: (key: string) => unknown };
};

export async function runOpportunityTool<T>(input: {
  context: ToolContext;
  execute: (opportunityId: string) => Promise<T>;
}): Promise<T> {
  return input.execute(requireOpportunityId(input.context));
}
```

Do not add generic tool timing/logger code here; Task 2 hooks provide one cross-cutting tool lifecycle path.

- [ ] **Step 4: Add one standardized EON event writer**

`src/logging/operation-logger.ts`:

```ts
import { logger } from "./logger.js";

export function writeBusinessEvent(
  level: "info" | "warn" | "error",
  event: string,
  payload: Record<string, unknown>,
) {
  logger[level]({ event, ...payload }, event);
}
```

Use this writer from HTTP middleware and shared hooks only. Do not log raw tool inputs/results, OData payloads, tokens, credentials, or complete prompts.

- [ ] **Step 5: Standardize HTTP request logs**

Emit only two shapes:

```ts
writeBusinessEvent("info", "HTTP_REQUEST", {
  phase: "start",
  requestId: req.requestId,
  method: req.method,
  path: req.originalUrl,
});
```

and:

```ts
writeBusinessEvent("info", "HTTP_REQUEST", {
  phase: "complete",
  requestId: req.requestId,
  method: req.method,
  path: req.originalUrl,
  statusCode: res.statusCode,
  durationMs: Date.now() - startedAt,
});
```

- [ ] **Step 6: Verify targeted tests and typecheck**

```bash
npx vitest run tests/mastra/runtime/tool-execution.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/logging/operation-logger.ts src/mastra/runtime/tool-execution.ts src/middleware/request-logger.middleware.ts tests/mastra/runtime/tool-execution.test.ts
git commit -m "refactor: standardize runtime business logging"
```

---

### Task 4: Remove thin Mastra workflows and call services directly

**Files:**
- Modify: `src/mastra/tools/finops/resolve-opportunity-items.tool.ts`
- Modify: `src/mastra/tools/finops/check-stock-availability.tool.ts`
- Modify: `src/mastra/tools/sharepoint/get-msds.tool.ts`
- Modify: `src/mastra/tools/common/get-delivery-context.tool.ts`
- Modify: `src/mastra/tools/common/get-route-estimate.tool.ts`
- Modify: `src/mastra/tools/finops/get-sales-orders.tool.ts`
- Modify: `src/mastra/tools/finops/get-delivery-status.tool.ts`
- Modify: `src/mastra/tools/finops/get-invoices.tool.ts`
- Modify: `src/mastra/index.ts`
- Delete: all five `src/mastra/workflows/*.workflow.ts`
- Delete: `src/mastra/runtime/workflow-runner.ts`
- Delete: `tests/mastra/workflow-runner.test.ts`

**Interfaces:**
- Consumes existing service functions such as `getResolvedOpportunityItems`, `checkOpportunityStock`, `getOpportunityMsds`, `getDeliveryContextForOpportunity`, and `getRouteEstimateForOpportunity`.
- Produces the same tool IDs and output schemas without workflow runtime dependency.

- [ ] **Step 1: Convert resolver tool to direct service execution**

Use this shape:

```ts
execute: async (_input, context) =>
  runOpportunityTool({
    context,
    execute: getResolvedOpportunityItems,
  }),
```

Keep `resolvedOpportunityItemsResultSchema` unchanged.

- [ ] **Step 2: Convert stock tool to direct service execution**

```ts
execute: async (_input, context) =>
  runOpportunityTool({
    context,
    execute: checkOpportunityStock,
  }),
```

Keep stock semantics unchanged: resolved item with no on-hand row means `available=0`, not unresolved.

- [ ] **Step 3: Convert MSDS, delivery context, and route tools**

Use direct service functions:

```ts
getOpportunityMsds
getDeliveryContextForOpportunity
getRouteEstimateForOpportunity
```

Each wrapper must use `runOpportunityTool` and retain the existing Zod output schema.

- [ ] **Step 4: Wrap existing SO/delivery/invoice tools in uniform logging**

Use the corresponding service function. Result-count logging is handled centrally by shared tool hooks when a compact count can be derived.


- [ ] **Step 5: Remove workflow registration from Mastra root**

`src/mastra/index.ts` must no longer import workflow files and must no longer pass a `workflows` property. Keep agents, global tools, storage, logger, observability, and editor registration.

- [ ] **Step 6: Delete workflow files and obsolete runner test**

Delete exactly:

```text
src/mastra/workflows/delivery-context.workflow.ts
src/mastra/workflows/msds.workflow.ts
src/mastra/workflows/resolve-opportunity-items.workflow.ts
src/mastra/workflows/route-estimate.workflow.ts
src/mastra/workflows/stock-availability.workflow.ts
src/mastra/runtime/workflow-runner.ts
tests/mastra/workflow-runner.test.ts
```

- [ ] **Step 7: Verify no workflow references remain**

Run:

```bash
grep -R "workflow-runner\|deliveryContextWorkflow\|msdsWorkflow\|resolveOpportunityItemsWorkflow\|routeEstimateWorkflow\|stockAvailabilityWorkflow" src tests || true
npm run typecheck
npm test
```

Expected: grep returns no source/test references; typecheck and tests PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/mastra tests/mastra
 git commit -m "refactor: remove thin mastra workflows"
```

---

### Task 5: Extract reusable CRM opportunity services

**Files:**
- Create: `src/services/microsoft/dynamics-crm/opportunity.service.ts`
- Modify: four CRM opportunity tool files
- Test: `tests/services/microsoft/dynamics-crm/opportunity.service.test.ts`

**Interfaces:**
- Produces `getOpportunityOverview()`, `getOpportunityProducts()`, `getOpportunityActivities()`, and `getOpportunityStage()` with exactly the same model-facing data currently returned by tools.
- Tool wrappers become schemas + `runOpportunityTool()` only.

- [ ] **Step 1: Write failing service mapping tests with injected CRM getter**

The service functions accept an optional `crmGet` dependency defaulting to `dynamicsGet`, allowing tests to verify mapping without network calls.

Example test for overview:

```ts
const fakeGet = async () => ({
  value: [{
    opportunityid: "59cf2a22-6281-4465-9232-8ebeab009e5e",
    name: "Test Opp",
    new_noopp: "OP001",
    "_customerid_value@OData.Community.Display.V1.FormattedValue": "Customer A",
    "_ownerid_value@OData.Community.Display.V1.FormattedValue": "Owner A",
    "statuscode@OData.Community.Display.V1.FormattedValue": "Won",
    "new_warehouse@OData.Community.Display.V1.FormattedValue": "PTM",
    "new_productfamily2@OData.Community.Display.V1.FormattedValue": "Oil Production Chemicals",
  }],
});

const result = await getOpportunityOverview(OPPORTUNITY_ID, fakeGet as any);
expect(result.noOpp).toBe("OP001");
expect(result.customer).toBe("Customer A");
expect(result.warehouse).toBe("PTM");
```

Add equivalent focused tests for products, activities, and stage mapping.

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/services/microsoft/dynamics-crm/opportunity.service.test.ts
```

Expected: FAIL because service module is missing.

- [ ] **Step 3: Move CRM query and mapping logic into the service**

Implement private mapping helpers first, then the exports. The helpers keep the exact current tool output shape:

```ts
function mapOpportunityOverview(row: OpportunityResponse["value"][number]) {
  return {
    opportunityId: row.opportunityid,
    opportunityName: row.name ?? "",
    noOpp: row.new_noopp ?? "",
    customer: row["_customerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    owner: row["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    status: row["statuscode@OData.Community.Display.V1.FormattedValue"] ?? "",
    warehouse: row["new_warehouse@OData.Community.Display.V1.FormattedValue"] ?? String(row.new_warehouse ?? ""),
    destination: row["_new_destinationid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    productFamily: row["new_productfamily2@OData.Community.Display.V1.FormattedValue"] ?? String(row.new_productfamily2 ?? ""),
    forecastCategory: row["msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"] ?? "",
  };
}

function mapOpportunityProduct(row: OpportunityProductResponse["value"][number]) {
  return {
    name: row.productname ?? row.opportunityproductname ?? "",
    quantity: row.quantity ?? 0,
    uom: row.new_uom ?? "",
    price: row.priceperunit ?? 0,
    amount: row.extendedamount ?? 0,
    discount: row.new_disc ?? 0,
  };
}

function mapOpportunityActivity(row: OpportunityActivityResponse["value"][number]) {
  return {
    subject: row.subject ?? "",
    owner: row["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ?? "",
    status: row["statecode@OData.Community.Display.V1.FormattedValue"] ?? "",
    startDate: row.scheduledstart ?? row.createdon ?? "",
  };
}

function mapOpportunityStage(row: OpportunityStageResponse["value"][number], opportunityId: string) {
  return {
    opportunityId: row.opportunityid ?? opportunityId,
    noOpp: row.new_noopp ?? "",
    name: row.name ?? "",
    process: {
      stepName: row.stepname ?? "",
      opportunityStage: row["new_opstages@OData.Community.Display.V1.FormattedValue"] ?? "",
      salesStage: row["salesstage@OData.Community.Display.V1.FormattedValue"] ?? "",
      salesStageCode: row["salesstagecode@OData.Community.Display.V1.FormattedValue"] ?? "",
    },
    status: {
      state: row["statecode@OData.Community.Display.V1.FormattedValue"] ?? "",
      status: row["statuscode@OData.Community.Display.V1.FormattedValue"] ?? "",
      forecastCategory: row["msdyn_forecastcategory@OData.Community.Display.V1.FormattedValue"] ?? "",
    },
    orderReadiness: {
      purchaseOrder: row["new_purchasedorder@OData.Community.Display.V1.FormattedValue"] ?? (row.new_purchasedorder === true ? "Yes" : row.new_purchasedorder === false ? "No" : ""),
      salesCoordinatorVerified: row["new_soscverified@OData.Community.Display.V1.FormattedValue"] ?? "",
      adminVerified: row["new_soadminverified@OData.Community.Display.V1.FormattedValue"] ?? "",
      ppicStatus: row["new_ppicstatus@OData.Community.Display.V1.FormattedValue"] ?? "",
      ppicNote: row.new_ppicnote ?? "",
    },
  };
}
```

Implement these exact exports:

```ts
export async function getOpportunityOverview(
  opportunityId: string,
  crmGet = dynamicsGet,
) {
  const data = await crmGet<OpportunityResponse>(
    `/api/data/v9.2/opportunities?$select=${[
      "opportunityid", "name", "new_noopp", "new_warehouse",
      "new_productfamily2", "msdyn_forecastcategory", "statuscode",
      "_customerid_value", "_ownerid_value", "_new_destinationid_value",
    ].join(",")}&$filter=opportunityid eq ${opportunityId}`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Opportunity ${opportunityId} not found`);
  return mapOpportunityOverview(row);
}

export async function getOpportunityProducts(
  opportunityId: string,
  crmGet = dynamicsGet,
) {
  const data = await crmGet<OpportunityProductResponse>(
    `/api/data/v9.2/opportunityproducts?$select=${[
      "opportunityproductid", "opportunityproductname", "productname",
      "new_uom", "quantity", "priceperunit", "extendedamount", "new_disc",
    ].join(",")}&$filter=_opportunityid_value eq ${opportunityId}`,
  );
  return { products: data.value.map(mapOpportunityProduct) };
}

export async function getOpportunityActivities(
  opportunityId: string,
  crmGet = dynamicsGet,
) {
  const data = await crmGet<OpportunityActivityResponse>(
    `/api/data/v9.2/activitypointers?$select=${[
      "activityid", "subject", "description", "activitytypecode", "createdon",
      "scheduledstart", "scheduledend", "statecode", "_ownerid_value",
    ].join(",")}&$filter=_regardingobjectid_value eq ${opportunityId}&$orderby=createdon desc&$top=10`,
  );
  return { activities: data.value.map(mapOpportunityActivity) };
}

export async function getOpportunityStage(
  opportunityId: string,
  crmGet = dynamicsGet,
) {
  const data = await crmGet<OpportunityStageResponse>(
    `/api/data/v9.2/opportunities?$select=${[
      "opportunityid", "new_noopp", "name", "stepname", "new_opstages",
      "salesstage", "salesstagecode", "statecode", "statuscode",
      "msdyn_forecastcategory", "new_soscverified", "new_soadminverified",
      "new_purchasedorder", "new_ppicstatus", "new_ppicnote",
    ].join(",")}&$filter=opportunityid eq ${opportunityId}`,
  );
  const row = data.value[0];
  if (!row) throw new Error(`Opportunity not found: ${opportunityId}`);
  return mapOpportunityStage(row, opportunityId);
}
```

- [ ] **Step 4: Make CRM tools thin wrappers**

Each tool retains its existing ID, description, input schema, and output schema but executes:

```ts
return runOpportunityTool({
  context,
  execute: getOpportunityOverview,
});
```

Use the corresponding service function. Result-count logging is handled centrally by shared tool hooks when a compact count can be derived.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/services/microsoft/dynamics-crm/opportunity.service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/microsoft/dynamics-crm/opportunity.service.ts src/mastra/tools/crm tests/services/microsoft/dynamics-crm/opportunity.service.test.ts
git commit -m "refactor: extract reusable crm opportunity services"
```

---

### Task 6: Reuse shared intermediate data and build compact opportunity intelligence

**Files:**
- Create: `src/utils/result.util.ts`
- Modify: `src/services/microsoft/dynamics-finops/delivery.service.ts`
- Modify: `src/services/microsoft/dynamics-finops/invoice.service.ts`
- Create: `src/services/opportunity/opportunity-intelligence.service.ts`
- Create: `src/mastra/schemas/opportunity-intelligence.schema.ts`
- Test: `tests/services/opportunity/opportunity-intelligence.service.test.ts`

**Interfaces:**
- Consumes reusable CRM service functions, one resolved-items result, one Sales Order result, stock/MSDS functions that accept resolved items, and delivery/invoice functions that accept prefetched Sales Orders.
- Produces `getOpportunityIntelligence(opportunityId, deps?)` with section statuses `available | empty | failed` and no route data.

- [ ] **Step 1: Add reusable section result helper with tests embedded in intelligence test**

`src/utils/result.util.ts`:

```ts
export type SectionStatus = "available" | "empty" | "failed";

export type DataSection<T> = {
  status: SectionStatus;
  data: T | null;
  reason: string | null;
};

export function available<T>(data: T): DataSection<T> {
  return { status: "available", data, reason: null };
}

export function empty<T>(data: T): DataSection<T> {
  return { status: "empty", data, reason: null };
}

export function failed<T>(reason: string): DataSection<T> {
  return { status: "failed", data: null, reason };
}

export function safeReason(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "Unknown integration error";
}
```

- [ ] **Step 2: Add prefetched Sales Order variants to delivery and invoice services**

Export the Sales Order result type from `sales-order.service.ts` using:

```ts
export type SalesOrderResult = Awaited<ReturnType<typeof getSalesOrdersForOpportunity>>;
```

Add private row mappers first:

```ts
function mapDeliveryRow(row: DeliveryResponse["value"][number]) {
  return {
    salesOrderNumber: row.SalesId ?? "",
    packingSlipId: row.PackingSlipId ?? "",
    internalPackingSlipId: row.InternalPackingSlipId ?? "",
    customerReference: row.CustomerRef ?? "",
    purchaseOrder: row.PurchaseOrder ?? "",
    deliveryDate: row.DeliveryDate ?? "",
    receiptDate: row.TS_ReceiptDate ?? "",
    quantity: row.Qty ?? 0,
    warehouse: row.inventLocationId ?? "",
    received: row.TS_Received ?? "",
    invoiceAccount: row.InvoiceAccount ?? "",
    deliveryName: row.DeliveryName ?? "",
    transporter: row.TS_Transporter ?? "",
    invoiceAmount: row.TS_InvoiceAmountTmp ?? 0,
  };
}

function mapInvoiceRow(row: InvoiceResponse["value"][number]) {
  return {
    invoiceNumber: row.InvoiceNumber ?? "",
    invoiceDate: row.InvoiceDate ?? "",
    ledgerVoucher: row.LedgerVoucher ?? "",
    salesOrderNumber: row.SalesOrderNumber ?? "",
    customerReference: row.CustomersOrderReference ?? "",
    customerAccount: row.InvoiceCustomerAccountNumber ?? "",
    currency: row.CurrencyCode ?? "",
    paymentTerms: row.PaymentTermsName ?? "",
    invoiceAmount: row.TotalInvoiceAmount ?? 0,
    taxAmount: row.TotalTaxAmount ?? 0,
    discountAmount: row.TotalDiscountAmount ?? 0,
    chargeAmount: row.TotalChargeAmount ?? 0,
  };
}
```

Add:

```ts
export async function getDeliveryStatusFromSalesOrders(
  salesOrderResult: SalesOrderResult,
) {
  const salesOrderNumbers = salesOrderResult.salesOrders
    .map((item) => item.salesOrderNumber)
    .filter(Boolean);
  if (salesOrderNumbers.length === 0) {
    return { noOpp: salesOrderResult.noOpp, totalSalesOrders: 0, totalDeliveries: 0, deliveries: [] };
  }
  const salesOrderFilter = salesOrderNumbers
    .map((number) => `SalesId eq '${escapeODataString(number)}'`)
    .join(" or ");
  const data = await finopsGet<DeliveryResponse>("TS_CustPackSlipJours", {
    $select: [
      "PackingSlipId", "InternalPackingSlipId", "SalesId", "CustomerRef",
      "PurchaseOrder", "DeliveryDate", "TS_ReceiptDate", "Qty",
      "inventLocationId", "TS_Received", "InvoiceAccount", "DeliveryName",
      "TS_Transporter", "TS_InvoiceAmountTmp",
    ].join(","),
    $filter: `dataAreaId eq 'ecp' and (${salesOrderFilter})`,
  });
  const deliveries = data.value.map(mapDeliveryRow);
  return {
    noOpp: salesOrderResult.noOpp,
    totalSalesOrders: salesOrderNumbers.length,
    totalDeliveries: deliveries.length,
    deliveries,
  };
}

export async function getInvoicesFromSalesOrders(
  salesOrderResult: SalesOrderResult,
) {
  const salesOrderNumbers = salesOrderResult.salesOrders
    .map((item) => item.salesOrderNumber)
    .filter(Boolean);
  if (salesOrderNumbers.length === 0) {
    return { noOpp: salesOrderResult.noOpp, totalSalesOrders: 0, totalInvoices: 0, totalInvoiceAmount: 0, invoices: [] };
  }
  const salesOrderFilter = salesOrderNumbers
    .map((number) => `SalesOrderNumber eq '${escapeODataString(number)}'`)
    .join(" or ");
  const data = await finopsGet<InvoiceResponse>("SalesInvoiceHeadersV2", {
    $select: [
      "InvoiceNumber", "InvoiceDate", "LedgerVoucher", "CurrencyCode",
      "SalesOrderNumber", "CustomersOrderReference",
      "InvoiceCustomerAccountNumber", "PaymentTermsName",
      "TotalInvoiceAmount", "TotalTaxAmount", "TotalDiscountAmount",
      "TotalChargeAmount",
    ].join(","),
    $filter: `dataAreaId eq 'ecp' and (${salesOrderFilter})`,
  });
  const invoices = data.value.map(mapInvoiceRow);
  return {
    noOpp: salesOrderResult.noOpp,
    totalSalesOrders: salesOrderNumbers.length,
    totalInvoices: invoices.length,
    totalInvoiceAmount: invoices.reduce((sum, item) => sum + item.invoiceAmount, 0),
    invoices,
  };
}
```

Then keep compatibility functions:

```ts
export async function getDeliveryStatusForOpportunity(opportunityId: string) {
  return getDeliveryStatusFromSalesOrders(
    await getSalesOrdersForOpportunity(opportunityId),
  );
}

export async function getInvoicesForOpportunity(opportunityId: string) {
  return getInvoicesFromSalesOrders(
    await getSalesOrdersForOpportunity(opportunityId),
  );
}
```

This prevents broad intelligence from querying the same Sales Orders three times.

- [ ] **Step 3: Write failing broad intelligence tests**

Use dependency injection so tests do not call Microsoft systems:

```ts
const deps = {
  getOverview: vi.fn(async () => ({ noOpp: "OP1", opportunityName: "Opp", customer: "Customer" })),
  getProducts: vi.fn(async () => ({ products: [{ name: "P1", quantity: 2, uom: "Drum", price: 10, amount: 20, discount: 0 }] })),
  getActivities: vi.fn(async () => ({ activities: [] })),
  getStage: vi.fn(async () => ({ status: { status: "Won" }, process: {}, orderReadiness: {} })),
  getResolvedItems: vi.fn(async () => ({ items: [{ status: "RESOLVED", productName: "P1", uom: "Drum", requestedQuantity: 2, itemNumber: "FG1", productNumber: "PR1", finopsProductName: "P1", opportunityProductId: "1" }], summary: { total: 1, resolved: 1, unresolved: 0 } })),
  checkStock: vi.fn(async () => ({ warehouse: "PTM", summary: { total: 1, sufficient: 0, shortage: 1, unresolved: 0 }, items: [{ productName: "P1", uom: "Drum", requestedQuantity: 2, available: 0, stockStatus: "SHORTAGE" }] })),
  getSalesOrders: vi.fn(async () => ({ noOpp: "OP1", total: 1, salesOrders: [{ salesOrderNumber: "SO1", status: "Invoiced", totalAmount: 20, warehouse: "PTM", requestedShippingDate: "", requestedReceiptDate: "", confirmedShippingDate: "", confirmedReceiptDate: "", specialInstruction: "" }] })),
  getDeliveryFromSalesOrders: vi.fn(async () => ({ noOpp: "OP1", totalSalesOrders: 1, totalDeliveries: 1, deliveries: [{ salesOrderNumber: "SO1", packingSlipId: "DO1", deliveryDate: "2024-06-12", receiptDate: "2024-06-12", quantity: 2, warehouse: "DURI", received: "Yes" }] })),
  getInvoicesFromSalesOrders: vi.fn(async () => ({ noOpp: "OP1", totalSalesOrders: 1, totalInvoices: 1, totalInvoiceAmount: 22, invoices: [{ invoiceNumber: "INV1", invoiceDate: "2024-06-12", salesOrderNumber: "SO1", currency: "IDR", paymentTerms: "N30", invoiceAmount: 22, taxAmount: 2 }] })),
  getMsdsFromResolvedItems: vi.fn(async () => ({ opportunityId: OPPORTUNITY_ID, summary: { totalProducts: 1, msdsFound: 1, msdsNotFound: 0, itemNotFound: 0 }, products: [{ productName: "P1", msdsFound: true, totalDocuments: 2 }] })),
};

const result = await getOpportunityIntelligence(OPPORTUNITY_ID, deps as any);
expect(result.stock.status).toBe("available");
expect(result.stock.data?.summary.shortage).toBe(1);
expect(result.msds.data?.products[0]).toEqual({ productName: "P1", msdsFound: true, totalDocuments: 2 });
expect((result as any).route).toBeUndefined();
expect(deps.getResolvedItems).toHaveBeenCalledTimes(1);
expect(deps.getSalesOrders).toHaveBeenCalledTimes(1);
```

Add a second test where `getInvoicesFromSalesOrders` throws and verify only `invoices.status === "failed"` while `stock.status === "available"`.

- [ ] **Step 4: Verify RED**

```bash
npx vitest run tests/services/opportunity/opportunity-intelligence.service.test.ts
```

Expected: FAIL because the intelligence service is missing.

- [ ] **Step 5: Implement dependency-aware broad aggregator**

Required execution pattern:

```ts
const [overview, products, activities, stage, resolvedItems, salesOrders] =
  await Promise.allSettled([
    deps.getOverview(opportunityId),
    deps.getProducts(opportunityId),
    deps.getActivities(opportunityId),
    deps.getStage(opportunityId),
    deps.getResolvedItems(opportunityId),
    deps.getSalesOrders(opportunityId),
  ]);
```

Then:

- if `resolvedItems` succeeded, call stock and MSDS concurrently using the same resolved item array;
- if `salesOrders` succeeded, call delivery and invoice concurrently using the same Sales Order result;
- convert each result into `available`, `empty`, or `failed`;
- never call delivery context or route services.

Compact broad output fields:

```ts
{
  opportunity,
  stage,
  products: {
    total,
    totalQuantity,
    totalAmount,
    items: [{ name, quantity, uom, amount, discount }]
  },
  activities: {
    total,
    open,
    items: [{ subject, owner, status, startDate }].slice(0, 5)
  },
  stock: {
    warehouse,
    summary,
    items: [{ productName, uom, requestedQuantity, available, stockStatus }]
  },
  salesOrders: {
    total,
    items: [{ salesOrderNumber, status, totalAmount, warehouse, requestedShippingDate, requestedReceiptDate, confirmedShippingDate, confirmedReceiptDate, specialInstruction }]
  },
  deliveries: {
    total,
    items: [{ salesOrderNumber, packingSlipId, deliveryDate, receiptDate, quantity, warehouse, received }]
  },
  invoices: {
    total,
    totalInvoiceAmount,
    items: [{ invoiceNumber, invoiceDate, salesOrderNumber, currency, paymentTerms, invoiceAmount, taxAmount }]
  },
  msds: {
    summary,
    products: [{ productName, msdsFound, totalDocuments }]
  }
}
```

No MSDS URLs are included in this broad tool; the fine-grained MSDS tool remains the path for actual links.

- [ ] **Step 6: Add matching Zod schema**

Create `opportunity-intelligence.schema.ts` with `sectionSchema(dataSchema)`:

```ts
const sectionSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    status: z.enum(["available", "empty", "failed"]),
    data: data.nullable(),
    reason: z.string().nullable(),
  });
```

Define schemas for the exact compact data shapes above. Export `opportunityIntelligenceSchema`.

- [ ] **Step 7: Verify targeted tests and typecheck**

```bash
npx vitest run tests/services/opportunity/opportunity-intelligence.service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/utils/result.util.ts src/services/microsoft/dynamics-finops/delivery.service.ts src/services/microsoft/dynamics-finops/invoice.service.ts src/services/opportunity/opportunity-intelligence.service.ts src/mastra/schemas/opportunity-intelligence.schema.ts tests/services/opportunity/opportunity-intelligence.service.test.ts
git commit -m "feat: add compact opportunity intelligence service"
```

---

### Task 7: Add broad intelligence tool and simplify Sales capability routing

**Files:**
- Create: `src/mastra/tools/common/get-opportunity-intelligence.tool.ts`
- Modify: `src/mastra/tools/tool.registry.ts`
- Modify: existing tool descriptions
- Modify: `src/mastra/prompts/sales.instructions.ts`
- Modify: `src/mastra/agents/sales.agent.ts`
- Modify: `src/mastra/agents/general.agent.ts`

**Interfaces:**
- Produces `common.get_opportunity_intelligence` for broad internal requests.
- Fine-grained tools remain exposed for narrow requests.

- [ ] **Step 1: Add the broad tool wrapper**

```ts
export const getOpportunityIntelligenceTool = createTool({
  id: "common.get_opportunity_intelligence",
  description:
    "Get a compact internal CRM, FinOps, and SharePoint snapshot for a broad summary of the active opportunity. Does not calculate route or perform web research.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: opportunityIntelligenceSchema,
  execute: async (_input, context) =>
    runOpportunityTool({
      context,
      execute: getOpportunityIntelligence,
    }),
});
```

- [ ] **Step 2: Register the tool in `commonTools`**

```ts
export const commonTools = {
  currentTime: currentTimeTool,
  getOpportunityIntelligence: getOpportunityIntelligenceTool,
  getDeliveryContext: getDeliveryContextTool,
  getRouteEstimate: getRouteEstimateTool,
};
```

Keep all fine-grained CRM, FinOps, SharePoint, Common, and Local web tools registered globally for Studio.

- [ ] **Step 3: Replace the 720-line Sales prompt with a compact capability prompt**

Keep identity, source hierarchy, grounding, evidence classification, broad-vs-specific behavior, and output rules in the agent instructions. Move detailed capability-selection guidance into each tool `description`; do not maintain the same routing table in both places.

Use this structure, keeping the final file intentionally short:

```ts
export const salesAgentInstructions = `
You are EON Sales AI Assistant. The active CRM Opportunity is available through RequestContext.

SOURCE OF TRUTH
- CRM: opportunity, customer, products, owner, stage/status, activities.
- FinOps: item mapping, stock, Sales Order, delivery, invoice, operational delivery data.
- SharePoint: MSDS metadata and links.
- Public web: external company, stakeholder, competitor, market, and industry information only.
Never replace internal facts with web information and never invent business facts, people, IDs, companies, URLs, quantities, transactions, or relationships.

TOOL ROUTING
- Broad opportunity summary or broad internal-plus-external intelligence: call getOpportunityIntelligence first.
- Narrow stock question: checkStockAvailability.
- FinOps item mapping: resolveOpportunityItems.
- Sales Order: getSalesOrders.
- Delivery/Packing Slip: getDeliveryStatus.
- Invoice: getInvoices.
- MSDS/SDS links: getMsds.
- Origin/destination only: getDeliveryContext.
- Distance/driving time/transit estimate: getRouteEstimate. Do not call route tools unless route/location is actually requested.
- Public/current/external research: use the web-search capability available in the current runtime.

WEB CLASSIFICATION
- A public professional profile is a PUBLIC STAKEHOLDER CANDIDATE, not a confirmed opportunity decision maker unless internal CRM confirms it.
- A company selling similar products is a MARKET CANDIDATE, not the active opportunity competitor unless evidence links it to the customer/opportunity.
- If evidence is weak or absent, say so. Never invent a source or URL.

MISSING DATA
- Tool not called != data does not exist.
- Tool failed != data does not exist.
- Only a successful empty result means no matching data was found.

MULTI-INTENT
Use every authoritative capability needed for the user's explicitly requested categories. For broad summaries prefer getOpportunityIntelligence instead of serially calling every internal tool.

OUTPUT
Use the user's language. Separate internal facts from public web information. Be concise and readable in a CRM side pane. Do not expose GUIDs, request IDs, raw tool payloads, OData queries, or implementation details unless explicitly requested for debugging.
`.trim();
```

- [ ] **Step 4: Shorten tool descriptions**

Examples:

```text
crm.get_opportunity_overview:
"Get the active CRM opportunity overview from Dynamics 365 CRM."

finops.check_stock_availability:
"Check current stock readiness for all active opportunity products in FinOps. Item mapping is deterministic; unresolved items are never guessed."

sharepoint.get_msds:
"Get MSDS/SDS metadata and links for active opportunity products from SharePoint after deterministic item mapping."

common.get_route_estimate:
"Calculate road distance and driving time for the active opportunity from canonical delivery locations. Use only for explicit route/transit questions."
```

Do not mention removed workflow internals.

- [ ] **Step 5: Centralize max steps in agent factories**

In Sales and General agents import `env` and set:

```ts
defaultOptions: {
  maxSteps:
    modelMode === "local"
      ? env.LOCAL_AGENT_MAX_STEPS
      : env.CLOUD_AGENT_MAX_STEPS,
},
```

Do not restore hard-coded `30`.

- [ ] **Step 6: Typecheck and inspect Studio registrations**

```bash
npm run typecheck
```

Expected: PASS. Studio should show the new global tool and no low-level workflows.

- [ ] **Step 7: Commit**

```bash
git add src/mastra/tools src/mastra/prompts/sales.instructions.ts src/mastra/agents/sales.agent.ts src/mastra/agents/general.agent.ts
git commit -m "refactor: route broad sales requests through compact intelligence"
```

---

### Task 8: Decompose agent runner and compact model context

**Files:**
- Create: `src/mastra/runtime/prompt-builder.ts`
- Create: `src/mastra/runtime/tool-results.ts`
- Create: `src/mastra/runtime/agent-metrics.ts`
- Modify: `src/mastra/runtime/agent.runner.ts`
- Modify: `src/mastra/agents/local-synthesis.agent.ts`
- Test: `tests/mastra/runtime/prompt-builder.test.ts`
- Test: `tests/mastra/runtime/tool-results.test.ts`

**Interfaces:**
- `agent.runner.ts` becomes high-level orchestration only.
- Model-visible prompt contains the user request plus minimal context reminder, not full pretty-printed context JSON.
- Local synthesis receives compact labeled tool results.

- [ ] **Step 1: Write failing prompt-builder test**

```ts
import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "../../../src/mastra/runtime/prompt-builder.js";

describe("buildAgentPrompt", () => {
  it("does not serialize opportunity context JSON into the model prompt", () => {
    const prompt = buildAgentPrompt({
      message: "Ringkas kondisi opportunity ini",
      agentId: "sales",
      hasOpportunityContext: true,
    });
    expect(prompt).toContain("Ringkas kondisi opportunity ini");
    expect(prompt).toContain("active opportunity");
    expect(prompt).not.toContain("59cf2a22");
    expect(prompt).not.toContain("Application context:");
  });
});
```

- [ ] **Step 2: Implement prompt builder**

```ts
export function buildAgentPrompt(input: {
  message: string;
  agentId: string;
  hasOpportunityContext: boolean;
}) {
  if (input.agentId !== "sales" || !input.hasOpportunityContext) {
    return input.message.trim();
  }
  return `${input.message.trim()}\n\nThe active opportunity is already available through RequestContext. Use authoritative tools for current enterprise facts; do not ask for or invent the opportunity ID.`;
}
```

- [ ] **Step 3: Move tool-result extraction to `tool-results.ts`**

Export:

```ts
export function getToolName(toolCall: unknown): string | null
export function getToolCallId(value: unknown): string | null
export function getToolResultValue(toolResult: unknown): unknown
export function extractLabeledToolResults(steps: unknown[], agentId: string): Array<{ tool: string; result: unknown }>
export function compactJson(value: unknown): string
```

`compactJson` must use `JSON.stringify(value)` without pretty-print indentation.

- [ ] **Step 4: Write tool-result test**

Build a fake step containing one call and result with the same `toolCallId`; assert the output is labeled with the correct tool and `compactJson()` contains no newline indentation.

Run:

```bash
npx vitest run tests/mastra/runtime/tool-results.test.ts
```

Expected: RED before implementation, PASS after.

- [ ] **Step 5: Move metric creation to `agent-metrics.ts`**

Expose:

```ts
export function buildAgentMetrics(input: {
  requestId?: string;
  agentId: string;
  modelMode: ModelMode;
  conversationId: string;
  opportunityId?: string;
  startedAt: number;
  finishReason?: string | null;
  synthesisFinishReason?: string | null;
  synthesisUsed: boolean;
  steps: number;
  textLength: number;
  firstUsage?: UsageLike;
  synthesisUsage?: UsageLike | null;
  toolsUsed: Array<{ tool: string }>;
})
```

Return the spec fields: `event: "AI_RUN"`, request/agent/model/conversation IDs, status, steps, duration, token counts, tool count/names, synthesis flag.

- [ ] **Step 6: Simplify `agent.runner.ts`**

The runner must only:

1. validate agent context;
2. resolve the Mastra agent;
3. build RequestContext with `buildAgentRequestContext()`;
4. build memory options from `threadId/resourceId` only when `agentMemory` exists;
5. build minimal prompt;
6. execute Cloud or Local with `maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS`;
7. track tools;
8. run Local synthesis only when output is empty, `tool-calls`, or `length`;
9. build one `AI_RUN` metric event;
10. return answer, tools, metrics, conversationId.

Cloud generation must also pass:

```ts
modelSettings: { maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS }
```

Local generation keeps `temperature: 0.1` but removes hard-coded `LOCAL_MAX_STEPS` and `LOCAL_MAX_OUTPUT_TOKENS` constants.

- [ ] **Step 7: Shrink Local synthesis instructions and update tool authority names**

Keep only source isolation, no-invention, missing-data distinction, and current IDs:

```text
common.get_opportunity_intelligence
crm.get_opportunity_overview
crm.get_opportunity_products
crm.get_opportunity_activities
crm.get_opportunity_stage
finops.resolve_opportunity_items
finops.check_stock_availability
finops.get_sales_orders
finops.get_delivery_status
finops.get_invoices
common.get_delivery_context
common.get_route_estimate
sharepoint.get_msds
web.search
```

Do not keep stale `sales.getMsds`/`sales.webSearch` authority labels in the synthesis system prompt.

The synthesis request body must use:

```ts
const synthesisPrompt = `USER QUESTION\n${message}\n\nVERIFIED TOOL RESULTS\n${compactJson(labeledToolResults)}\n\nCreate a concise final answer using only these verified results.`;
```

Do not add full application context JSON again.

- [ ] **Step 8: Verify runtime tests, typecheck, and suite**

```bash
npx vitest run tests/mastra/runtime/prompt-builder.test.ts tests/mastra/runtime/tool-results.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/mastra/runtime src/mastra/agents/local-synthesis.agent.ts tests/mastra/runtime
git commit -m "refactor: compact agent runtime context and metrics"
```

---

### Task 9: Compact SearXNG evidence without reducing research capability

**Files:**
- Modify: `src/services/web/searxng.service.ts`
- Modify: `src/mastra/tools/web/web-search.tool.ts`
- Test: `tests/services/web/searxng.service.test.ts`

**Interfaces:**
- Search behavior remains multiple targeted searches when useful.
- Each result remains `{title,url,snippet,engine}` but duplicates and oversized snippets are removed before reaching the model.

- [ ] **Step 1: Write failing SearXNG normalization test**

Refactor the service to export a pure normalizer:

```ts
normalizeSearxngResults(rawResults, { maxResults, maxSnippetChars })
```

Test:

```ts
const results = normalizeSearxngResults(
  [
    { title: "A", url: "https://example.com/a", content: "x".repeat(900), engine: "google" },
    { title: "A duplicate", url: "https://example.com/a#fragment", content: "duplicate", engine: "bing" },
    { title: "B", url: "https://example.com/b", content: "  hello   world  ", engine: "bing" },
    { title: "No URL", url: "", content: "skip" },
  ],
  { maxResults: 5, maxSnippetChars: 700 },
);

expect(results).toHaveLength(2);
expect(results[0].snippet.length).toBeLessThanOrEqual(700);
expect(results[1].snippet).toBe("hello world");
```

- [ ] **Step 2: Verify RED**

```bash
npx vitest run tests/services/web/searxng.service.test.ts
```

Expected: FAIL because normalizer does not exist.

- [ ] **Step 3: Implement URL normalization, dedupe, whitespace cleanup, and snippet truncation**

Use a helper that removes URL fragments for dedupe but preserves the original usable URL in output. Dedupe first by normalized URL, then by normalized lowercase `title|url` key. Stop at `env.SEARXNG_MAX_RESULTS`.

`searchSearxng()` must call the normalizer with:

```ts
{
  maxResults: env.SEARXNG_MAX_RESULTS,
  maxSnippetChars: env.SEARXNG_SNIPPET_MAX_CHARS,
}
```

- [ ] **Step 4: Remove per-tool web logging and add compact model output**

Keep `execute` focused on the search operation:

```ts
execute: async ({ query }) => ({
  query,
  provider: "searxng" as const,
  results: await searchSearxng(query),
}),
```

Remove the custom `Web search started/completed` logger blocks. The shared agent tool hooks from Task 2 provide a consistent `AI_TOOL` business event for Local web search just like other tools, while Mastra observability captures generic execution telemetry.

Add `toModelOutput` so the model receives only compact evidence:

```ts
toModelOutput: (output) => ({
  type: "text",
  value: JSON.stringify({
    query: output.query,
    results: output.results.map(({ title, url, snippet }) => ({
      title,
      url,
      snippet,
    })),
  }),
}),
```

Do not include search-engine implementation metadata in model context unless it is needed for debugging.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/services/web/searxng.service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/web/searxng.service.ts src/mastra/tools/web/web-search.tool.ts tests/services/web/searxng.service.test.ts
git commit -m "refactor: compact local web search evidence"
```

---

### Task 10: Update the Local-vs-Cloud playground for persistent independent conversations and backend metrics

**Files:**
- Modify: `public/dev/index.html`

**Interfaces:**
- Local and Cloud keep separate `conversationId` values.
- Each request sends only the relevant conversation ID.
- Comparison uses backend metrics for steps/tokens/duration and keeps browser wall clock as secondary timing.

- [ ] **Step 1: Add conversation state**

Near existing UI state:

```js
const conversations = {
  local: null,
  cloud: null,
};
```

- [ ] **Step 2: Include mode-specific conversation ID in chat payload**

The request body becomes:

```js
body: JSON.stringify({
  message,
  modelMode,
  conversationId: conversations[modelMode] || undefined,
  context: { opportunityId },
}),
```

After a successful response:

```js
if (data.conversationId) {
  conversations[modelMode] = data.conversationId;
}
```

Do not send `threadId` or `resourceId`.

- [ ] **Step 3: Add New Conversation control**

Add one button that executes:

```js
conversations.local = null;
conversations.cloud = null;
```

It must not clear the selected Opportunity ID or prompt text.

- [ ] **Step 4: Render backend metrics**

For each side read:

```js
const metrics = result?.data?.metrics ?? {};
```

Show:

```text
Backend Duration
Steps
Input Tokens
Output Tokens
Total Tokens
Cached Input Tokens
Tool Calls
Web Search Used
```

Keep browser response time labeled separately as `Client Wall Time`.

- [ ] **Step 5: Update Comparison Insight calculations**

Prefer `metrics.durationMs` when both sides have it. Add comparison rows for `steps` and `totalTokens`. Keep source coverage and web-search-used comparison.

- [ ] **Step 6: Manual browser verification**

Run:

```bash
npm run dev
```

Verify:

1. Local and Cloud first request receive different conversation IDs.
2. A second Local-only follow-up reuses only Local conversation ID.
3. A second Cloud-only follow-up reuses only Cloud conversation ID.
4. `New Conversation` clears both IDs.
5. Opportunity ID remains populated.
6. Steps/tokens/backend duration display from response metrics.

- [ ] **Step 7: Commit**

```bash
git add public/dev/index.html
git commit -m "feat: persist independent comparison conversations"
```

---

### Task 11: Final cleanup, regression verification, and benchmark

The final review includes a **Mastra-native extension smoke test**: add a throwaway test-only agent/tool/workflow registry entry and verify that no changes are required in `agent.runner.ts` or `mastra/index.ts`; then remove the throwaway fixture before commit.

**Files:**
- Modify as needed only for issues discovered by verification.
- Update: `CHANGES_MASTRA_REFACTOR.md` or add a new concise migration note if that file exists in the working tree.

**Interfaces:**
- Produces a clean source tree, green typecheck/tests, no stale workflow references, and measured Local/Cloud benchmark results.

- [ ] **Step 1: Scan for stale workflow and old memory contract references**

```bash
grep -R "workflow-runner\|createRunAsync\|src/mastra/workflows\|resourceId.*req.body\|threadId.*req.body" src tests public || true
```

Expected: no runtime workflow references; only deliberate legacy `threadId` migration handling may remain.

- [ ] **Step 2: Scan for stale synthesis authority names**

```bash
grep -R "sales.getMsds\|sales.checkStockAvailability\|sales.getRouteEstimate\|sales.webSearch" src || true
```

Expected: no stale authority names in Local synthesis instructions.

- [ ] **Step 3: Run complete automated verification**

```bash
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 4: Verify Studio surface**

Run:

```bash
npm run studio
```

Expected:

- agents still visible;
- global tools visible including `common.get_opportunity_intelligence`;
- the five removed low-level workflows no longer appear.

- [ ] **Step 5: Run direct fine-grained regression checks**

Using opportunity `59cf2a22-6281-4465-9232-8ebeab009e5e`, verify existing authoritative values are unchanged if upstream data has not changed:

```text
Stock: total 7, sufficient 1, shortage 6, unresolved 0
Route: 264.7 km, 4.4 h when route is explicitly requested
MSDS: 7 products, 14 documents when MSDS links are explicitly requested
SO: SO-013600
Delivery: DO-013915
Invoice: ECP-ARINV-012952
```

- [ ] **Step 6: Run broad Local + Cloud benchmark**

Use the existing request:

```text
Ringkas kondisi opportunity ini dan tambahkan external intelligence jika relevan.

Pisahkan jawaban menjadi:
1. Internal Opportunity Facts
2. Product / Stock / Delivery Readiness
3. Competitor Insight
4. Stakeholder Insight
5. Public Web Insight
6. Risk / Gap
7. Recommended Next Action

Untuk data internal gunakan CRM, FinOps, dan SharePoint sebagai source of truth.

Jika web search tersedia:
- gunakan untuk informasi publik customer;
- competitor research;
- stakeholder profesional publik;
- market atau industry context.

Bedakan data internal dan public web information dengan jelas.

Jika web search tidak tersedia atau tidak menemukan informasi yang dapat diverifikasi:
- katakan secara singkat;
- jangan mengarang;
- jangan membuat nama, ID, jabatan, competitor, atau sumber palsu.
```

Capture:

```text
Local: steps, inputTokens, outputTokens, totalTokens, cachedInputTokens, durationMs, toolsUsed
Cloud: steps, inputTokens, outputTokens, totalTokens, cachedInputTokens, durationMs, toolsUsed
```

Acceptance:

- broad internal data normally comes from one `common.get_opportunity_intelligence` call;
- route tool is not used for this prompt;
- Local still uses SearXNG for external research;
- Cloud still uses native OpenAI web search;
- Local steps and input tokens are materially below the 14-step / 102,107-input-token baseline;
- Cloud token count does not increase materially;
- internal facts remain authoritative and public claims retain candidate/evidence wording.

- [ ] **Step 7: Verify multi-turn memory from API**

First call without `conversationId`, then a follow-up using the returned ID:

```text
Call 1: "Ringkas kondisi opportunity ini"
Call 2: "kalau stok yang kurang tadi yang mana saja?"
```

Expected:

- second request understands the conversational reference;
- current stock facts are still retrieved from authoritative tooling when needed;
- client does not send prior message history, `threadId`, or `resourceId`.

- [ ] **Step 8: Document migration summary**

Record:

```text
Removed: 5 thin Mastra workflows + workflow runner
Added: compact opportunity intelligence tool/service
API: conversationId replaces public threadId/resourceId handling
Memory: default lastMessages 8
Runtime: max steps 12, max output 6000
Search: dedupe + 700-char snippets
Logging: HTTP_REQUEST / AI_TOOL / AI_RUN
```

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "refactor: simplify eon ai backend architecture"
```

---

## Self-Review Notes

- Spec coverage: all removal, conversation, memory, prompt, logging, intelligence, SearXNG, UI, extensibility, error handling, and benchmark requirements are mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `conversationId`, `runOpportunityTool`, `getOpportunityIntelligence`, section status values, and runtime metric names are consistent across tasks.
- Review focus coverage: authenticated resource scope is tested in Task 1; partial failure and no-route broad intelligence in Task 5; SearXNG compaction in Task 8; Local compact synthesis in Task 7.
