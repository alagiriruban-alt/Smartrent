import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetAgentRateLimits, setAgentRateLimitForTests } from "@/lib/agent/rate-limit";
import { createAgentAccessToken, hashAgentSecret } from "@/lib/agent/tokens";
import { todayDateOnly, dateOnlyToUtc } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { handleMcpRequest } from "@/lib/mcp/http";
import { recordRentPayment } from "@/lib/services/rent";

const ownerIds: string[] = [];

async function makeLandlord(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: label,
      email: `${label}-${stamp}@example.com`,
      passwordHash: "not-used",
    },
  });
  ownerIds.push(user.id);
  const tenant = await prisma.tenant.create({
    data: {
      ownerId: user.id,
      firstName: "Sam",
      lastName: "Okonkwo",
      email: `sam-${stamp}@example.com`,
    },
  });
  const property = await prisma.property.create({
    data: {
      ownerId: user.id,
      name: `${label} house`,
      streetAddress: `${label} ${stamp} Street`,
      city: "Hamilton",
      province: "ON",
      postalCode: "L8P 1A1",
      units: {
        create: {
          label: "Upper",
          tenancies: {
            create: {
              tenantId: tenant.id,
              leaseStart: dateOnlyToUtc("2026-01-01"),
              monthlyRentCents: 100_000,
              rentDueDay: 1,
            },
          },
        },
      },
    },
    include: { units: { include: { tenancies: true } } },
  });
  const token = await createAgentAccessToken({
    ownerId: user.id,
    name: "Test bot",
    access: "write",
  });
  return {
    user,
    street: property.streetAddress,
    tenancyId: property.units[0].tenancies[0].id,
    secret: token.secret,
    tokenId: token.token.id,
  };
}

async function rpc(secret: string | null, method: string, params?: unknown) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (secret) {
    headers.set("authorization", `Bearer ${secret}`);
  }
  const response = await handleMcpRequest(
    new Request("http://127.0.0.1:3000/api/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = await response.json();
  return { status: response.status, body };
}

async function tool(secret: string, name: string, args: Record<string, unknown> = {}) {
  const result = await rpc(secret, "tools/call", { name, arguments: args });
  const isError = Boolean(result.body.result?.isError);
  const text = result.body.result?.content?.[0]?.text;
  let data: unknown = text;
  if (!isError && typeof text === "string") {
    data = JSON.parse(text);
  }
  return { ...result, isError, data, text };
}

describe("agent MCP access", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(() => {
    resetAgentRateLimits();
  });

  afterAll(async () => {
    if (ownerIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
    await prisma.$disconnect();
  });

  it("stores only a hash of the personal access token", async () => {
    const landlord = await makeLandlord("Hash");
    const row = await prisma.agentAccessToken.findUniqueOrThrow({
      where: { id: landlord.tokenId },
    });
    expect(row.tokenHash).toBe(hashAgentSecret(landlord.secret));
    expect(row.tokenHash).not.toContain(landlord.secret);
    expect(landlord.secret.startsWith("srb_")).toBe(true);
  });

  it("rejects a missing, unknown, or revoked token", async () => {
    const missing = await rpc(null, "tools/list");
    expect(missing.status).toBe(401);

    const unknown = await rpc("srb_not-a-real-token", "tools/list");
    expect(unknown.status).toBe(401);

    const landlord = await makeLandlord("Revoke");
    await prisma.agentAccessToken.update({
      where: { id: landlord.tokenId },
      data: { revokedAt: new Date() },
    });
    const revoked = await rpc(landlord.secret, "tools/list");
    expect(revoked.status).toBe(401);
  });

  it("scopes every read and write to the token's landlord", async () => {
    const alpha = await makeLandlord("Alpha");
    const beta = await makeLandlord("Beta");
    const listed = await tool(alpha.secret, "list_properties");
    expect(listed.isError).toBe(false);
    const properties = (listed.data as { properties: { streetAddress: string }[] }).properties;
    expect(properties.map((property) => property.streetAddress)).toContain(alpha.street);
    expect(properties.map((property) => property.streetAddress)).not.toContain(beta.street);

    const foreign = await tool(alpha.secret, "record_payment", {
      tenancyId: beta.tenancyId,
      paidOn: todayDateOnly(),
      amount: "10.00",
      method: "CASH",
    });
    expect(foreign.isError).toBe(true);
    expect(foreign.text).toMatch(/not found/i);
    expect(await prisma.rentPayment.count({ where: { ownerId: beta.user.id } })).toBe(0);
    expect(await prisma.rentPayment.count({ where: { ownerId: alpha.user.id } })).toBe(0);
  });

  it("previews a payment, then records it only with the confirmation token", async () => {
    const landlord = await makeLandlord("Confirm");
    const args = {
      tenancyId: landlord.tenancyId,
      paidOn: todayDateOnly(),
      amount: "25.00",
      method: "CASH",
      note: "Confirm flow",
    };
    const preview = await tool(landlord.secret, "record_payment", args);
    expect(preview.isError).toBe(false);
    const pending = preview.data as {
      status: string;
      confirmationToken: string;
      preview: { amountCents: number };
    };
    expect(pending.status).toBe("confirmation_required");
    expect(pending.preview.amountCents).toBe(2_500);
    expect(await prisma.rentPayment.count({ where: { ownerId: landlord.user.id } })).toBe(0);

    const mismatched = await tool(landlord.secret, "record_payment", {
      ...args,
      amount: "30.00",
      confirmationToken: pending.confirmationToken,
    });
    expect(mismatched.isError).toBe(true);
    expect(await prisma.rentPayment.count({ where: { ownerId: landlord.user.id } })).toBe(0);

    const recorded = await tool(landlord.secret, "record_payment", {
      ...args,
      confirmationToken: pending.confirmationToken,
    });
    expect(recorded.isError).toBe(false);
    expect((recorded.data as { status: string }).status).toBe("recorded");
    expect(await prisma.rentPayment.count({ where: { ownerId: landlord.user.id } })).toBe(1);

    const reused = await tool(landlord.secret, "record_payment", {
      ...args,
      confirmationToken: pending.confirmationToken,
    });
    expect(reused.isError).toBe(true);
    expect(reused.text).toMatch(/already used/i);
    expect(await prisma.rentPayment.count({ where: { ownerId: landlord.user.id } })).toBe(1);
  });

  it("refuses an expired confirmation", async () => {
    const landlord = await makeLandlord("Expired");
    const args = {
      tenancyId: landlord.tenancyId,
      paidOn: todayDateOnly(),
      amount: "5.00",
      method: "CASH",
    };
    const preview = await tool(landlord.secret, "record_payment", args);
    const token = (preview.data as { confirmationToken: string }).confirmationToken;
    await prisma.agentConfirmation.updateMany({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await tool(landlord.secret, "record_payment", {
      ...args,
      confirmationToken: token,
    });
    expect(expired.isError).toBe(true);
    expect(expired.text).toMatch(/expired/i);
    expect(await prisma.rentPayment.count({ where: { ownerId: landlord.user.id } })).toBe(0);
  });

  it("never posts the same e-Transfer reference twice", async () => {
    const landlord = await makeLandlord("Idem");
    const input = {
      tenancyId: landlord.tenancyId,
      paidOn: todayDateOnly(),
      amountCents: 1_500,
      method: "E_TRANSFER" as const,
      referenceNumber: "race-ref-77",
      note: null,
    };
    const [first, second] = await Promise.all([
      recordRentPayment(landlord.user.id, input),
      recordRentPayment(landlord.user.id, input),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["already_recorded", "recorded"]);
    expect(first.payment.id).toBe(second.payment.id);
    expect(
      await prisma.rentPayment.count({
        where: { ownerId: landlord.user.id, referenceKey: "etransfer:RACE-REF-77" },
      }),
    ).toBe(1);

    const again = await tool(landlord.secret, "record_payment", {
      tenancyId: landlord.tenancyId,
      paidOn: todayDateOnly(),
      amount: "15.00",
      method: "E_TRANSFER",
      referenceNumber: "race-ref-77",
    });
    expect(again.isError).toBe(false);
    expect((again.data as { status: string }).status).toBe("already_recorded");
    expect(
      await prisma.rentPayment.count({
        where: { ownerId: landlord.user.id, referenceKey: "etransfer:RACE-REF-77" },
      }),
    ).toBe(1);
  });

  it("records a strong e-Transfer match and holds a weak one for confirmation", async () => {
    const landlord = await makeLandlord("Ingest");
    const today = todayDateOnly();
    const high = await tool(landlord.secret, "ingest_etransfer_email", {
      emailText: `Amount: $12.00\nFrom: Sam Okonkwo\nDate: ${today}\nReference Number: HIGHMATCH1\nMessage: Rent`,
    });
    expect(high.isError).toBe(false);
    expect((high.data as { status: string; confidence: string }).status).toBe("recorded");
    expect((high.data as { confidence: string }).confidence).toBe("high");

    const repeat = await tool(landlord.secret, "ingest_etransfer_email", {
      emailText: `Amount: $12.00\nFrom: Sam Okonkwo\nDate: ${today}\nReference Number: HIGHMATCH1\nMessage: Rent`,
    });
    expect((repeat.data as { status: string }).status).toBe("already_recorded");
    expect(
      await prisma.rentPayment.count({
        where: { ownerId: landlord.user.id, referenceKey: "etransfer:HIGHMATCH1" },
      }),
    ).toBe(1);

    const weakText = `Amount: $8.00\nFrom: Okonkwo\nDate: ${today}\nReference Number: WEAKMATCH1\nMessage: Part`;
    const weak = await tool(landlord.secret, "ingest_etransfer_email", { emailText: weakText });
    expect((weak.data as { status: string }).status).toBe("pending_confirmation");
    expect(
      await prisma.rentPayment.count({
        where: { ownerId: landlord.user.id, referenceKey: "etransfer:WEAKMATCH1" },
      }),
    ).toBe(0);
    const confirmationToken = (weak.data as { confirmationToken: string }).confirmationToken;
    const confirmed = await tool(landlord.secret, "ingest_etransfer_email", {
      emailText: weakText,
      confirmationToken,
    });
    expect((confirmed.data as { status: string }).status).toBe("recorded");
    expect(
      await prisma.rentPayment.count({
        where: { ownerId: landlord.user.id, referenceKey: "etransfer:WEAKMATCH1" },
      }),
    ).toBe(1);
  });

  it("saves an N4 draft only after confirmation and never a file", async () => {
    const landlord = await makeLandlord("Notice");
    const preview = await tool(landlord.secret, "prepare_n4_draft", {
      tenancyId: landlord.tenancyId,
    });
    const pending = preview.data as {
      status: string;
      confirmationToken: string;
      draft: { fileGenerated: boolean; served: boolean; totalOwingCents: number };
    };
    expect(pending.status).toBe("confirmation_required");
    expect(pending.draft.fileGenerated).toBe(false);
    expect(pending.draft.served).toBe(false);
    expect(pending.draft.totalOwingCents).toBeGreaterThan(0);
    expect(await prisma.notice.count({ where: { ownerId: landlord.user.id } })).toBe(0);

    const saved = await tool(landlord.secret, "prepare_n4_draft", {
      tenancyId: landlord.tenancyId,
      confirmationToken: pending.confirmationToken,
    });
    const draft = saved.data as {
      persisted: boolean;
      fileGenerated: boolean;
      documentCount: number;
      noticeStatus: string;
    };
    expect(draft.persisted).toBe(true);
    expect(draft.fileGenerated).toBe(false);
    expect(draft.documentCount).toBe(0);
    expect(draft.noticeStatus).toBe("DRAFT");
    expect(await prisma.document.count({ where: { ownerId: landlord.user.id } })).toBe(0);
    const notice = await prisma.notice.findFirstOrThrow({
      where: { ownerId: landlord.user.id },
    });
    expect(notice.status).toBe("DRAFT");
    expect(notice.type).toBe("N4");
  });

  it("blocks writes from a read token and limits call volume", async () => {
    const landlord = await makeLandlord("Read");
    const read = await createAgentAccessToken({
      ownerId: landlord.user.id,
      name: "Read only",
      access: "read",
    });
    const listed = await rpc(read.secret, "tools/list");
    const names = (listed.body.result.tools as { name: string }[]).map((item) => item.name);
    expect(names).toContain("list_late_tenants");
    expect(names).not.toContain("record_payment");
    const denied = await tool(read.secret, "record_payment", {
      tenancyId: landlord.tenancyId,
      paidOn: todayDateOnly(),
      amount: "1.00",
    });
    expect(denied.isError).toBe(true);
    expect(denied.text).toMatch(/cannot change/i);

    setAgentRateLimitForTests(2);
    const first = await tool(landlord.secret, "list_late_tenants");
    const second = await tool(landlord.secret, "list_late_tenants");
    const third = await tool(landlord.secret, "list_late_tenants");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    resetAgentRateLimits();
  });

  it("writes an audit row tagged via agent", async () => {
    const landlord = await makeLandlord("Audit");
    await tool(landlord.secret, "list_tenants");
    const rows = await prisma.agentAuditLog.findMany({
      where: { ownerId: landlord.user.id },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.viaAgent)).toBe(true);
    expect(rows[0]?.summary).toMatch(/via agent/);
  });
});
