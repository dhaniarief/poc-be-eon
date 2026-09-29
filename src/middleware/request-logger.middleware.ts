import type { NextFunction, Request, Response } from "express";
import { writeBusinessEvent } from "../logging/operation-logger.js";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = Date.now();

  writeBusinessEvent("info", "HTTP_REQUEST", {
    phase: "start",
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
  });

  res.on("finish", () => {
    writeBusinessEvent("info", "HTTP_REQUEST", {
      phase: "complete",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
