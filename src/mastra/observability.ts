import { Observability, DefaultExporter, SensitiveDataFilter } from "@mastra/observability";
import { env } from "../config/env.js";

/**
 * Native Mastra observability automatically creates spans for agent runs,
 * model calls, tool calls and workflow steps. DefaultExporter persists those
 * signals into the observability storage domain configured in storage.ts.
 */
export const mastraObservability = new Observability({
  configs: {
    default: {
      serviceName: env.MASTRA_SERVICE_NAME,
      logging: {
        enabled: true,
        level: "info",
      },
      exporters: [new DefaultExporter()],
      spanOutputProcessors: [
        new SensitiveDataFilter({
          sensitiveFields: [
            "password",
            "secret",
            "clientSecret",
            "client_secret",
            "authorization",
            "accessToken",
            "access_token",
            "refreshToken",
            "refresh_token",
            "apiKey",
            "api_key",
            "jwt",
          ],
          redactionStyle: "full",
          redactionToken: "[REDACTED]",
        }),
      ],
    },
  },
});
