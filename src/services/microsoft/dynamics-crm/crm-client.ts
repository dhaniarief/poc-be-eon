import { env } from "../../../config/env.js";
import { writeBusinessEvent } from "../../../logging/operation-logger.js";
import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

export async function dynamicsGet<T>(endpoint: string): Promise<T> {
  const token = await getMicrosoftAccessToken({
    cacheKey: "crm",
    scope: `${env.CRM_BASE_URL}/.default`,
  });

  const response = await fetch(`${env.CRM_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: 'odata.include-annotations="*"',
    },
  });

  if (!response.ok) {
    writeBusinessEvent("error", "INTEGRATION_ERROR", {
      source: "crm",
      operation: "GET",
      statusCode: response.status,
    });

    throw new Error(`Dynamics API failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
