import type { NextFunction, Request, Response } from "express";

import { verifyJwt } from "../auth/jwt.service.js";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });

    return;
  }

  if (!authorization.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });

    return;
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const identity = await verifyJwt(token);

    req.user = identity;

    next();
  } catch {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });
  }
}
