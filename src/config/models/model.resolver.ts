import type { ModelMode } from "./model.types.js";

import { getOpenAIModel } from "./openai.model.js";
import { getOllamaModel } from "./ollama.model.js";

export function getModel(mode: ModelMode) {
  switch (mode) {
    case "cloud":
      return getOpenAIModel();

    case "local":
      return getOllamaModel();

    default:
      throw new Error(`Unsupported model mode: ${mode}`);
  }
}
