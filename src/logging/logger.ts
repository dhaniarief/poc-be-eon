import pino from "pino";
import { env } from "../config/env.js";

const isDevelopment = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,

  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,

  redact: {
    paths: [
      "req.headers.authorization",
      "authorization",
      "token",
      "accessToken",
      "refreshToken",
      "password",
      "clientSecret",
      "apiKey",
    ],
    censor: "[REDACTED]",
  },
});
