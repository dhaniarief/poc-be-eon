import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import type { ModelMode } from "../../config/models/model.types.js";
import { getModel } from "../../config/models/model.resolver.js";
import { env } from "../../config/env.js";
import { agentMemory } from "../memory.js";
import { eonToolHooks } from "../runtime/tool-hooks.js";
import { currentTimeTool } from "../tools/common/current-time.tool.js";
import { webSearchTool as searxngWebSearchTool } from "../tools/web/web-search.tool.js";

const generalInstructions = `
You are EON AI Assistant.
Use currentTime for current date/time questions.
Use web search for current, recent, external, or public-web information instead of guessing.
Never claim research was performed unless the corresponding tool executed.
Use the user's language and keep answers concise.
`.trim();

export function createGeneralAgent(modelMode: ModelMode) {
  return new Agent({
    id: modelMode === "local" ? "general-local-agent" : "general-cloud-agent",
    name: modelMode === "local" ? "General Agent - Local" : "General Agent - Cloud",
    instructions: generalInstructions,
    model: getModel(modelMode),
    defaultOptions: {
      maxSteps:
        modelMode === "local"
          ? env.LOCAL_AGENT_MAX_STEPS
          : env.CLOUD_AGENT_MAX_STEPS,
    },
    hooks: eonToolHooks,
    ...(agentMemory ? { memory: agentMemory } : {}),
    tools: {
      currentTime: currentTimeTool,
      ...(modelMode === "local"
        ? { webSearch: searxngWebSearchTool }
        : {
            web_search: openai.tools.webSearch({
              searchContextSize: "medium",
            }),
          }),
    },
  });
}

export const generalLocalAgent = createGeneralAgent("local");
export const generalCloudAgent = createGeneralAgent("cloud");
