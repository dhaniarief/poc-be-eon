import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { env } from "../env.js";

const ollama = createOpenAICompatible({
  name: "ollama",
  baseURL: env.OLLAMA_BASE_URL,
});

export function getOllamaModel() {
  return ollama(env.OLLAMA_MODEL);
}
