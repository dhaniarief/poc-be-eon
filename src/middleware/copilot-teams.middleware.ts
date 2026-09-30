import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { copilotBot } from "../services/teams/copilot.bot.js";

type TeamsActivity = {
  type?: string;
  text?: string;

  id?: string;

  from?: {
    id?: string;
    name?: string;
  };

  recipient?: {
    id?: string;
    name?: string;
  };

  entities?: Array<{
    type?: string;
    id?: string;

    mentioned?: {
      id?: string;
      name?: string;
    };
  }>;

  conversation?: {
    id?: string;
    conversationType?: string;
    isGroup?: boolean;
  };

  channelData?: {
    productContext?: string;

    tenant?: {
      id?: string;
    };
  };
};

/**
 * ============================================================
 * DETECT MICROSOFT COPILOT ACTIVITY
 * ============================================================
 *
 * Jangan case-sensitive.
 *
 * Payload Microsoft dapat membawa:
 *
 * COPILOT
 * Copilot
 * copilot
 *
 * tergantung surface / client yang mengirim activity.
 */
function isCopilotActivity(activity: TeamsActivity): boolean {
  /**
   * ----------------------------------------------------------
   * CHECK #1
   * channelData.productContext
   * ----------------------------------------------------------
   */
  const productContext = String(activity?.channelData?.productContext ?? "")
    .trim()
    .toUpperCase();

  if (productContext === "COPILOT") {
    return true;
  }

  /**
   * ----------------------------------------------------------
   * CHECK #2
   * ProductInfo entity
   * ----------------------------------------------------------
   */
  const hasCopilotProductInfo = Boolean(
    activity?.entities?.some((entity) => {
      const entityType = String(entity?.type ?? "")
        .trim()
        .toLowerCase();

      const entityId = String(entity?.id ?? "")
        .trim()
        .toUpperCase();

      return entityType === "productinfo" && entityId === "COPILOT";
    }),
  );

  if (hasCopilotProductInfo) {
    return true;
  }

  return false;
}

/**
 * ============================================================
 * EXPRESS REQUEST -> WEB REQUEST
 * ============================================================
 *
 * Chat SDK menggunakan Web API Request,
 * bukan Express Request.
 */
function createWebRequest(req: ExpressRequest): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }

    /**
     * Jangan copy content-length.
     *
     * Body dibuat ulang menggunakan JSON.stringify(req.body),
     * sehingga panjang body mungkin berbeda.
     */
    if (key.toLowerCase() === "content-length") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, String(value));
    }
  }

  headers.set("content-type", "application/json");

  /**
   * Support reverse proxy / dev tunnel / nginx.
   */
  const forwardedProto = req.headers["x-forwarded-proto"];

  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim() || req.protocol
      : req.protocol;

  const forwardedHost = req.headers["x-forwarded-host"];

  const host =
    typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : req.get("host");

  const safeHost = host || "localhost";

  const url = `${protocol}://${safeHost}${req.originalUrl}`;

  return new Request(url, {
    method: req.method || "POST",

    headers,

    body: JSON.stringify(req.body ?? {}),
  });
}

/**
 * ============================================================
 * COPILOT MIDDLEWARE
 * ============================================================
 */
export async function copilotTeamsMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) {
  const activity = (req.body ?? {}) as TeamsActivity;

  /**
   * ----------------------------------------------------------
   * DEBUG INCOMING ACTIVITY
   * ----------------------------------------------------------
   *
   * Log ini penting untuk mengetahui perbedaan payload antara:
   *
   * 1. Teams direct chat
   * 2. Copilot web
   * 3. Copilot inside Teams
   */
  console.log("[TEAMS ACTIVITY CHECK]", {
    type: activity?.type ?? null,

    activityId: activity?.id ?? null,

    conversationId: activity?.conversation?.id ?? null,

    conversationType: activity?.conversation?.conversationType ?? null,

    isGroup: activity?.conversation?.isGroup ?? null,

    productContext: activity?.channelData?.productContext ?? null,

    entityTypes:
      activity?.entities?.map((entity) => ({
        type: entity?.type ?? null,
        id: entity?.id ?? null,
      })) ?? [],

    fromId: activity?.from?.id ?? null,

    recipientId: activity?.recipient?.id ?? null,

    textLength: String(activity?.text ?? "").length,
  });

  /**
   * ==========================================================
   * BUKAN COPILOT
   * ==========================================================
   *
   * Teams biasa tetap diteruskan ke middleware/router
   * berikutnya.
   */
  if (!isCopilotActivity(activity)) {
    console.log("[NOT COPILOT - PASS THROUGH]", {
      type: activity?.type ?? null,

      activityId: activity?.id ?? null,

      conversationId: activity?.conversation?.id ?? null,

      productContext: activity?.channelData?.productContext ?? null,
    });

    return next();
  }

  /**
   * ==========================================================
   * COPILOT DETECTED
   * ==========================================================
   */
  console.log("[COPILOT INTERCEPTED]", {
    type: activity?.type ?? null,

    activityId: activity?.id ?? null,

    text: activity?.text ?? null,

    conversationId: activity?.conversation?.id ?? null,

    conversationType: activity?.conversation?.conversationType ?? null,

    isGroup: activity?.conversation?.isGroup ?? null,

    productContext: activity?.channelData?.productContext ?? null,

    tenantId: activity?.channelData?.tenant?.id ?? null,
  });

  try {
    /**
     * Convert Express Request menjadi standard Request
     * untuk Chat SDK.
     */
    const webRequest = createWebRequest(req);

    console.log("[COPILOT CHAT SDK START]", {
      activityId: activity?.id ?? null,

      conversationId: activity?.conversation?.id ?? null,

      type: activity?.type ?? null,
    });

    /**
     * ========================================================
     * CHAT SDK WEBHOOK
     * ========================================================
     *
     * Chat SDK akan menentukan handler:
     *
     * Direct Message
     *      ↓
     * onDirectMessage
     *
     * Subscribed Thread
     *      ↓
     * onSubscribedMessage
     *
     * First Mention
     *      ↓
     * onNewMention
     *
     * Message biasa pada unsubscribed thread
     *      ↓
     * onNewMessage
     */
    const webResponse = await copilotBot.webhooks.teams(webRequest);

    console.log("[COPILOT WEBHOOK RESPONSE]", {
      activityId: activity?.id ?? null,

      conversationId: activity?.conversation?.id ?? null,

      status: webResponse.status,
    });

    /**
     * Copy HTTP status dari Chat SDK.
     */
    res.status(webResponse.status);

    /**
     * Copy response headers.
     */
    webResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();

      /**
       * Biarkan Express menentukan sendiri.
       */
      if (lowerKey === "content-length" || lowerKey === "transfer-encoding") {
        return;
      }

      res.setHeader(key, value);
    });

    /**
     * Copy response body.
     */
    const body = await webResponse.text();

    if (body) {
      return res.send(body);
    }

    return res.end();
  } catch (error) {
    console.error(
      "[COPILOT WEBHOOK ERROR]",
      error instanceof Error
        ? {
            message: error.message,

            name: error.name,

            stack: error.stack,

            activityId: activity?.id ?? null,

            conversationId: activity?.conversation?.id ?? null,
          }
        : {
            error,

            activityId: activity?.id ?? null,

            conversationId: activity?.conversation?.id ?? null,
          },
    );

    return res.status(500).json({
      error: "Copilot webhook processing failed",
    });
  }
}
