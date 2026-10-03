import { env } from "../../../config/env.js";
import { writeBusinessEvent } from "../../../logging/operation-logger.js";
import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

async function finopsFetch<T>(url: URL): Promise<T> {
  const token = await getMicrosoftAccessToken({
    cacheKey: "finops",
    scope: `${env.FINOPS_BASE_URL}/.default`,
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
      operation: url.pathname.split("/").pop() ?? "GET",
      statusCode: response.status,
    });
    throw new Error(`FinOps API failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function finopsGet<T>(
  entity: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${env.FINOPS_BASE_URL}/data/${entity}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return finopsFetch<T>(url);
}

export async function finopsGetAll<T>(
  entity: string,
  params?: Record<string, string>,
): Promise<T[]> {
  const rows: T[] = [];
  let url = new URL(`${env.FINOPS_BASE_URL}/data/${entity}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  let page = 0;
  while (url) {
    page += 1;
    if (page > 200) throw new Error("FinOps pagination exceeded 200 pages");

    const data = await finopsFetch<{
      value: T[];
      "@odata.nextLink"?: string;
    }>(url);
    rows.push(...data.value);

    const next = data["@odata.nextLink"];
    if (!next) break;

    const nextUrl = new URL(next);
    const allowed = new URL(env.FINOPS_BASE_URL);
    if (nextUrl.origin !== allowed.origin) {
      throw new Error("FinOps pagination URL points to an unexpected host");
    }
    url = nextUrl;
  }

  return rows;
}
