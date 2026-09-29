import { createTool } from "@mastra/core/tools";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { z } from "zod";

export const currentTimeTool = createTool({
  id: "common.get_current_time",

  description: "Get the current date and time in Asia/Jakarta timezone.",

  inputSchema: emptyToolInputSchema,

  outputSchema: z.object({
    timezone: z.string(),
    iso: z.string(),
    formatted: z.string(),
  }),

  execute: async () => {
    const now = new Date();

    const formatted = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
      timeStyle: "long",
    }).format(now);

    return {
      timezone: "Asia/Jakarta",
      iso: now.toISOString(),
      formatted,
    };
  },
});
