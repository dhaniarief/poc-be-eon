WITH messages AS (
    SELECT
        m.id,
        m.thread_id,
        m.role,
        m."createdAtZ",
        m."resourceId",
        m.content::jsonb AS content_json,

        COALESCE(
            NULLIF(m.content::jsonb ->> 'content', ''),
            (
                SELECT STRING_AGG(
                    p.part ->> 'text',
                    E'\n'
                    ORDER BY p.ordinality
                )
                FROM jsonb_array_elements(
                    COALESCE(
                        m.content::jsonb -> 'parts',
                        '[]'::jsonb
                    )
                ) WITH ORDINALITY AS p(part, ordinality)
                WHERE p.part ->> 'type' = 'text'
                  AND NULLIF(p.part ->> 'text', '') IS NOT NULL
            )
        ) AS message_text,

        COALESCE(
            m.content::jsonb
                -> 'providerMetadata'
                -> 'mastra'
                -> 'channels'
                -> 'teams'
                -> 'author'
                ->> 'fullName',

            m.content::jsonb
                -> 'providerMetadata'
                -> 'mastra'
                -> 'channels'
                -> 'teams'
                -> 'author'
                ->> 'userName',

            m.content::jsonb
                -> 'metadata'
                -> 'signal'
                -> 'attributes'
                ->> 'authorName',

            m."resourceId"
        ) AS user_name,

        CASE
            WHEN m."resourceId" LIKE 'teams:%'
                THEN 'Microsoft Teams'
            WHEN m."resourceId" = 'dev-user'
                THEN 'Development Web'
            WHEN m."resourceId" = 'sales-cloud-agent'
                THEN 'Sales Cloud'
            ELSE 'Other'
        END AS channel

    FROM mastra.mastra_messages m
),

assistant_messages AS (
    SELECT
        m.id,
        m.thread_id,
        m."createdAtZ",
        m."resourceId",
        m.content_json,
        m.message_text AS assistant_response
    FROM messages m
    WHERE m.role = 'assistant'
)

SELECT
    -- 1. Waktu user bertanya
    u.question_time,

    -- 2. Waktu AI selesai menjawab
    a."createdAtZ" AS answer_time,

    -- 3. Lama waktu jawab
    a."createdAtZ" - u.question_time AS response_time,

    -- Optional: dalam detik
    ROUND(
        EXTRACT(
            EPOCH FROM (
                a."createdAtZ" - u.question_time
            )
        )::numeric,
        2
    ) AS response_time_seconds,

    -- 4. User
    u.user_name,

    -- 5. Channel
    u.channel,

    -- 6. Resource
    a."resourceId" AS resource_id,

    -- 7. Thread
    a.thread_id,

    -- 8. Pertanyaan
    u.user_question,

    -- 9. Jawaban
    a.assistant_response,

    -- 10. Tool
    p.part
        -> 'toolInvocation'
        ->> 'toolName' AS tool_name,

    -- 11. Tool args
    p.part
        -> 'toolInvocation'
        -> 'args' AS tool_args,

    -- 12. Tool result
    p.part
        -> 'toolInvocation'
        -> 'result' AS tool_result,

    -- 13. Model
    a.content_json
        -> 'metadata'
        ->> 'modelId' AS model,

    -- 14. Provider
    a.content_json
        -> 'metadata'
        ->> 'provider' AS provider,

    -- 15. Trace ID
    a.content_json
        -> 'metadata'
        ->> 'traceId' AS trace_id

FROM assistant_messages a

LEFT JOIN LATERAL (
    SELECT
        m2."createdAtZ" AS question_time,
        m2.user_name,
        m2.channel,
        m2.message_text AS user_question

    FROM messages m2

    WHERE m2.thread_id = a.thread_id
      AND m2.role IN ('user', 'signal')
      AND m2."createdAtZ" <= a."createdAtZ"
      AND NULLIF(TRIM(m2.message_text), '') IS NOT NULL

    ORDER BY m2."createdAtZ" DESC
    LIMIT 1

) u ON TRUE

LEFT JOIN LATERAL jsonb_array_elements(
    COALESCE(
        a.content_json -> 'parts',
        '[]'::jsonb
    )
) AS p(part)
    ON p.part ->> 'type' = 'tool-invocation'

WHERE u.question_time IS NOT NULL

ORDER BY
    u.question_time DESC,
    tool_name;