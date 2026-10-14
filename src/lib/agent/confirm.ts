import { createHash, randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { samePayload } from "@/lib/agent/canonical";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";

export const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

function hashConfirmation(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function issueConfirmation(input: {
  ownerId: string;
  tool: string;
  payload: unknown;
  now?: Date;
  ttlMs?: number;
}) {
  const now = input.now ?? new Date();
  const secret = `confirm_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? CONFIRMATION_TTL_MS));
  await prisma.agentConfirmation.create({
    data: {
      ownerId: input.ownerId,
      tokenHash: hashConfirmation(secret),
      tool: input.tool,
      payload: input.payload as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  return { secret, expiresAt: expiresAt.toISOString() };
}

export async function consumeConfirmation(input: {
  ownerId: string;
  secret: string;
  tool: string;
  payload: unknown;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const row = await prisma.agentConfirmation.findFirst({
    where: { tokenHash: hashConfirmation(input.secret), ownerId: input.ownerId },
  });
  if (!row || row.tool !== input.tool) {
    throw new ServiceError(
      "invalid",
      "That confirmation token was not found. Preview the change again.",
    );
  }
  if (row.usedAt) {
    throw new ServiceError(
      "used",
      "That confirmation token was already used. Preview the change again.",
    );
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    throw new ServiceError(
      "expired",
      "That confirmation token has expired. Preview the change again.",
    );
  }
  if (!samePayload(row.payload, input.payload)) {
    throw new ServiceError(
      "mismatch",
      "That confirmation does not match this request. Preview the change again.",
    );
  }
  const claimed = await prisma.agentConfirmation.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) {
    throw new ServiceError(
      "used",
      "That confirmation token was already used. Preview the change again.",
    );
  }
  return row.payload;
}
