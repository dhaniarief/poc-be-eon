import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { copilotBot } from "../services/teams/copilot.bot.js";

type TeamsActivity = {
  type?: string;
  text?: string;

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
 * Detect apakah request berasal dari
 * Microsoft Copilot.
 */
function isCopilotActivity(activity: TeamsActivity): boolean {
  /**
   * Dari log real kamu:
   *
   * channelData.productContext = "COPILOT"
   */
  if (activity.channelData?.productContext === "COPILOT") {
    return true;
  }

  /**
   * Copilot juga membawa:
   *
   * {
   *   type: "ProductInfo",
   *   id: "COPILOT"
   * }
   */
  return Boolean(
    activity.entities?.some(
      (entity) => entity.type === "ProductInfo" && entity.id === "COPILOT",
    ),
  );
}

/**
 * Convert Express Request
 * menjadi Web API Request.
 *
 * Chat SDK menggunakan Request,
 * bukan ExpressRequest.
 */
function createWebRequest(req: ExpressRequest): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }

    /**
     * Jangan copy content-length,
     * karena body akan dibuat ulang.
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
   * Kalau lewat dev tunnel / reverse proxy,
   * gunakan x-forwarded-proto.
   */
  const forwardedProto = req.headers["x-forwarded-proto"];

  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0].trim()
      : req.protocol;

  const host = req.get("host") ?? "localhost";

  const url = `${protocol}://${host}${req.originalUrl}`;

  return new Request(url, {
    method: "POST",

    headers,

    body: JSON.stringify(req.body),
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
  const activity = req.body as TeamsActivity;

  /**
   * ==========================================================
   * BUKAN COPILOT
   * ==========================================================
   *
   * Direct Teams tetap diproses
   * oleh agentRouter / Mastra Channels.
   */
  if (!isCopilotActivity(activity)) {
    return next();
  }

  console.log("[COPILOT INTERCEPTED]", {
    type: activity.type ?? null,

    text: activity.text ?? null,

    conversationId: activity.conversation?.id ?? null,

    conversationType: activity.conversation?.conversationType ?? null,

    isGroup: activity.conversation?.isGroup ?? null,

    productContext: activity.channelData?.productContext ?? null,
  });

  try {
    const webRequest = createWebRequest(req);

    /**
     * Ini menjalankan Chat SDK.
     *
     * Untuk message mention,
     * handler di:
     *
     * copilot.bot.ts
     *
     * akan terpanggil:
     *
     * copilotBot.onNewMention(...)
     */
    const webResponse = await copilotBot.webhooks.teams(webRequest);

    console.log("[COPILOT WEBHOOK RESPONSE]", {
      status: webResponse.status,
    });

    /**
     * Copy status response dari
     * Chat SDK ke Express.
     */
    res.status(webResponse.status);

    /**
     * Copy headers.
     */
    webResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();

      /**
       * Express biarkan menghitung
       * content-length sendiri.
       */
      if (lowerKey === "content-length" || lowerKey === "transfer-encoding") {
        return;
      }

      res.setHeader(key, value);
    });

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

            stack: error.stack,
          }
        : error,
    );

    return res.status(500).json({
      error: "Copilot webhook processing failed",
    });
  }
}
