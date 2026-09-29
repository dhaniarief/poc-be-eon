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

/**
 * Main handler untuk semua message Teams.
 *
 * Digunakan oleh:
 * - Direct message / personal chat
 * - First mention
 * - Follow-up message setelah subscribe
 */
async function handleCopilotMessage(thread: any, message: any) {
  const startedAt = Date.now();

  /**
   * Jangan langsung akses:
   *
   * message.id
   * thread.id
   *
   * karena pada activity tertentu metadata bisa saja
   * belum lengkap.
   */
  const threadId = thread?.id ?? null;

  const incomingMessageId = message?.id ?? null;

  const text = String(message?.text ?? "").trim();

  const resourceId =
    message?.author?.userId ?? message?.author?.id ?? "copilot-user";

  console.log("[COPILOT MESSAGE RECEIVED]", {
    threadId,

    channelId: thread?.channelId ?? null,

    messageId: incomingMessageId,

    userId: resourceId,

    userName: message?.author?.userName ?? null,

    textLength: text.length,

    preview: text.slice(0, 200),
  });

  /**
   * Thread ID wajib ada karena digunakan juga
   * sebagai conversation ID Mastra.
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
   * Message ID kita log sebagai warning saja.
   *
   * Jangan menggagalkan request hanya karena
   * message.id tidak tersedia.
   */
  if (!incomingMessageId) {
    console.warn("[COPILOT MESSAGE WITHOUT ID]", {
      threadId,

      textLength: text.length,
    });
  }

  /**
   * Message kosong.
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
      console.error("[COPILOT EMPTY RESPONSE FAILED]", error);
    }

    return;
  }

  try {
    /**
     * Optional.
     *
     * Tidak perlu menggagalkan proses jika typing
     * indicator tidak tersedia / gagal.
     */
    try {
      if (typeof thread.startTyping === "function") {
        await thread.startTyping();
      }
    } catch (typingError) {
      console.warn("[COPILOT TYPING INDICATOR FAILED]", typingError);
    }

    /**
     * thread.id menjadi identity utama conversation.
     *
     * Teams Thread
     *      ↓
     * Mastra conversation
     *      ↓
     * Mastra memory thread
     */
    const conversationId = threadId;

    console.log("[COPILOT AGENT START]", {
      conversationId,

      threadId,

      resourceId,

      incomingMessageId,
    });

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
           * Aman walaupun undefined.
           *
           * Ini hanya metadata untuk internal context,
           * bukan Microsoft activity ID.
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
     * Kirim jawaban kembali ke Teams.
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
 * DIRECT MESSAGE / PERSONAL CHAT
 * ============================================================
 *
 * Cocok untuk:
 *
 * User
 *   ↓
 * Teams
 *   ↓
 * Apps
 *   ↓
 * EON AI
 *
 * Kalau versi Chat SDK kamu support onDirectMessage,
 * gunakan handler ini.
 */
if (typeof (copilotBot as any).onDirectMessage === "function") {
  (copilotBot as any).onDirectMessage(async (thread: any, message: any) => {
    console.log("[COPILOT DIRECT MESSAGE]", {
      threadId: thread?.id ?? null,

      messageId: message?.id ?? null,
    });

    await handleCopilotMessage(thread, message);
  });
}

/**
 * ============================================================
 * FIRST MENTION
 * ============================================================
 *
 * Misalnya:
 *
 * @EON AI berapa stok product XXX?
 *
 * Pada message pertama, kita subscribe ke thread supaya
 * follow-up berikutnya bisa diterima.
 */
copilotBot.onNewMention(async (thread: any, message: any) => {
  console.log("[COPILOT NEW MENTION]", {
    threadId: thread?.id ?? null,

    messageId: message?.id ?? null,
  });

  /**
   * Subscribe dilakukan terpisah supaya kalau gagal,
   * first message tetap kita proses.
   */
  try {
    if (typeof thread.subscribe === "function") {
      await thread.subscribe();

      console.log("[COPILOT THREAD SUBSCRIBED]", {
        threadId: thread?.id ?? null,
      });
    }
  } catch (error) {
    console.warn("[COPILOT THREAD SUBSCRIBE FAILED]", {
      threadId: thread?.id ?? null,

      error,
    });
  }

  await handleCopilotMessage(thread, message);
});

/**
 * ============================================================
 * FOLLOW-UP MESSAGE
 * ============================================================
 *
 * Message setelah thread berhasil subscribe.
 */
if (typeof (copilotBot as any).onSubscribedMessage === "function") {
  (copilotBot as any).onSubscribedMessage(async (thread: any, message: any) => {
    console.log("[COPILOT SUBSCRIBED MESSAGE]", {
      threadId: thread?.id ?? null,

      messageId: message?.id ?? null,
    });

    await handleCopilotMessage(thread, message);
  });
}
