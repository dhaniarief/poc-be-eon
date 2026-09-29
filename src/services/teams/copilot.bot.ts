import { Chat } from "chat";

import { createTeamsAdapter } from "@chat-adapter/teams";

import { createMemoryState } from "@chat-adapter/state-memory";

import { env } from "../../config/env.js";

import { getTeamsToken } from "./teams-token.service.js";

import { runAgent } from "../../mastra/runtime/agent.runner.js";

export const copilotBot = new Chat({
  userName: "EON AI",

  adapters: {
    teams: createTeamsAdapter({
      appType: "SingleTenant",

      appId: env.TEAMS_APP_ID,

      appTenantId: env.TEAMS_APP_TENANT_ID,

      userName: "EON AI",

      token: getTeamsToken,
    }),
  },

  state: createMemoryState(),

  logger: "debug",
});

copilotBot.onNewMention(async (thread, message) => {
  const startedAt = Date.now();

  const text = String(message.text ?? "").trim();

  console.log("[COPILOT MESSAGE]", {
    threadId: thread.id,

    messageId: message.id,

    userId: message.author?.userId,

    userName: message.author?.userName,

    text,
  });

  if (!text) {
    const sent = await thread.post("Maaf, pertanyaan tidak terbaca.");

    console.log("[COPILOT EMPTY RESPONSE SENT]", {
      sentMessageId: sent?.id ?? null,
    });

    return;
  }

  try {
    const resourceId = message.author?.userId ?? "copilot-user";

    /**
     * Pakai thread.id sebagai
     * conversation/memory identity.
     */
    const threadId = thread.id;

    const result = await runAgent({
      agentId: "sales",

      modelMode: "cloud",

      message: text,

      conversationId: threadId,

      threadId,

      resourceId,

      context: {
        channel: {
          platform: "teams-copilot",

          channelId: thread.channelId ?? "copilot",

          threadId,

          userId: resourceId,

          messageId: message.id,
        },
      },
    });

    const answer = String(result.text ?? "").trim();

    if (!answer) {
      throw new Error("Agent returned empty response");
    }

    console.log("[COPILOT AGENT RESPONSE]", {
      textLength: answer.length,

      preview: answer.slice(0, 200),
    });

    const sent = await thread.post(answer);

    console.log("[COPILOT RESPONSE SENT]", {
      incomingMessageId: message.id,

      sentMessageId: sent?.id ?? null,

      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[COPILOT ERROR]", error);

    try {
      const sent = await thread.post(
        "Maaf, terjadi kesalahan saat memproses permintaan.",
      );

      console.log("[COPILOT ERROR RESPONSE SENT]", {
        sentMessageId: sent?.id ?? null,
      });
    } catch (sendError) {
      console.error("[COPILOT ERROR RESPONSE FAILED]", sendError);
    }
  }
});
