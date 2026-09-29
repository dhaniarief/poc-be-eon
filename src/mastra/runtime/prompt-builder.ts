export function buildAgentPrompt(input: {
  message: string;
  agentId: string;
  hasOpportunityContext: boolean;
}) {
  const message = input.message.trim();

  if (input.agentId !== "sales" || !input.hasOpportunityContext) {
    return message;
  }

  return `${message}\n\nThe active opportunity is already available through RequestContext. Use authoritative tools for current enterprise facts; do not ask for or invent the opportunity ID.`;
}
