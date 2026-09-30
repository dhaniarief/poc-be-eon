import { Chat } from "chat";

import { createTeamsAdapter } from "@chat-adapter/teams";

import { createMemoryState } from "@chat-adapter/state-memory";

import { env } from "../../config/env.js";

import { getTeamsToken } from "./teams-token.service.js";

import { runAgent } from "../../mastra/runtime/agent.runner.js";

/**
 * ============================================================
 * COPILOT CHAT BOT
 * ============================================================
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

  /**
   * NOTE:
   *
   * Untuk sekarang tetap menggunakan memory state.
   *
   * Nanti untuk production sebaiknya diganti PostgreSQL
   * supaya subscription thread tidak hilang saat:
   *
   * - server restart
   * - PM2 restart
   * - deployment
   * - multiple instance
   */
  state: createMemoryState(),

  logger: "debug",
});

/**
 * ============================================================
 * SUBSCRIBE THREAD
 * ============================================================
 *
 * Helper untuk first mention / fallback message.
 */
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
    /**
     * Kalau API isSubscribed tersedia,
     * jangan subscribe ulang.
     */
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
    /**
     * Subscription tidak boleh menggagalkan
     * pemrosesan first message.
     */
    console.warn("[COPILOT THREAD SUBSCRIBE FAILED]", {
      source,

      threadId,

      error,
    });
  }
}

/**
 * ============================================================
 * MAIN MESSAGE HANDLER
 * ============================================================
 *
 * Semua message akhirnya masuk ke function ini.
 *
 * Digunakan oleh:
 *
 * - Direct Message
 * - First Mention
 * - Subscribed Message
 * - First Message Fallback
 */
async function handleCopilotMessage(thread: any, message: any) {
  const startedAt = Date.now();

  const threadId = thread?.id ?? null;

  const incomingMessageId = message?.id ?? null;

  const text = String(message?.text ?? "").trim();

  const resourceId =
    message?.author?.userId ?? message?.author?.id ?? "copilot-user";

  console.log("[COPILOT MESSAGE RECEIVED]", {
    threadId,

    channelId: thread?.channelId ?? null,

    isDM: thread?.isDM ?? null,

    messageId: incomingMessageId,

    isMention: message?.isMention ?? null,

    userId: resourceId,

    userName: message?.author?.userName ?? message?.author?.fullName ?? null,

    textLength: text.length,

    preview: text.slice(0, 200),
  });

  /**
   * ==========================================================
   * VALIDATE THREAD
   * ==========================================================
   */
  if (!threadId) {
    console.error("[COPILOT INVALID THREAD]", {
      hasThread: Boolean(thread),

      hasMessage: Boolean(message),

      messageId: incomingMessageId,
    });

    return;
  }

  /**
   * Message ID tidak wajib.
   */
  if (!incomingMessageId) {
    console.warn("[COPILOT MESSAGE WITHOUT ID]", {
      threadId,

      textLength: text.length,
    });
  }

  /**
   * ==========================================================
   * EMPTY MESSAGE
   * ==========================================================
   */
  if (!text) {
    try {
      const sent = await thread.post("Maaf, pertanyaan tidak terbaca.");

      console.log("[COPILOT EMPTY RESPONSE SENT]", {
        threadId,

        incomingMessageId,

        sentMessageId: sent?.id ?? null,

        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error("[COPILOT EMPTY RESPONSE FAILED]", {
        threadId,

        incomingMessageId,

        error,
      });
    }

    return;
  }

  try {
    /**
     * ========================================================
     * TYPING INDICATOR
     * ========================================================
     */
    try {
      if (typeof thread?.startTyping === "function") {
        await thread.startTyping();
      }
    } catch (typingError) {
      console.warn("[COPILOT TYPING INDICATOR FAILED]", {
        threadId,

        typingError,
      });
    }

    /**
     * ========================================================
     * CONVERSATION IDENTITY
     * ========================================================
     *
     * Satu Teams/Copilot thread
     * menjadi satu Mastra conversation.
     */
    const conversationId = threadId;

    console.log("[COPILOT AGENT START]", {
      conversationId,

      threadId,

      resourceId,

      incomingMessageId,

      textLength: text.length,
    });

    /**
     * ========================================================
     * RUN MASTRA AGENT
     * ========================================================
     */
    const result = await runAgent({
      agentId: "sales",

      modelMode: "cloud",

      message: text,

      conversationId,

      threadId,

      resourceId,

      context: {
        channel: {
          platform: "teams-copilot",

          channelId: thread?.channelId ?? "copilot",

          threadId,

          userId: resourceId,

          /**
           * Internal metadata saja.
           */
          messageId: incomingMessageId ?? undefined,
        },
      },
    });

    const answer = String(result?.text ?? "").trim();

    if (!answer) {
      throw new Error("Agent returned empty response");
    }

    console.log("[COPILOT AGENT RESPONSE]", {
      conversationId,

      textLength: answer.length,

      preview: answer.slice(0, 200),

      toolsUsed: result?.toolsUsed?.map((item: any) => item?.tool) ?? [],
    });

    /**
     * ========================================================
     * SEND RESPONSE
     * ========================================================
     */
    const sent = await thread.post(answer);

    console.log("[COPILOT RESPONSE SENT]", {
      conversationId,

      threadId,

      incomingMessageId,

      sentMessageExists: Boolean(sent),

      sentMessageId: sent?.id ?? null,

      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[COPILOT ERROR]", {
      threadId,

      incomingMessageId,

      durationMs: Date.now() - startedAt,

      error,
    });

    try {
      const sent = await thread.post(
        "Maaf, terjadi kesalahan saat memproses permintaan.",
      );

      console.log("[COPILOT ERROR RESPONSE SENT]", {
        threadId,

        incomingMessageId,

        sentMessageId: sent?.id ?? null,

        durationMs: Date.now() - startedAt,
      });
    } catch (sendError) {
      console.error("[COPILOT ERROR RESPONSE FAILED]", {
        threadId,

        incomingMessageId,

        sendError,
      });
    }
  }
}

/**
 * ============================================================
 * 1. DIRECT MESSAGE
 * ============================================================
 *
 * Routing priority paling tinggi di Chat SDK.
 *
 * Contoh:
 *
 * User
 *   ↓
 * Teams App
 *   ↓
 * Personal Chat
 *   ↓
 * EON AI
 */
if (typeof (copilotBot as any).onDirectMessage === "function") {
  (copilotBot as any).onDirectMessage(async (thread: any, message: any) => {
    console.log("[COPILOT DIRECT MESSAGE]", {
      threadId: thread?.id ?? null,

      messageId: message?.id ?? null,

      isMention: message?.isMention ?? null,
    });

    await handleCopilotMessage(thread, message);
  });
}

/**
 * ============================================================
 * 2. FIRST MENTION
 * ============================================================
 *
 * Contoh:
 *
 * @EON AI berapa stok EONWASH 500?
 *
 * Setelah mention pertama:
 *
 * thread.subscribe()
 *
 * sehingga follow-up berikutnya masuk
 * onSubscribedMessage.
 */
copilotBot.onNewMention(async (thread: any, message: any) => {
  console.log("[COPILOT NEW MENTION]", {
    threadId: thread?.id ?? null,

    messageId: message?.id ?? null,

    isMention: message?.isMention ?? null,
  });

  await subscribeCopilotThread(thread, "new-mention");

  await handleCopilotMessage(thread, message);
});

/**
 * ============================================================
 * 3. SUBSCRIBED MESSAGE
 * ============================================================
 *
 * Follow-up setelah thread berhasil subscribe.
 */
if (typeof (copilotBot as any).onSubscribedMessage === "function") {
  (copilotBot as any).onSubscribedMessage(async (thread: any, message: any) => {
    console.log("[COPILOT SUBSCRIBED MESSAGE]", {
      threadId: thread?.id ?? null,

      messageId: message?.id ?? null,

      isMention: message?.isMention ?? null,
    });

    await handleCopilotMessage(thread, message);
  });
}

/**
 * ============================================================
 * 4. FIRST MESSAGE FALLBACK
 * ============================================================
 *
 * INI BAGIAN PENTING UNTUK COPILOT INSIDE TEAMS.
 *
 * Chat SDK routing:
 *
 * Direct Message
 *      ↓
 * onDirectMessage
 *
 * sudah subscribed
 *      ↓
 * onSubscribedMessage
 *
 * mention
 *      ↓
 * onNewMention
 *
 * BUKAN semua di atas
 *      ↓
 * onNewMessage
 *
 *
 * Jadi handler ini tidak seharusnya menyebabkan
 * duplicate processing.
 *
 * Ini menangkap kasus:
 *
 * Copilot Teams
 *      ↓
 * message masuk
 *      ↓
 * bukan dianggap DM
 *      ↓
 * bukan dianggap mention
 *      ↓
 * thread belum subscribed
 *      ↓
 * FALLBACK DI SINI
 */
if (typeof (copilotBot as any).onNewMessage === "function") {
  (copilotBot as any).onNewMessage(
    /[\s\S]+/,

    async (thread: any, message: any) => {
      console.log("[COPILOT NEW MESSAGE FALLBACK]", {
        threadId: thread?.id ?? null,

        messageId: message?.id ?? null,

        isDM: thread?.isDM ?? null,

        isMention: message?.isMention ?? null,

        textLength: String(message?.text ?? "").length,
      });

      /**
       * Karena ini first message pada
       * unsubscribed thread,
       * subscribe agar message berikutnya
       * masuk ke onSubscribedMessage.
       */
      await subscribeCopilotThread(thread, "new-message-fallback");

      await handleCopilotMessage(thread, message);
    },
  );
}
