import type { JwtIdentity } from "../auth/jwt.service.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: JwtIdentity;
    }
  }
}

export {};
