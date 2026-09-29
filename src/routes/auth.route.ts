import { Router } from "express";

import { env } from "../config/env.js";
import { issueJwt } from "../auth/jwt.service.js";

export const authRouter = Router();

authRouter.post("/token", async (req, res) => {
  if (!env.ENABLE_DEV_TOKEN_ENDPOINT) {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not available",
      },
    });

    return;
  }

  const { userId, name, role } = req.body;

  const token = await issueJwt({
    userId,
    name,
    role,
  });

  res.status(200).json({
    token,
  });
});
