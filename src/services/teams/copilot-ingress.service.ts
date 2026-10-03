import { postgresPool } from "../database/postgres.js";

type IncomingActivity = {
  id?: string;
  type?: string;
  channelId?: string;
  text?: string;
  from?: {
    id?: string;
    name?: string;
  };
  conversation?: {
    id?: string;
  };
  channelData?: {
    productContext?: string;
    tenant?: {
      id?: string;
    };
  };
};

type IngressKey = {
  conversationId?: string | null;
  activityId?: string | null;
};

type ProcessingInput = IngressKey & {
  requestId?: string | null;
  stage: string;
  skippedCount?: number;
};

type FailureInput = IngressKey & {
  requestId?: string | null;
  stage: string;
  error: unknown;
};

let ensureTablePromise: Promise<void> | null = null;

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: null,
  };
}

async function ensureTable(): Promise<void> {
  if (ensureTablePromise) {
    return ensureTablePromise;
  }

  ensureTablePromise = (async () => {
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS public.eon_copilot_ingress (
        id BIGSERIAL PRIMARY KEY,
        conversation_id TEXT,
        activity_id TEXT,
        channel_id TEXT,
        activity_type TEXT,
        tenant_id TEXT,
        product_context TEXT,
        user_id TEXT,
        user_name TEXT,
        message_text TEXT,
        request_id TEXT,
        status TEXT NOT NULL DEFAULT 'received',
        stage TEXT NOT NULL DEFAULT 'webhook',
        skipped_count INTEGER NOT NULL DEFAULT 0,
        response_message_id TEXT,
        webhook_status INTEGER,
        webhook_response_body TEXT,
        error_name TEXT,
        error_message TEXT,
        error_stack TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processing_started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT eon_copilot_ingress_activity_unique
          UNIQUE (conversation_id, activity_id)
      )
    `);

    await postgresPool.query(`
      CREATE INDEX IF NOT EXISTS idx_eon_copilot_ingress_received_at
      ON public.eon_copilot_ingress (received_at DESC)
    `);

    await postgresPool.query(`
      CREATE INDEX IF NOT EXISTS idx_eon_copilot_ingress_status
      ON public.eon_copilot_ingress (status, received_at DESC)
    `);
  })().catch((error) => {
    ensureTablePromise = null;
    throw error;
  });

  return ensureTablePromise;
}

async function bestEffort(
  operation: string,
  callback: () => Promise<void>,
): Promise<void> {
  try {
    await ensureTable();
    await callback();
  } catch (error) {
    // Diagnostics must never be the reason a Copilot turn fails.
    console.warn("[COPILOT INGRESS LOGGING FAILED]", {
      operation,
      error,
    });
  }
}

export async function initializeCopilotIngress(): Promise<void> {
  await bestEffort("initialize", async () => undefined);
}

export async function recordCopilotIngressReceived(
  activity: IncomingActivity,
): Promise<void> {
  const conversationId = activity?.conversation?.id ?? null;
  const activityId = activity?.id ?? null;

  await bestEffort("received", async () => {
    await postgresPool.query(
      `
        INSERT INTO public.eon_copilot_ingress (
          conversation_id,
          activity_id,
          channel_id,
          activity_type,
          tenant_id,
          product_context,
          user_id,
          user_name,
          message_text,
          status,
          stage,
          received_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'received','webhook',NOW(),NOW())
        ON CONFLICT (conversation_id, activity_id)
        DO UPDATE SET
          channel_id = EXCLUDED.channel_id,
          activity_type = EXCLUDED.activity_type,
          tenant_id = EXCLUDED.tenant_id,
          product_context = EXCLUDED.product_context,
          user_id = EXCLUDED.user_id,
          user_name = EXCLUDED.user_name,
          message_text = EXCLUDED.message_text,
          updated_at = NOW()
      `,
      [
        conversationId,
        activityId,
        activity?.channelId ?? null,
        activity?.type ?? null,
        activity?.channelData?.tenant?.id ?? null,
        activity?.channelData?.productContext ?? null,
        activity?.from?.id ?? null,
        activity?.from?.name ?? null,
        activity?.text ?? null,
      ],
    );
  });
}

export async function markCopilotWebhookResponse(
  key: IngressKey,
  status: number,
  responseBody?: string | null,
): Promise<void> {
  if (!key.conversationId || !key.activityId) {
    return;
  }

  await bestEffort("webhook-response", async () => {
    await postgresPool.query(
      `
        INSERT INTO public.eon_copilot_ingress (
          conversation_id,
          activity_id,
          webhook_status,
          webhook_response_body,
          received_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,NOW(),NOW())
        ON CONFLICT (conversation_id, activity_id)
        DO UPDATE SET
          webhook_status = EXCLUDED.webhook_status,
          webhook_response_body = EXCLUDED.webhook_response_body,
          updated_at = NOW()
      `,
      [
        key.conversationId,
        key.activityId,
        status,
        responseBody ? responseBody.slice(0, 4000) : null,
      ],
    );
  });
}

export async function markCopilotProcessing(
  input: ProcessingInput,
): Promise<void> {
  if (!input.conversationId || !input.activityId) {
    return;
  }

  await bestEffort("processing", async () => {
    await postgresPool.query(
      `
        INSERT INTO public.eon_copilot_ingress (
          conversation_id,
          activity_id,
          request_id,
          status,
          stage,
          skipped_count,
          received_at,
          processing_started_at,
          updated_at
        )
        VALUES ($1,$2,$3,'processing',$4,$5,NOW(),NOW(),NOW())
        ON CONFLICT (conversation_id, activity_id)
        DO UPDATE SET
          request_id = COALESCE(EXCLUDED.request_id, public.eon_copilot_ingress.request_id),
          status = 'processing',
          stage = EXCLUDED.stage,
          skipped_count = EXCLUDED.skipped_count,
          processing_started_at = COALESCE(
            public.eon_copilot_ingress.processing_started_at,
            NOW()
          ),
          updated_at = NOW()
      `,
      [
        input.conversationId,
        input.activityId,
        input.requestId ?? null,
        input.stage,
        input.skippedCount ?? 0,
      ],
    );
  });
}

export async function markCopilotStage(
  input: IngressKey & { requestId?: string | null; stage: string },
): Promise<void> {
  if (!input.conversationId || !input.activityId) {
    return;
  }

  await bestEffort("stage", async () => {
    await postgresPool.query(
      `
        UPDATE public.eon_copilot_ingress
        SET
          request_id = COALESCE($3, request_id),
          stage = $4,
          updated_at = NOW()
        WHERE conversation_id = $1
          AND activity_id = $2
      `,
      [
        input.conversationId,
        input.activityId,
        input.requestId ?? null,
        input.stage,
      ],
    );
  });
}

export async function markCopilotCompleted(
  input: IngressKey & {
    requestId?: string | null;
    responseMessageId?: string | null;
  },
): Promise<void> {
  if (!input.conversationId || !input.activityId) {
    return;
  }

  await bestEffort("completed", async () => {
    await postgresPool.query(
      `
        UPDATE public.eon_copilot_ingress
        SET
          request_id = COALESCE($3, request_id),
          status = 'completed',
          stage = 'response-sent',
          response_message_id = $4,
          error_name = NULL,
          error_message = NULL,
          error_stack = NULL,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE conversation_id = $1
          AND activity_id = $2
      `,
      [
        input.conversationId,
        input.activityId,
        input.requestId ?? null,
        input.responseMessageId ?? null,
      ],
    );
  });
}

export async function markCopilotRejected(
  input: IngressKey & {
    requestId?: string | null;
    reason: string;
    responseMessageId?: string | null;
  },
): Promise<void> {
  if (!input.conversationId || !input.activityId) {
    return;
  }

  await bestEffort("rejected", async () => {
    await postgresPool.query(
      `
        UPDATE public.eon_copilot_ingress
        SET
          request_id = COALESCE($3, request_id),
          status = 'rejected',
          stage = 'validation',
          response_message_id = $4,
          error_name = 'ValidationError',
          error_message = $5,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE conversation_id = $1
          AND activity_id = $2
      `,
      [
        input.conversationId,
        input.activityId,
        input.requestId ?? null,
        input.responseMessageId ?? null,
        input.reason,
      ],
    );
  });
}

export async function markCopilotFailed(input: FailureInput): Promise<void> {
  if (!input.conversationId || !input.activityId) {
    return;
  }

  const details = errorDetails(input.error);

  await bestEffort("failed", async () => {
    await postgresPool.query(
      `
        INSERT INTO public.eon_copilot_ingress (
          conversation_id,
          activity_id,
          request_id,
          status,
          stage,
          error_name,
          error_message,
          error_stack,
          received_at,
          completed_at,
          updated_at
        )
        VALUES ($1,$2,$3,'failed',$4,$5,$6,$7,NOW(),NOW(),NOW())
        ON CONFLICT (conversation_id, activity_id)
        DO UPDATE SET
          request_id = COALESCE(EXCLUDED.request_id, public.eon_copilot_ingress.request_id),
          status = 'failed',
          stage = EXCLUDED.stage,
          error_name = EXCLUDED.error_name,
          error_message = EXCLUDED.error_message,
          error_stack = EXCLUDED.error_stack,
          completed_at = NOW(),
          updated_at = NOW()
      `,
      [
        input.conversationId,
        input.activityId,
        input.requestId ?? null,
        input.stage,
        details.name,
        details.message.slice(0, 4000),
        details.stack?.slice(0, 12000) ?? null,
      ],
    );
  });
}
