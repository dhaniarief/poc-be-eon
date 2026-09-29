import { env } from "../../../config/env.js";
import { writeBusinessEvent } from "../../../logging/operation-logger.js";
import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

export async function finopsGet<T>(
  entity: string,
  params?: Record<string, string>,
): Promise<T> {
  const token = await getMicrosoftAccessToken({
    cacheKey: "finops",
    scope: `${env.FINOPS_BASE_URL}/.default`,
  });

  const url = new URL(`${env.FINOPS_BASE_URL}/data/${entity}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    writeBusinessEvent("error", "INTEGRATION_ERROR", {
      source: "finops",
      operation: entity,
      statusCode: response.status,
    });

    throw new Error(`FinOps API failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
