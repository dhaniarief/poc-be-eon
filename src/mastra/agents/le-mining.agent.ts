import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createTeamsAdapter } from "@chat-adapter/teams";

import type { ModelMode } from "../../config/models/model.types.js";
import { getModel } from "../../config/models/model.resolver.js";
import { env } from "../../config/env.js";
import { agentMemory } from "../memory.js";
import { agentRequestContextSchema } from "../runtime/request-context.js";
import { eonToolHooks } from "../runtime/tool-hooks.js";
import { leMiningAgentInstructions } from "../prompts/le-mining.instructions.js";
import {
  commonTools,
  leMiningCoreTools,
  leMiningLocalPublicTools,
} from "../tools/tool.registry.js";
import { getTeamsToken } from "../../services/teams/teams-token.service.js";

export function createLeMiningAgent(modelMode: ModelMode) {
  const isCloud = modelMode === "cloud";

  return new Agent({
    id: isCloud ? "le-mining-cloud-agent" : "le-mining-local-agent",

    name: isCloud
      ? "LE Mining Intelligence Agent - Cloud"
      : "LE Mining Intelligence Agent - Local",

    requestContextSchema: agentRequestContextSchema,

    instructions: leMiningAgentInstructions,

    model: getModel(modelMode),

    // =========================================
    // TEAMS
    // Available for BOTH Local and Cloud
    // =========================================
    channels: {
      adapters: {
        teams: {
          adapter: createTeamsAdapter({
            appType: "SingleTenant",

            appId: env.TEAMS_APP_ID,

            appTenantId: env.TEAMS_APP_TENANT_ID,

            userName: isCloud
              ? "Mr. EON LE Mining Cloud"
              : "Mr. EON LE Mining Local",

            token: getTeamsToken,
          }),

          toolDisplay: "hidden",

          typingStatus: true,
        },
      },
    },

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
      ...commonTools,
      ...leMiningCoreTools,

      ...(modelMode === "local"
        ? {
            // LOCAL public intelligence
            // -> SearXNG
            ...leMiningLocalPublicTools,
          }
        : {
            // CLOUD public intelligence
            // -> OpenAI native web search
            web_search: openai.tools.webSearch({
              searchContextSize: "medium",
            }),
          }),
    },
  });
}

export const leMiningLocalAgent = createLeMiningAgent("local");
export const leMiningCloudAgent = createLeMiningAgent("cloud");
