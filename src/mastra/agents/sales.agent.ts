import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createTeamsAdapter } from "@chat-adapter/teams";

import type { ModelMode } from "../../config/models/model.types.js";

import { getModel } from "../../config/models/model.resolver.js";
import { env } from "../../config/env.js";

import {
  crmTools,
  finopsTools,
  sharepointTools,
  commonTools,
  knowledgeTools,
} from "../tools/tool.registry.js";

import { webSearchTool as searxngWebSearchTool } from "../tools/web/web-search.tool.js";

import { agentMemory } from "../memory.js";

import { opportunityRequestContextSchema } from "../runtime/opportunity-context.js";

import { eonToolHooks } from "../runtime/tool-hooks.js";
import { salesAgentInstructions } from "../prompts/sales.instructions.js";

import { getTeamsToken } from "../../services/teams/teams-token.service.js";

export function createSalesAgent(modelMode: ModelMode) {
  const isCloud = modelMode === "cloud";

  return new Agent({
    id: isCloud ? "sales-cloud-agent" : "sales-local-agent",

    name: isCloud ? "Sales Agent - Cloud" : "Sales Agent - Local",

    requestContextSchema: opportunityRequestContextSchema,

    instructions: salesAgentInstructions,

    model: getModel(modelMode),

    ...(isCloud
      ? {
          channels: {
            adapters: {
              teams: {
                adapter: createTeamsAdapter({
                  appType: "SingleTenant",

                  appId: env.TEAMS_APP_ID,

                  appTenantId: env.TEAMS_APP_TENANT_ID,

                  userName: "EON AI",

                  token: getTeamsToken,
                }),

                toolDisplay: "hidden",

                typingStatus: true,
              },
            },
          },
        }
      : {}),

    defaultOptions: {
      maxSteps:
        modelMode === "local"
          ? env.LOCAL_AGENT_MAX_STEPS
          : env.CLOUD_AGENT_MAX_STEPS,
    },

    hooks: eonToolHooks,

    ...(agentMemory
      ? {
          memory: agentMemory,
        }
      : {}),

    tools: {
      ...crmTools,
      ...finopsTools,
      ...sharepointTools,
      ...commonTools,
      ...knowledgeTools,

      ...(modelMode === "local"
        ? {
            webSearch: searxngWebSearchTool,
          }
        : {
            web_search: openai.tools.webSearch({
              searchContextSize: "medium",
            }),
          }),
    },
  });
}

export const salesLocalAgent = createSalesAgent("local");

export const salesCloudAgent = createSalesAgent("cloud");
