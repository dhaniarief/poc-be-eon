import { postgresPool } from "../database/postgres.js";

const CONTEXT_TTL_HOURS = 24;

export type TeamsOpportunityContextKey = {
  tenantId: string;
  platform: string;
  channelId: string;
  threadId?: string;
  userId: string;
};

export type ActiveOpportunityContext = {
  opportunityId: string;
  opportunityNo: string;
  lastUsedAt: Date;
};

export async function setActiveOpportunityContext(
  key: TeamsOpportunityContextKey,
  opportunity: {
    opportunityId: string;
    opportunityNo: string;
  },
): Promise<void> {
  await postgresPool.query(
    `
      INSERT INTO eon_ai.teams_conversation_context (
        tenant_id,
        platform,
        channel_id,
        thread_id,
        user_id,
        opportunity_id,
        opportunity_no,
        last_used_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())

      ON CONFLICT (
        tenant_id,
        platform,
        channel_id,
        thread_id,
        user_id
      )
      DO UPDATE SET
        opportunity_id = EXCLUDED.opportunity_id,
        opportunity_no = EXCLUDED.opportunity_no,
        last_used_at = NOW(),
        updated_at = NOW()
    `,
    [
      key.tenantId,
      key.platform,
      key.channelId,
      key.threadId ?? "",
      key.userId,
      opportunity.opportunityId,
      opportunity.opportunityNo,
    ],
  );
}

export async function getActiveOpportunityContext(
  key: TeamsOpportunityContextKey,
): Promise<ActiveOpportunityContext | null> {
  const result = await postgresPool.query<{
    opportunity_id: string;
    opportunity_no: string;
    last_used_at: Date;
  }>(
    `
      SELECT
        opportunity_id,
        opportunity_no,
        last_used_at
      FROM eon_ai.teams_conversation_context
      WHERE tenant_id = $1
        AND platform = $2
        AND channel_id = $3
        AND thread_id = $4
        AND user_id = $5
        AND last_used_at >= NOW() - ($6 * INTERVAL '1 hour')
      LIMIT 1
    `,
    [
      key.tenantId,
      key.platform,
      key.channelId,
      key.threadId ?? "",
      key.userId,
      CONTEXT_TTL_HOURS,
    ],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await postgresPool.query(
    `
      UPDATE eon_ai.teams_conversation_context
      SET
        last_used_at = NOW(),
        updated_at = NOW()
      WHERE tenant_id = $1
        AND platform = $2
        AND channel_id = $3
        AND thread_id = $4
        AND user_id = $5
    `,
    [key.tenantId, key.platform, key.channelId, key.threadId ?? "", key.userId],
  );

  return {
    opportunityId: row.opportunity_id,
    opportunityNo: row.opportunity_no,
    lastUsedAt: row.last_used_at,
  };
}

export async function clearActiveOpportunityContext(
  key: TeamsOpportunityContextKey,
): Promise<void> {
  await postgresPool.query(
    `
      DELETE FROM eon_ai.teams_conversation_context
      WHERE tenant_id = $1
        AND platform = $2
        AND channel_id = $3
        AND thread_id = $4
        AND user_id = $5
    `,
    [key.tenantId, key.platform, key.channelId, key.threadId ?? "", key.userId],
  );
}
