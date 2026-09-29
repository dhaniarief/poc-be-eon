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

export function createSalesAgent(modelMode: ModelMode) {
  return new Agent({
    id: modelMode === "local" ? "sales-local-agent" : "sales-cloud-agent",

    name: modelMode === "local" ? "Sales Agent - Local" : "Sales Agent - Cloud",

    requestContextSchema: opportunityRequestContextSchema,

    instructions: salesAgentInstructions,

    model: getModel(modelMode),

    ...(modelMode === "cloud"
      ? {
          channels: {
            adapters: {
              teams: {
                adapter: createTeamsAdapter({
                  appType: "SingleTenant",

                  appId: env.TEAMS_APP_ID,
                  appTenantId: env.TEAMS_APP_TENANT_ID,

                  token: async (scope, tenantId) => {
                    // Teams SDK dapat memberikan scope sebagai
                    // string atau array of string.
                    const tokenScope = Array.isArray(scope)
                      ? scope.join(" ")
                      : scope;

                    const tokenTenant = tenantId || env.TEAMS_APP_TENANT_ID;

                    console.log("[TEAMS TOKEN REQUEST]", {
                      scope: tokenScope,
                      tenantId: tokenTenant,
                    });

                    const body = new URLSearchParams({
                      client_id: env.TEAMS_APP_ID,
                      client_secret: env.TEAMS_APP_PASSWORD,
                      grant_type: "client_credentials",
                      scope: tokenScope,
                    });

                    const response = await fetch(
                      `https://login.microsoftonline.com/${tokenTenant}/oauth2/v2.0/token`,
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/x-www-form-urlencoded",
                        },
                        body,
                      },
                    );

                    const data = (await response.json()) as {
                      access_token?: string;
                      token_type?: string;
                      expires_in?: number;
                      error?: string;
                      error_description?: string;
                    };

                    if (!response.ok || !data.access_token) {
                      throw new Error(
                        `Teams token failed: ${
                          data.error_description ??
                          data.error ??
                          response.statusText
                        }`,
                      );
                    }

                    console.log("[TEAMS TOKEN ACQUIRED]", {
                      tenant: tokenTenant,
                      scope: tokenScope,
                    });

                    return data.access_token;
                  },
                }),

                toolDisplay: "hidden",
                typingStatus: false,
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

    ...(agentMemory ? { memory: agentMemory } : {}),

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
