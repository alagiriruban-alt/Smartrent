import { createHash, randomBytes } from "node:crypto";

import type { AgentTokenScope } from "@prisma/client";

import { prisma } from "@/lib/db";

export type AgentScopeName = "read" | "write";

export function hashAgentSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateAgentSecret(): {
  secret: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  const secret = `srb_${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    tokenHash: hashAgentSecret(secret),
    tokenPrefix: `${secret.slice(0, 12)}…`,
  };
}

export function scopesFor(access: AgentScopeName): AgentTokenScope[] {
  if (access === "write") {
    return ["READ", "WRITE"];
  }
  return ["READ"];
}

export function readBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }
  return match[1];
}

export async function createAgentAccessToken(input: {
  ownerId: string;
  name: string;
  access: AgentScopeName;
}) {
  const generated = generateAgentSecret();
  const token = await prisma.agentAccessToken.create({
    data: {
      ownerId: input.ownerId,
      name: input.name,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes: scopesFor(input.access),
    },
  });
  return { token, secret: generated.secret };
}

export async function authenticateAgentToken(secret: string) {
  const token = await prisma.agentAccessToken.findUnique({
    where: { tokenHash: hashAgentSecret(secret) },
  });
  if (!token || token.revokedAt) {
    return null;
  }
  await prisma.agentAccessToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });
  return token;
}

export async function listAgentAccessTokens(ownerId: string) {
  return prisma.agentAccessToken.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeAgentAccessToken(ownerId: string, tokenId: string) {
  const result = await prisma.agentAccessToken.updateMany({
    where: { id: tokenId, ownerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}
