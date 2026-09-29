import { ConfidentialClientApplication } from "@azure/msal-node";

import { env } from "../../../config/env.js";

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: env.CRM_CLIENT_ID,

    authority: `https://login.microsoftonline.com/${env.CRM_TENANT_ID}`,

    clientSecret: env.CRM_CLIENT_SECRET,
  },
});

type TokenCache = {
  token: string;
  expiresAt: number;
};

const tokenCache: Record<string, TokenCache> = {};

type MicrosoftTokenOptions = {
  cacheKey: string;

  scope: string;
};

export async function getMicrosoftAccessToken(options: MicrosoftTokenOptions) {
  const now = Date.now();

  const cached = tokenCache[options.cacheKey];

  /*
   * Gunakan token lama jika masih valid
   */
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  /*
   * Request token baru
   */
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: [options.scope],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire Microsoft access token");
  }

  /*
   * Cache token berdasarkan service
   *
   * CRM:
   * cacheKey = crm
   *
   * FinOps:
   * cacheKey = finops
   *
   * SharePoint:
   * cacheKey = sharepoint
   */
  tokenCache[options.cacheKey] = {
    token: result.accessToken,

    expiresAt: result.expiresOn?.getTime() ?? now + 50 * 60 * 1000,
  };

  return result.accessToken;
}
