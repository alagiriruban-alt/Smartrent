import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetAgentRateLimits } from "@/lib/agent/rate-limit";
import { createAgentAccessToken } from "@/lib/agent/tokens";
import { dateOnlyToUtc, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { handleMcpRequest } from "@/lib/mcp/http";
import { earliestTerminationDate } from "@/lib/n4/rules";
import { confirmN4ForLandlord, saveN4ForLandlord } from "@/lib/services/n4";

const ownerIds: string[] = [];

async function makeLandlord(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: `${label} Landlord`,
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
      streetAddress: `${label} ${stamp} Street`,
      city: "Hamilton",
      province: "ON",
      postalCode: "L8P 1A1",
      units: {
        create: {
          label: "Lower",
          tenancies: {
            create: {
              tenantId: tenant.id,
              leaseStart: dateOnlyToUtc("2026-06-01"),
              moveInOn: dateOnlyToUtc("2026-06-01"),
              monthlyRentCents: 145_000,
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
    tenancyId: property.units[0].tenancies[0].id,
    secret: token.secret,
  };
}

async function rpc(secret: string, method: string, params?: unknown) {
  const response = await handleMcpRequest(
    new Request("http://127.0.0.1:3000/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  return response.json();
}

async function tool(secret: string, name: string, args: Record<string, unknown> = {}) {
  const body = await rpc(secret, "tools/call", { name, arguments: args });
  const isError = Boolean(body.result?.isError);
  const text = body.result?.content?.[0]?.text;
  let data: unknown = text;
  if (!isError && typeof text === "string") {
    data = JSON.parse(text);
  }
  return { isError, data, text };
}

describe("prepare_n4_notice", () => {
  beforeEach(() => {
    resetAgentRateLimits();
  });

  afterAll(async () => {
    if (ownerIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
    await prisma.$disconnect();
  });

  it("saves the arrears table only after confirmation and audits via agent", async () => {
    const landlord = await makeLandlord("N4notice");
    const today = todayDateOnly();
    const expected = earliestTerminationDate({
      givenOn: today,
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
    }).terminationDate;
    const preview = await tool(landlord.secret, "prepare_n4_notice", {
      tenancyId: landlord.tenancyId,
    });
    expect(preview.isError).toBe(false);
    const pending = preview.data as {
      status: string;
      confirmationToken: string;
      fileGenerated: boolean;
      served: boolean;
      draft: {
        totalOwingCents: number;
        terminationDate: string;
        rows: { periodFrom: string; rentOwingCents: number }[];
        tenantNames: string;
      };
    };
    expect(pending.status).toBe("confirmation_required");
    expect(pending.fileGenerated).toBe(false);
    expect(pending.served).toBe(false);
    expect(pending.draft.totalOwingCents).toBeGreaterThan(0);
    expect(pending.draft.terminationDate).toBe(expected);
    expect(pending.draft.rows.length).toBeGreaterThan(0);
    expect(pending.draft.rows.every((row) => row.rentOwingCents > 0)).toBe(true);
    expect(await prisma.notice.count({ where: { ownerId: landlord.user.id } })).toBe(0);

    const saved = await tool(landlord.secret, "prepare_n4_notice", {
      tenancyId: landlord.tenancyId,
      confirmationToken: pending.confirmationToken,
    });
    const draft = saved.data as {
      persisted: boolean;
      fileGenerated: boolean;
      noticeStatus: string;
      documentCount: number;
      noticeId: string;
    };
    expect(draft.persisted).toBe(true);
    expect(draft.fileGenerated).toBe(false);
    expect(draft.documentCount).toBe(0);
    expect(draft.noticeStatus).toBe("DRAFT");
    const notice = await prisma.notice.findFirstOrThrow({
      where: { id: draft.noticeId },
    });
    expect(notice.type).toBe("N4");
    expect(notice.status).toBe("DRAFT");
    expect(notice.confirmedAt).toBeNull();
    expect(Array.isArray(notice.arrearsRows)).toBe(true);

    const audits = await prisma.agentAuditLog.findMany({
      where: { ownerId: landlord.user.id, tool: "prepare_n4_notice" },
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(audits.every((row) => row.viaAgent)).toBe(true);
    expect(audits.some((row) => row.summary.includes("via agent"))).toBe(true);
  });

  it("refuses a termination date earlier than the notice could legally end", async () => {
    const landlord = await makeLandlord("N4early");
    const blocked = await tool(landlord.secret, "prepare_n4_notice", {
      tenancyId: landlord.tenancyId,
      givenOn: "2026-10-15",
      terminationDate: "2026-10-16",
    });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/cannot be earlier/i);
    expect(await prisma.notice.count({ where: { ownerId: landlord.user.id } })).toBe(0);
  });

  it("hides the tool from a read token", async () => {
    const landlord = await makeLandlord("N4read");
    const read = await createAgentAccessToken({
      ownerId: landlord.user.id,
      name: "Read only",
      access: "read",
    });
    const listed = await rpc(read.secret, "tools/list");
    const names = (listed.result.tools as { name: string }[]).map((item) => item.name);
    expect(names).not.toContain("prepare_n4_notice");
  });

  it("writes a landlord audit row that is not via agent", async () => {
    const landlord = await makeLandlord("N4audit");
    const today = todayDateOnly();
    const saved = await saveN4ForLandlord(landlord.user.id, {
      tenancyId: landlord.tenancyId,
      givenOn: today,
      serviceMethod: "IN_PERSON",
      rentFrequency: "MONTHLY",
      terminationDate: null,
      landlordName: null,
      landlordContact: null,
      tenantNames: null,
      unitAddress: null,
    });
    const confirmed = await confirmN4ForLandlord(landlord.user.id, saved.noticeId);
    expect(confirmed.confirmedAt).toBeTruthy();
    expect(confirmed.served).toBe(false);
    const rows = await prisma.agentAuditLog.findMany({
      where: { ownerId: landlord.user.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((row) => row.tool)).toEqual(["save_n4_notice", "confirm_n4_notice"]);
    expect(rows.every((row) => row.viaAgent === false)).toBe(true);
    expect(rows.every((row) => row.summary.includes("via agent"))).toBe(false);
  });
});
