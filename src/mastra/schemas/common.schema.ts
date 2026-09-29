import { z } from "zod";

/** Shared schema for tools that take all business context from RequestContext. */
export const emptyToolInputSchema = z.object({});
