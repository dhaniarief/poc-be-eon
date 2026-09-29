import { logger } from "./logger.js";

export type BusinessLogLevel = "info" | "warn" | "error";

export function writeBusinessEvent(
  level: BusinessLogLevel,
  event: string,
  payload: Record<string, unknown> = {},
) {
  logger[level]({ event, ...payload }, event);
}
