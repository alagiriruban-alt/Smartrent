import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { resetAgentRateLimits } from "@/lib/agent/rate-limit";
import { createAgentAccessToken } from "@/lib/agent/tokens";
import { addCalendarMonths, addDays, dateOnlyToUtc, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { handleMcpRequest } from "@/lib/mcp/http";
import { rentAfterGuideline } from "@/lib/rent-increase/calculate";
import { ONTARIO_GUIDELINE_SOURCE_URL } from "@/lib/rent-increase/official";

const ownerIds: string[] = [];

async function makeLandlord(label: string, exempt = false) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const today = todayDateOnly();
  const eligibleOn = addDays(today, 100);
  const lastIncreaseOn = addCalendarMonths(eligibleOn, -12);
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
      firstName: "Jordan",
      lastName: "Patel",
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
          label: exempt ? "Lower" : "Upper",
          guidelineExempt: exempt,
          exemptionEvidence: exempt
            ? "First residential occupancy was after November 15, 2018."
            : null,
          tenancies: {
            create: {
              tenantId: tenant.id,
              leaseStart: dateOnlyToUtc("2024-01-01"),
              moveInOn: dateOnlyToUtc(lastIncreaseOn),
              lastIncreaseOn: dateOnlyToUtc(lastIncreaseOn),
              lastIncreaseCents: 2000,
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
    tenancyId: property.units[0].tenancies[0].id,
    secret: token.secret,
    eligibleOn,
    year: Number(eligibleOn.slice(0, 4)),
  };
}

async function tool(secret: string, name: string, args: Record<string, unknown> = {}) {
  const response = await handleMcpRequest(
    new Request("http://127.0.0.1:3000/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const body = await response.json();
  const isError = Boolean(body.result?.isError);
  const text = body.result?.content?.[0]?.text;
  let data: unknown = text;
  if (!isError && typeof text === "string") {
    data = JSON.parse(text);
  }
  return { status: response.status, isError, data, text };
}

async function putGuideline(year: number, verified: boolean) {
  await prisma.rentGuideline.upsert({
    where: { province_year: { province: "ON", year } },
    create: {
      province: "ON",
      year,
      basisPoints: 210,
      sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL,
      verified,
    },
    update: { verified, basisPoints: 210, sourceUrl: ONTARIO_GUIDELINE_SOURCE_URL },
  });
}

describe("rent increase MCP tools", () => {
  beforeEach(() => {
    resetAgentRateLimits();
  });

  afterAll(async () => {
    if (ownerIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
    await prisma.rentGuideline.deleteMany({ where: { year: 2035 } });
    await prisma.$disconnect();
  });

  it("lists an increase inside the 120-day window and audits the read", async () => {
    const landlord = await makeLandlord("List");
    const listed = await tool(landlord.secret, "list_upcoming_rent_increases");
    expect(listed.isError).toBe(false);
    const increases = (listed.data as { increases: { tenancyId: string; formCode: string; alerts: string[] }[] })
      .increases;
    const row = increases.find((item) => item.tenancyId === landlord.tenancyId);
    expect(row?.formCode).toBe("N1");
    expect(row?.alerts).toContain("eligible_soon");
    expect(row?.alerts).toContain("serve_by_reminder");
    const audit = await prisma.agentAuditLog.findFirst({
      where: { ownerId: landlord.user.id, tool: "list_upcoming_rent_increases" },
    });
    expect(audit?.status).toBe("ok");
    expect(audit?.summary).toMatch(/via agent/);
  });

  it("previews and then saves an N1 draft only after confirmation", async () => {
    const landlord = await makeLandlord("Draft");
    await putGuideline(landlord.year, true);
    const args = {
      tenancyId: landlord.tenancyId,
      effectiveOn: landlord.eligibleOn,
      newRent: (rentAfterGuideline(100_000, 210) / 100).toFixed(2),
    };
    const preview = await tool(landlord.secret, "prepare_rent_increase_notice", args);
    expect(preview.isError).toBe(false);
    const pending = preview.data as {
      status: string;
      confirmationToken: string;
      draft: { form: string; fileGenerated: boolean };
    };
    expect(pending.status).toBe("confirmation_required");
    expect(pending.draft.form).toBe("N1");
    expect(pending.draft.fileGenerated).toBe(false);
    expect(await prisma.notice.count({ where: { ownerId: landlord.user.id } })).toBe(0);

    const saved = await tool(landlord.secret, "prepare_rent_increase_notice", {
      ...args,
      confirmationToken: pending.confirmationToken,
    });
    expect(saved.isError).toBe(false);
    const draft = saved.data as { noticeStatus: string; fileGenerated: boolean; persisted: boolean };
    expect(draft.noticeStatus).toBe("DRAFT");
    expect(draft.persisted).toBe(true);
    expect(draft.fileGenerated).toBe(false);
    const notice = await prisma.notice.findFirstOrThrow({
      where: { ownerId: landlord.user.id },
    });
    expect(notice.type).toBe("N1");
    expect(notice.status).toBe("DRAFT");

    const audits = await prisma.agentAuditLog.findMany({
      where: { ownerId: landlord.user.id, tool: "prepare_rent_increase_notice" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((row) => row.status)).toEqual(["pending", "ok"]);
    expect(audits.every((row) => row.viaAgent && row.summary.includes("via agent"))).toBe(true);
  });

  it("blocks an N1 when the guideline is not verified and still writes an audit row", async () => {
    const landlord = await makeLandlord("Blocked");
    await putGuideline(landlord.year, false);
    const blocked = await tool(landlord.secret, "prepare_rent_increase_notice", {
      tenancyId: landlord.tenancyId,
      effectiveOn: landlord.eligibleOn,
      newRent: "1021.00",
    });
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/not verified/);
    expect(await prisma.notice.count({ where: { ownerId: landlord.user.id } })).toBe(0);
    const audit = await prisma.agentAuditLog.findFirst({
      where: { ownerId: landlord.user.id, tool: "prepare_rent_increase_notice" },
    });
    expect(audit?.status).toBe("error");
  });

  it("saves N2 data for an exempt unit without a verified guideline", async () => {
    const landlord = await makeLandlord("Exempt", true);
    await prisma.rentGuideline.deleteMany({ where: { year: 2035 } });
    const preview = await tool(landlord.secret, "prepare_rent_increase_notice", {
      tenancyId: landlord.tenancyId,
      effectiveOn: "2035-06-01",
      newRent: "1500.00",
    });
    expect(preview.isError).toBe(false);
    const pending = preview.data as { confirmationToken: string; draft: { form: string } };
    expect(pending.draft.form).toBe("N2");
    const saved = await tool(landlord.secret, "prepare_rent_increase_notice", {
      tenancyId: landlord.tenancyId,
      effectiveOn: "2035-06-01",
      newRent: "1500.00",
      confirmationToken: pending.confirmationToken,
    });
    expect(saved.isError).toBe(false);
    const notice = await prisma.notice.findFirstOrThrow({
      where: { ownerId: landlord.user.id },
    });
    expect(notice.type).toBe("N2");
  });

  it("hides the write tool from a read token", async () => {
    const landlord = await makeLandlord("ReadIncrease");
    const read = await createAgentAccessToken({
      ownerId: landlord.user.id,
      name: "Read only",
      access: "read",
    });
    const response = await handleMcpRequest(
      new Request("http://127.0.0.1:3000/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${read.secret}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );
    const body = await response.json();
    const names = (body.result.tools as { name: string }[]).map((item) => item.name);
    expect(names).toContain("list_upcoming_rent_increases");
    expect(names).not.toContain("prepare_rent_increase_notice");
  });
});
