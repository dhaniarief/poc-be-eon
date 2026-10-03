import { randomUUID } from "node:crypto";

import { Chat } from "chat";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createTeamsAdapter } from "@chat-adapter/teams";

import { env } from "../../config/env.js";
import { runAgent } from "../../mastra/runtime/agent.runner.js";
import { postgresPool } from "../database/postgres.js";
import {
  markCopilotCompleted,
  markCopilotFailed,
  markCopilotProcessing,
  markCopilotRejected,
  markCopilotStage,
} from "./copilot-ingress.service.js";
import { getTeamsToken } from "./teams-token.service.js";

const copilotState = createPostgresState({
  client: postgresPool,
  keyPrefix: "eon-copilot",
});

/**
 * ============================================================
 * COPILOT CHAT BOT
 * ============================================================
 *
 * Important production guarantees:
 * - Chat SDK state is durable in PostgreSQL.
 * - Overlapping messages are queued instead of silently dropped.
 * - Long-running locks are renewed by Chat SDK 4.39+.
 * - The HTTP webhook itself is acknowledged quickly by the middleware
 *   through Chat SDK's waitUntil option.
 */
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

  state: copilotState,

  concurrency: {
    strategy: "queue",
    maxQueueSize: env.COPILOT_QUEUE_MAX_SIZE,
    onQueueFull: "drop-oldest",
    queueEntryTtlMs: env.COPILOT_QUEUE_TTL_MS,
    maxLockLifetimeMs: env.COPILOT_MAX_LOCK_LIFETIME_MS,
  },

  logger: env.NODE_ENV === "production" ? "info" : "debug",
});

type MessageContextLike = {
  skipped?: any[];
  totalSinceLastHandler?: number;
};

function buildCombinedText(message: any, context?: MessageContextLike): string {
  const allMessages = [...(context?.skipped ?? []), message].filter(Boolean);

  return allMessages
    .map((item) => String(item?.text ?? "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function subscribeCopilotThread(thread: any, source: string) {
  const threadId = thread?.id ?? null;

  if (typeof thread?.subscribe !== "function") {
    console.warn("[COPILOT SUBSCRIBE NOT AVAILABLE]", {
      source,
      threadId,
    });
    return;
  }

  try {
    if (typeof thread?.isSubscribed === "function") {
      const subscribed = await thread.isSubscribed();

      if (subscribed) {
        console.log("[COPILOT THREAD ALREADY SUBSCRIBED]", {
          source,
          threadId,
        });
        return;
      }
    }

    await thread.subscribe();

    console.log("[COPILOT THREAD SUBSCRIBED]", {
      source,
      threadId,
    });
  } catch (error) {
    // Subscription is useful, but must not make the first message fail.
    console.warn("[COPILOT THREAD SUBSCRIBE FAILED]", {
      source,
      threadId,
      error,
    });
  }
}

async function sendTextAndRequireId(thread: any, text: string) {
  const sent = await thread.post(text);
  const sentMessageId = sent?.id ? String(sent.id) : "";

  if (!sentMessageId) {
    throw new Error(
      "Teams/Copilot outbound message did not return a message ID",
    );
  }

  return sent;
}

/**
 * ============================================================
 * MAIN MESSAGE HANDLER
 * ============================================================
 */
async function handleCopilotMessage(
  thread: any,
  message: any,
  messageContext?: MessageContextLike,
) {
  const startedAt = Date.now();
  const threadId = thread?.id ? String(thread.id) : null;
  const incomingMessageId = message?.id ? String(message.id) : null;
  const requestId = incomingMessageId || `copilot-${randomUUID()}`;
  const skippedCount = messageContext?.skipped?.length ?? 0;
  const text = buildCombinedText(message, messageContext);
  const resourceId = String(
    message?.author?.userId ?? message?.author?.id ?? "copilot-user",
  );

  let stage = "received";

  console.log("[COPILOT MESSAGE RECEIVED]", {
    requestId,
    threadId,
    channelId: thread?.channelId ?? null,
    isDM: thread?.isDM ?? null,
    messageId: incomingMessageId,
    skippedCount,
    totalSinceLastHandler:
      messageContext?.totalSinceLastHandler ?? skippedCount + 1,
    isMention: message?.isMention ?? null,
    userId: resourceId,
    userName: message?.author?.userName ?? message?.author?.fullName ?? null,
    textLength: text.length,
    preview: text.slice(0, 200),
  });

  if (!threadId) {
    console.error("[COPILOT INVALID THREAD]", {
      requestId,
      hasThread: Boolean(thread),
      hasMessage: Boolean(message),
      messageId: incomingMessageId,
    });
    return;
  }

  if (!incomingMessageId) {
    console.warn("[COPILOT MESSAGE WITHOUT ID]", {
      requestId,
      threadId,
      textLength: text.length,
    });
  }

  await markCopilotProcessing({
    conversationId: threadId,
    activityId: incomingMessageId,
    requestId,
    stage,
    skippedCount,
  });

  if (!text) {
    stage = "validation";

    try {
      const sent = await sendTextAndRequireId(
        thread,
        "Maaf, pertanyaan tidak terbaca.",
      );

      await markCopilotRejected({
        conversationId: threadId,
        activityId: incomingMessageId,
        requestId,
        reason: "Incoming message text is empty",
        responseMessageId: sent.id,
      });

      console.log("[COPILOT EMPTY RESPONSE SENT]", {
        requestId,
        threadId,
        incomingMessageId,
        sentMessageId: sent.id,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await markCopilotFailed({
        conversationId: threadId,
        activityId: incomingMessageId,
        requestId,
        stage,
        error,
      });

      console.error("[COPILOT EMPTY RESPONSE FAILED]", {
        requestId,
        threadId,
        incomingMessageId,
        error,
      });
    }

    return;
  }

  try {
    stage = "typing";
    await markCopilotStage({
      conversationId: threadId,
      activityId: incomingMessageId,
      requestId,
      stage,
    });

    try {
      if (typeof thread?.startTyping === "function") {
        await thread.startTyping();
      }
    } catch (typingError) {
      console.warn("[COPILOT TYPING INDICATOR FAILED]", {
        requestId,
        threadId,
        typingError,
      });
    }

    const conversationId = threadId;

    stage = "agent";
    await markCopilotStage({
      conversationId,
      activityId: incomingMessageId,
      requestId,
      stage,
    });

    console.log("[COPILOT AGENT START]", {
      requestId,
      conversationId,
      threadId,
      resourceId,
      incomingMessageId,
      skippedCount,
      textLength: text.length,
    });

    const result = await runAgent({
      agentId: "sales",
      modelMode: "cloud",
      message: text,
      conversationId,
      threadId,
      resourceId,
      requestId,
      context: {
        channel: {
          platform: "teams-copilot",
          channelId: thread?.channelId ?? "copilot",
          threadId,
          userId: resourceId,
          messageId: incomingMessageId ?? undefined,
        },
      },
    });

    const answer = String(result?.text ?? "").trim();

    if (!answer) {
      throw new Error("Agent returned empty response");
    }

    console.log("[COPILOT AGENT RESPONSE]", {
      requestId,
      conversationId,
      textLength: answer.length,
      preview: answer.slice(0, 200),
      toolsUsed: result?.toolsUsed?.map((item: any) => item?.tool) ?? [],
    });

    stage = "send-response";
    await markCopilotStage({
      conversationId,
      activityId: incomingMessageId,
      requestId,
      stage,
    });

    const sent = await sendTextAndRequireId(thread, answer);

    await markCopilotCompleted({
      conversationId,
      activityId: incomingMessageId,
      requestId,
      responseMessageId: sent.id,
    });

    console.log("[COPILOT RESPONSE SENT]", {
      requestId,
      conversationId,
      threadId,
      incomingMessageId,
      sentMessageId: sent.id,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    await markCopilotFailed({
      conversationId: threadId,
      activityId: incomingMessageId,
      requestId,
      stage,
      error,
    });

    console.error("[COPILOT ERROR]", {
      requestId,
      stage,
      threadId,
      incomingMessageId,
      durationMs: Date.now() - startedAt,
      error,
    });

    try {
      const sent = await sendTextAndRequireId(
        thread,
        "Maaf, terjadi kesalahan saat memproses permintaan. Silakan coba lagi.",
      );

      console.log("[COPILOT ERROR RESPONSE SENT]", {
        requestId,
        threadId,
        incomingMessageId,
        sentMessageId: sent.id,
        durationMs: Date.now() - startedAt,
      });
    } catch (sendError) {
      console.error("[COPILOT ERROR RESPONSE FAILED]", {
        requestId,
        threadId,
        incomingMessageId,
        sendError,
      });
    }
  }
}

/**
 * 1. Direct message
 */
if (typeof (copilotBot as any).onDirectMessage === "function") {
  (copilotBot as any).onDirectMessage(
    async (
      thread: any,
      message: any,
      _channel: any,
      context?: MessageContextLike,
    ) => {
      console.log("[COPILOT DIRECT MESSAGE]", {
        threadId: thread?.id ?? null,
        messageId: message?.id ?? null,
        isMention: message?.isMention ?? null,
        skippedCount: context?.skipped?.length ?? 0,
      });

      await handleCopilotMessage(thread, message, context);
    },
  );
}

/**
 * 2. First mention
 */
copilotBot.onNewMention(
  async (thread: any, message: any, context: MessageContextLike) => {
    console.log("[COPILOT NEW MENTION]", {
      threadId: thread?.id ?? null,
      messageId: message?.id ?? null,
      isMention: message?.isMention ?? null,
      skippedCount: context?.skipped?.length ?? 0,
    });

    await subscribeCopilotThread(thread, "new-mention");
    await handleCopilotMessage(thread, message, context);
  },
);

/**
 * 3. Follow-up in a subscribed thread
 */
if (typeof (copilotBot as any).onSubscribedMessage === "function") {
  (copilotBot as any).onSubscribedMessage(
    async (thread: any, message: any, context: MessageContextLike) => {
      console.log("[COPILOT SUBSCRIBED MESSAGE]", {
        threadId: thread?.id ?? null,
        messageId: message?.id ?? null,
        isMention: message?.isMention ?? null,
        skippedCount: context?.skipped?.length ?? 0,
      });

      await handleCopilotMessage(thread, message, context);
    },
  );
}

/**
 * 4. First-message fallback for Copilot surfaces that are neither detected as
 * a direct message nor a mention yet.
 */
if (typeof (copilotBot as any).onNewMessage === "function") {
  (copilotBot as any).onNewMessage(
    /[\s\S]+/,
    async (thread: any, message: any, context: MessageContextLike) => {
      console.log("[COPILOT NEW MESSAGE FALLBACK]", {
        threadId: thread?.id ?? null,
        messageId: message?.id ?? null,
        isDM: thread?.isDM ?? null,
        isMention: message?.isMention ?? null,
        skippedCount: context?.skipped?.length ?? 0,
        textLength: String(message?.text ?? "").length,
      });

      await subscribeCopilotThread(thread, "new-message-fallback");
      await handleCopilotMessage(thread, message, context);
    },
  );
}
