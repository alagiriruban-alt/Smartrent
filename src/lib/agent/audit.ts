import { prisma } from "@/lib/db";

export async function writeAgentAudit(input: {
  ownerId: string;
  tokenId: string | null;
  tool: string;
  status: "ok" | "pending" | "error";
  summary: string;
}) {
  await prisma.agentAuditLog.create({
    data: {
      ownerId: input.ownerId,
      tokenId: input.tokenId,
      tool: input.tool,
      status: input.status,
      summary: input.summary,
      viaAgent: true,
    },
  });
}

export async function listAgentAudit(ownerId: string, limit = 50) {
  return prisma.agentAuditLog.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
