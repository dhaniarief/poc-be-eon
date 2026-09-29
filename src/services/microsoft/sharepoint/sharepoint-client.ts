import { env } from "../../../config/env.js";

import { getMicrosoftAccessToken } from "../auth/microsoft-auth.service.js";

import { writeBusinessEvent } from "../../../logging/operation-logger.js";

type GraphParams = Record<string, string | number>;

export class GraphApiError extends Error {
  status: number;
  responseBody: string;
  location: string | null;

  constructor(input: {
    status: number;
    responseBody: string;
    location?: string | null;
  }) {
    super(`Microsoft Graph API failed with status ${input.status}`);
    this.name = "GraphApiError";
    this.status = input.status;
    this.responseBody = input.responseBody;
    this.location = input.location ?? null;
  }
}

async function getSharePointAccessToken() {
  return await getMicrosoftAccessToken({
    cacheKey: "sharepoint",

    scope: "https://graph.microsoft.com/.default",
  });
}

async function graphFetch<T>(
  url: URL,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const token = await getSharePointAccessToken();

  const response = await fetch(url, {
    method: "GET",

    headers: {
      Authorization: `Bearer ${token}`,

      Accept: "application/json",

      ...extraHeaders,
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();

    writeBusinessEvent("error", "INTEGRATION_ERROR", {
      source: "sharepoint",
      operation: "GRAPH_GET",
      statusCode: response.status,
      path: url.pathname,
    });

    throw new GraphApiError({
      status: response.status,
      responseBody,
      location: response.headers.get("location"),
    });
  }

  return (await response.json()) as T;
}

export async function graphGet<T>(
  path: string,

  params?: GraphParams,

  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://graph.microsoft.com/v1.0${path}`);

  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return graphFetch<T>(url, extraHeaders);
}

export async function graphGetAbsolute<T>(
  absoluteUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = new URL(absoluteUrl);

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "graph.microsoft.com"
  ) {
    throw new Error("Only Microsoft Graph HTTPS URLs are allowed.");
  }

  return graphFetch<T>(url, extraHeaders);
}

export async function getSharePointSiteByPath(
  hostname: string,
  rawSitePath: string,
) {
  const normalizedHostname = hostname.trim();
  const sitePath = rawSitePath.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  const path = sitePath
    ? `/sites/${normalizedHostname}:/${sitePath}`
    : `/sites/${normalizedHostname}`;

  const result = await graphGet<{
    id: string;

    name?: string;

    displayName?: string;

    webUrl?: string;
  }>(path, {
    $select: "id,name,displayName,webUrl",
  });

  return {
    id: result.id,

    name: result.name ?? null,

    displayName: result.displayName ?? null,

    webUrl: result.webUrl ?? null,
  };
}

export async function getSharePointSite() {
  return getSharePointSiteByPath(
    env.SHAREPOINT_HOSTNAME,
    env.SHAREPOINT_SITE_PATH,
  );
}
