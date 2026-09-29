import { SignJWT, jwtVerify } from "jose";

import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export type JwtIdentity = {
  userId: string;
  name: string;
  role: string;
};

type IssueJwtInput = JwtIdentity;

export async function issueJwt(input: IssueJwtInput): Promise<string> {
  const token = await new SignJWT({
    name: input.name,
    role: input.role,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(input.userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);

  return token;
}

export async function verifyJwt(token: string): Promise<JwtIdentity> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });

  if (
    !payload.sub ||
    typeof payload.name !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Invalid JWT payload");
  }

  return {
    userId: payload.sub,
    name: payload.name,
    role: payload.role,
  };
}
