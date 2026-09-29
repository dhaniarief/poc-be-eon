import { openai } from "@ai-sdk/openai";

import { env } from "../env.js";

export function getOpenAIModel() {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return openai("gpt-5.6");
}
