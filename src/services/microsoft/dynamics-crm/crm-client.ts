import { env } from "../../../config/env.js";
import { writeBusinessEvent } from "../../../logging/operation-logger.js";
import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

type DynamicsRequestOptions = {
  signal?: AbortSignal;
};

type ODataCollectionResponse<T> = {
  value: T[];
  "@odata.nextLink"?: string;
};

function crmUrl(endpoint: string) {
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    return `${env.CRM_BASE_URL}${endpoint}`;
  }

  const requested = new URL(endpoint);
  const allowed = new URL(env.CRM_BASE_URL);

  if (requested.origin !== allowed.origin) {
    throw new Error("CRM pagination URL points to an unexpected host");
  }

  return requested.toString();
}

function buildSignal(upstream?: AbortSignal) {
  const requestTimeout = AbortSignal.timeout(env.CRM_REQUEST_TIMEOUT_MS);

  return upstream
    ? AbortSignal.any([upstream, requestTimeout])
    : requestTimeout;
}

export async function dynamicsGet<T>(
  endpoint: string,
  options: DynamicsRequestOptions = {},
): Promise<T> {
  const token = await getMicrosoftAccessToken({
    cacheKey: "crm",
    scope: `${env.CRM_BASE_URL}/.default`,
  });

  const signal = buildSignal(options.signal);

  const response = await fetch(crmUrl(endpoint), {
    method: "GET",

    signal,

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

export async function dynamicsGetAll<T>(
  endpoint: string,
  options: DynamicsRequestOptions = {},
): Promise<T[]> {
  const rows: T[] = [];

  let next: string | undefined = endpoint;

  let page = 0;

  while (next !== undefined) {
    if (options.signal?.aborted) {
      throw new Error("Dynamics query aborted");
    }

    page += 1;

    if (page > 200) {
      throw new Error("CRM pagination exceeded 200 pages");
    }

    const currentEndpoint: string = next;

    const data: ODataCollectionResponse<T> = await dynamicsGet<
      ODataCollectionResponse<T>
    >(currentEndpoint, options);

    rows.push(...data.value);

    next = data["@odata.nextLink"] ?? undefined;
  }

  return rows;
}
