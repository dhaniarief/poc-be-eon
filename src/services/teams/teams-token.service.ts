import { env } from "../../config/env.js";

type CachedTeamsToken = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CachedTeamsToken>();

export async function getTeamsToken(
  scope: string | string[],
  tenantId?: string,
): Promise<string> {
  const tokenScope = Array.isArray(scope) ? scope.join(" ") : scope;

  const tokenTenant = tenantId || env.TEAMS_APP_TENANT_ID;

  const cacheKey = `${tokenTenant}:${tokenScope}`;

  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    console.log("[TEAMS TOKEN CACHE HIT]", {
      tenantId: tokenTenant,
      scope: tokenScope,
    });

    return cached.token;
  }

  console.log("[TEAMS TOKEN REQUEST]", {
    tenantId: tokenTenant,
    scope: tokenScope,
  });

  const body = new URLSearchParams({
    client_id: env.TEAMS_APP_ID,
    client_secret: env.TEAMS_APP_PASSWORD,
    grant_type: "client_credentials",
    scope: tokenScope,
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tokenTenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      `Teams token failed: ${
        data.error_description ?? data.error ?? response.statusText
      }`,
    );
  }

  const expiresIn = data.expires_in ?? 3600;

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  console.log("[TEAMS TOKEN ACQUIRED]", {
    tenantId: tokenTenant,
    scope: tokenScope,
    expiresIn,
  });

  return data.access_token;
}
