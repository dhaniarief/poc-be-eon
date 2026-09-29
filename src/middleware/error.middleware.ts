import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app.error.js";
import { writeBusinessEvent } from "../logging/operation-logger.js";

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const err = error instanceof Error ? error : new Error("Unknown error");

  writeBusinessEvent("error", "HTTP_ERROR", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    errorName: err.name,
    error: err.message.slice(0, 240),
  });

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: req.requestId,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
      requestId: req.requestId,
    },
  });
}
