import { z } from "zod";

import { AppError } from "../../errors/app.error.js";

export type AgentContext = {
  opportunityId?: string;
};

const opportunityIdSchema = z.string().uuid();

export function validateAgentContext(agentId: string, context?: AgentContext) {
  if (agentId !== "sales") {
    return context;
  }

  //
  // Sales sekarang boleh dimulai tanpa opportunityId.
  // Opportunity dapat dipilih kemudian melalui
  // setActiveOpportunity.
  //
  if (!context?.opportunityId) {
    return context ?? {};
  }

  const parsed = opportunityIdSchema.safeParse(context.opportunityId);

  if (!parsed.success) {
    throw new AppError(
      "Sales opportunityId must be a valid UUID",
      400,
      "VALIDATION_ERROR",
    );
  }

  return {
    ...context,
    opportunityId: parsed.data,
  };
}
