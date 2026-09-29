import type { ModelMode } from "../../config/models/model.types.js";
import {
  generalCloudAgent,
  generalLocalAgent,
} from "./general.agent.js";
import { localSynthesisAgent } from "./local-synthesis.agent.js";
import { salesCloudAgent, salesLocalAgent } from "./sales.agent.js";

export const registeredAgents = {
  generalLocal: generalLocalAgent,
  generalCloud: generalCloudAgent,
  salesLocal: salesLocalAgent,
  salesCloud: salesCloudAgent,
  localSynthesis: localSynthesisAgent,
} as const;

export type RegisteredAgentKey = keyof typeof registeredAgents;

const publicAgentKeys = {
  general: {
    local: "generalLocal",
    cloud: "generalCloud",
  },
  sales: {
    local: "salesLocal",
    cloud: "salesCloud",
  },
} as const;

export function getAgentKey(
  agentId: string,
  modelMode: ModelMode,
): RegisteredAgentKey {
  const keys = publicAgentKeys[agentId as keyof typeof publicAgentKeys];

  if (!keys) {
    throw new Error(`Agent '${agentId}' not found`);
  }

  return keys[modelMode];
}
