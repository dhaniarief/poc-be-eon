import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { registeredAgents } from "./agents/agent.registry.js";
import { mastraEditor } from "./editor.js";
import { mastraObservability } from "./observability.js";
import { mastraStorage } from "./storage.js";
import { allTools } from "./tools/tool.registry.js";
import { registeredWorkflows } from "./workflows/workflow.registry.js";

/** Single Mastra application root used by both Studio and Express runtime. */
export const mastra = new Mastra({
  agents: registeredAgents,
  tools: allTools,
  workflows: registeredWorkflows,
  storage: mastraStorage,
  logger: new PinoLogger({
    name: "EON AI Mastra",
    level: "info",
  }),
  observability: mastraObservability,
  ...(mastraEditor ? { editor: mastraEditor } : {}),
});
