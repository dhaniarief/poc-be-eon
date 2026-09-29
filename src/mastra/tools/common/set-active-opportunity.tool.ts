import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { env } from "../../../config/env.js";

import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";

import { findOpportunityByNo } from "../../../services/microsoft/dynamics-crm/opportunity.service.js";

import { setActiveOpportunityContext } from "../../../services/teams/teams-opportunity-context.service.js";

export const setActiveOpportunityTool = createTool({
  id: "common.set_active_opportunity",

  description:
    "Find an opportunity in Dynamics 365 CRM by Opportunity Number such as OP00142873 and set it as the active opportunity. In Microsoft Teams, also persist the active opportunity for the current user and conversation.",

  requestContextSchema: opportunityRequestContextSchema,

  inputSchema: z.object({
    opportunityNo: z
      .string()
      .min(1)
      .describe("Dynamics CRM Opportunity Number, for example OP00142873"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    opportunityId: z.string().uuid(),
    opportunityNo: z.string(),
    opportunityName: z.string(),
    customer: z.string(),
    message: z.string(),
  }),

  execute: async ({ opportunityNo }, context) => {
    const normalizedOpportunityNo = opportunityNo.trim();

    //
    // 1. Cari Opportunity dari CRM
    //
    const opportunity = await findOpportunityByNo(normalizedOpportunityNo);

    if (!opportunity) {
      throw new Error(
        `Opportunity ${normalizedOpportunityNo} tidak ditemukan di Dynamics 365 CRM.`,
      );
    }

    //
    // 2. Set opportunityId ke RequestContext.
    //
    // Ini membuat REST maupun Teams bisa memakai
    // opportunity yang baru dipilih pada request
    // yang sedang berjalan.
    //
    context.requestContext?.set("opportunityId", opportunity.opportunityId);

    //
    // 3. Jika request berasal dari Teams,
    // persist active opportunity ke PostgreSQL.
    //
    const channel = context.requestContext?.get("channel");

    if (channel && channel.platform === "teams") {
      await setActiveOpportunityContext(
        {
          tenantId: env.TEAMS_APP_TENANT_ID,

          platform: channel.platform,

          channelId: channel.channelId,

          threadId: channel.threadId ?? "",

          userId: channel.userId,
        },
        {
          opportunityId: opportunity.opportunityId,

          opportunityNo: opportunity.noOpp,
        },
      );
    }

    console.log("[ACTIVE OPPORTUNITY SET]", {
      opportunityNo: opportunity.noOpp,

      opportunityId: opportunity.opportunityId,

      platform: channel?.platform ?? "api",
    });

    return {
      success: true,

      opportunityId: opportunity.opportunityId,

      opportunityNo: opportunity.noOpp,

      opportunityName: opportunity.opportunityName,

      customer: opportunity.customer,

      message: `Opportunity ${opportunity.noOpp} sudah dijadikan opportunity aktif.`,
    };
  },
});
