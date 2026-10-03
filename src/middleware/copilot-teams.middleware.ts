import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { copilotBot } from "../services/teams/copilot.bot.js";
import { registerCopilotBackgroundTask } from "../services/teams/copilot-background-tasks.service.js";
import {
  markCopilotFailed,
  markCopilotWebhookResponse,
  recordCopilotIngressReceived,
} from "../services/teams/copilot-ingress.service.js";

type TeamsActivity = {
  type?: string;
  text?: string;
  id?: string;
  channelId?: string;
  serviceUrl?: string;

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

function isCopilotActivity(activity: TeamsActivity): boolean {
  const productContext = String(activity?.channelData?.productContext ?? "")
    .trim()
    .toUpperCase();

  if (productContext === "COPILOT") {
    return true;
  }

  return Boolean(
    activity?.entities?.some((entity) => {
      const entityType = String(entity?.type ?? "").trim().toLowerCase();
      const entityId = String(entity?.id ?? "").trim().toUpperCase();

      return entityType === "productinfo" && entityId === "COPILOT";
    }),
  );
}

/**
 * Convert Express Request into the Web Request expected by Chat SDK.
 */
function createWebRequest(req: ExpressRequest): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }

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
 *
 * Critical detail: do NOT await the AI agent inside the inbound Bot Framework
 * HTTP request. Chat SDK's waitUntil registers the long-running handler and
 * allows the adapter to acknowledge the webhook immediately.
 */
export async function copilotTeamsMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
) {
  const activity = (req.body ?? {}) as TeamsActivity;

  console.log("[TEAMS ACTIVITY CHECK]", {
    type: activity?.type ?? null,
    activityId: activity?.id ?? null,
    channelId: activity?.channelId ?? null,
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

  if (!isCopilotActivity(activity)) {
    console.log("[NOT COPILOT - PASS THROUGH]", {
      type: activity?.type ?? null,
      activityId: activity?.id ?? null,
      channelId: activity?.channelId ?? null,
      conversationId: activity?.conversation?.id ?? null,
      productContext: activity?.channelData?.productContext ?? null,
    });

    return next();
  }

  const activityId = activity?.id ?? null;
  const conversationId = activity?.conversation?.id ?? null;

  console.log("[COPILOT INTERCEPTED]", {
    type: activity?.type ?? null,
    activityId,
    channelId: activity?.channelId ?? null,
    conversationId,
    conversationType: activity?.conversation?.conversationType ?? null,
    isGroup: activity?.conversation?.isGroup ?? null,
    productContext: activity?.channelData?.productContext ?? null,
    tenantId: activity?.channelData?.tenant?.id ?? null,
    textLength: String(activity?.text ?? "").length,
  });

  // Persist the ingress independently. A diagnostics write must never hold the
  // Bot Framework HTTP request open.
  registerCopilotBackgroundTask(recordCopilotIngressReceived(activity), {
    activityId,
    conversationId,
  });

  try {
    const webRequest = createWebRequest(req);

    console.log("[COPILOT CHAT SDK START]", {
      activityId,
      conversationId,
      type: activity?.type ?? null,
    });

    const webhookStartedAt = Date.now();

    const webResponse = await copilotBot.webhooks.teams(webRequest, {
      waitUntil: (task: Promise<unknown>) => {
        registerCopilotBackgroundTask(task, {
          activityId,
          conversationId,
        });
      },
    });

    const body = await webResponse.text();

    console.log("[COPILOT WEBHOOK RESPONSE]", {
      activityId,
      conversationId,
      status: webResponse.status,
      durationMs: Date.now() - webhookStartedAt,
      responseBody:
        webResponse.status >= 400 ? body.slice(0, 2000) : undefined,
    });

    registerCopilotBackgroundTask(
      markCopilotWebhookResponse(
        {
          conversationId,
          activityId,
        },
        webResponse.status,
        webResponse.status >= 400 ? body : null,
      ),
      {
        activityId,
        conversationId,
      },
    );

    res.status(webResponse.status);

    webResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();

      if (lowerKey === "content-length" || lowerKey === "transfer-encoding") {
        return;
      }

      res.setHeader(key, value);
    });

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
            activityId,
            conversationId,
          }
        : {
            error,
            activityId,
            conversationId,
          },
    );

    registerCopilotBackgroundTask(
      markCopilotFailed({
        conversationId,
        activityId,
        stage: "webhook",
        error,
      }),
      {
        activityId,
        conversationId,
      },
    );

    return res.status(500).json({
      error: "Copilot webhook processing failed",
    });
  }
}
