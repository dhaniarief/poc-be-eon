import { z } from "zod";

export const opportunityIdInputSchema = z.object({
  opportunityId: z.string().uuid(),
});
