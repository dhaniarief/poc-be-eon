import type { EntityContext } from "./request-context.js";

export function buildAgentPrompt(input: {
  message: string;
  entities?: EntityContext;
}) {
  const message = input.message.trim();
  const entries = Object.entries(input.entities ?? {});

  if (entries.length === 0) return message;

  const context = entries
    .map(([type, entity]) => {
      const label = entity.name ? `${entity.name} (${entity.id})` : entity.id;
      return `- ${type}: ${label}`;
    })
    .join("\n");

  return [
    message,
    "",
    "HOST-SUPPLIED ENTITY CONTEXT",
    context,
    "Treat these IDs as explicit request context only. Use live tools for current business facts.",
  ].join("\n");
}
