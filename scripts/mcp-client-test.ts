import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

import { prisma } from "../src/lib/db";
import { todayDateOnly } from "../src/lib/dates";
import { handleMcpRequest } from "../src/lib/mcp/http";
import { createAgentAccessToken, revokeAgentAccessToken } from "../src/lib/agent/tokens";

const demoEmail = "landlord@example.com";
const scriptReferences = ["MCPCLIENTCHECK", "MCPHIGHCHECK", "MCPRECORDCHECK"];

function headersOf(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    }
  }
  return headers;
}

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const request = new Request(`http://127.0.0.1${req.url ?? "/api/mcp"}`, {
      method: req.method,
      headers: headersOf(req.headers),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    const response = await handleMcpRequest(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start the MCP test server.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/api/mcp`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function rpc(
  url: string,
  token: string,
  method: string,
  params?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as {
    error?: { message: string };
    result?: Record<string, unknown>;
  };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `MCP call failed (${response.status}).`);
  }
  return body.result ?? {};
}

function readTool(result: Record<string, unknown>): Record<string, unknown> {
  if (result.isError) {
    const content = result.content as { text?: string }[] | undefined;
    throw new Error(content?.[0]?.text ?? "Tool returned an error.");
  }
  const content = result.content as { text?: string }[] | undefined;
  return JSON.parse(content?.[0]?.text ?? "{}") as Record<string, unknown>;
}

async function resetDemo(ownerId: string) {
  await prisma.rentPayment.deleteMany({
    where: {
      ownerId,
      referenceKey: { in: scriptReferences.map((reference) => `etransfer:${reference}`) },
    },
  });
  await prisma.notice.deleteMany({
    where: {
      ownerId,
      notes: "Draft prepared via agent. Not served. No form file was created.",
    },
  });
  await prisma.agentAuditLog.deleteMany({ where: { ownerId } });
  await prisma.agentAccessToken.deleteMany({
    where: { ownerId, name: { in: ["Grok Bot", "Old laptop"] } },
  });
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!user) {
    throw new Error("Seed the database first: npm run db:seed");
  }
  await resetDemo(user.id);
  const retired = await createAgentAccessToken({
    ownerId: user.id,
    name: "Old laptop",
    access: "read",
  });
  await revokeAgentAccessToken(user.id, retired.token.id);
  const active = await createAgentAccessToken({
    ownerId: user.id,
    name: "Grok Bot",
    access: "write",
  });

  const server = await listen();
  const token = active.secret;
  const today = todayDateOnly();
  try {
    const initialized = await rpc(server.url, token, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smartrentboss-mcp-check", version: "0.1.0" },
    });
    if ((initialized.serverInfo as { name?: string }).name !== "smartrentboss") {
      throw new Error("Initialize did not return the SmartRentBoss server.");
    }
    const noted = await fetch(server.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    if (noted.status !== 202) {
      throw new Error(`Expected the initialized notification to be accepted, got ${noted.status}.`);
    }

    const listed = await rpc(server.url, token, "tools/list");
    const names = ((listed.tools as { name: string }[]) ?? []).map((tool) => tool.name);
    for (const name of [
      "list_properties",
      "list_tenants",
      "get_rent_status",
      "list_late_tenants",
      "record_payment",
      "parse_etransfer_email",
      "ingest_etransfer_email",
      "generate_rent_receipt",
      "list_reminders",
      "preview_reminder_message",
      "prepare_n4_draft",
      "list_documents",
      "get_document_link",
    ]) {
      if (!names.includes(name)) {
        throw new Error(`Missing tool ${name}.`);
      }
    }

    const properties = readTool(await rpc(server.url, token, "tools/call", {
      name: "list_properties",
      arguments: {},
    }));
    const propertyRows = properties.properties as { name: string | null }[];
    if (!propertyRows.some((property) => property.name === "King Street duplex")) {
      throw new Error("Seed property was not listed.");
    }

    const documents = readTool(await rpc(server.url, token, "tools/call", {
      name: "list_documents",
      arguments: {},
    }));
    if (!Array.isArray(documents.documents)) {
      throw new Error("list_documents did not return a list.");
    }

    const tenants = readTool(await rpc(server.url, token, "tools/call", {
      name: "list_tenants",
      arguments: {},
    }));
    const tenantRows = tenants.tenants as { lastName: string; tenancyId: string }[];
    const sam = tenantRows.find((tenant) => tenant.lastName === "Okonkwo");
    if (!sam) {
      throw new Error("Sam Okonkwo was not listed.");
    }

    readTool(await rpc(server.url, token, "tools/call", { name: "get_rent_status", arguments: {} }));
    const late = readTool(await rpc(server.url, token, "tools/call", {
      name: "list_late_tenants",
      arguments: {},
    }));
    const lateRows = late.late as { tenancyId: string }[];
    if (!lateRows.some((row) => row.tenancyId === sam.tenancyId)) {
      throw new Error("Sam Okonkwo should be late in the seed data.");
    }

    const parsed = readTool(await rpc(server.url, token, "tools/call", {
      name: "parse_etransfer_email",
      arguments: {
        emailText: `Amount: $15.00\nFrom: Sam Okonkwo\nDate: ${today}\nReference Number: MCPHIGHCHECK\nMessage: Rent`,
      },
    }));
    if ((parsed.parsed as { referenceNumber?: string }).referenceNumber !== "MCPHIGHCHECK") {
      throw new Error("Parser did not read the reference.");
    }

    const high = readTool(await rpc(server.url, token, "tools/call", {
      name: "ingest_etransfer_email",
      arguments: {
        emailText: `Amount: $15.00\nFrom: Sam Okonkwo\nDate: ${today}\nReference Number: MCPHIGHCHECK\nMessage: Rent`,
      },
    }));
    if (high.status !== "recorded" || high.confidence !== "high") {
      throw new Error(`Expected a high-confidence record, got ${JSON.stringify(high)}`);
    }
    const again = readTool(await rpc(server.url, token, "tools/call", {
      name: "ingest_etransfer_email",
      arguments: {
        emailText: `Amount: $15.00\nFrom: Sam Okonkwo\nDate: ${today}\nReference Number: MCPHIGHCHECK\nMessage: Rent`,
      },
    }));
    if (again.status !== "already_recorded") {
      throw new Error("The same e-Transfer reference was posted twice.");
    }

    const weakText = `Amount: $20.00\nFrom: Okonkwo\nDate: ${today}\nReference Number: MCPCLIENTCHECK\nMessage: MCP client check`;
    const weak = readTool(await rpc(server.url, token, "tools/call", {
      name: "ingest_etransfer_email",
      arguments: { emailText: weakText },
    }));
    if (weak.status !== "pending_confirmation" || typeof weak.confirmationToken !== "string") {
      throw new Error("A weak match should wait for confirmation.");
    }
    const confirmed = readTool(await rpc(server.url, token, "tools/call", {
      name: "ingest_etransfer_email",
      arguments: { emailText: weakText, confirmationToken: weak.confirmationToken },
    }));
    if (confirmed.status !== "recorded") {
      throw new Error("Confirming the weak match did not record the payment.");
    }

    const preview = readTool(await rpc(server.url, token, "tools/call", {
      name: "record_payment",
      arguments: {
        tenancyId: sam.tenancyId,
        paidOn: today,
        amount: "10.00",
        method: "E_TRANSFER",
        referenceNumber: "MCPRECORDCHECK",
        note: "MCP client check",
      },
    }));
    if (preview.status !== "confirmation_required") {
      throw new Error("record_payment wrote before confirmation.");
    }
    const recorded = readTool(await rpc(server.url, token, "tools/call", {
      name: "record_payment",
      arguments: {
        tenancyId: sam.tenancyId,
        paidOn: today,
        amount: "10.00",
        method: "E_TRANSFER",
        referenceNumber: "MCPRECORDCHECK",
        note: "MCP client check",
        confirmationToken: preview.confirmationToken,
      },
    }));
    if (recorded.status !== "recorded") {
      throw new Error("Confirmed payment was not recorded.");
    }
    const paymentId = (recorded.payment as { id: string }).id;
    const receipt = readTool(await rpc(server.url, token, "tools/call", {
      name: "generate_rent_receipt",
      arguments: { paymentId },
    }));
    if (receipt.fileGenerated !== false || typeof receipt.text !== "string") {
      throw new Error("Receipt was not returned as text.");
    }
    if (!(receipt.text as string).includes("RENT RECEIPT")) {
      throw new Error("Receipt text is missing the heading.");
    }

    readTool(await rpc(server.url, token, "tools/call", { name: "list_reminders", arguments: {} }));
    const reminder = readTool(await rpc(server.url, token, "tools/call", {
      name: "preview_reminder_message",
      arguments: { tenancyId: sam.tenancyId },
    }));
    if (reminder.delivered !== false) {
      throw new Error("Reminder preview must not send email.");
    }

    const n4 = readTool(await rpc(server.url, token, "tools/call", {
      name: "prepare_n4_draft",
      arguments: { tenancyId: sam.tenancyId },
    }));
    if (n4.status !== "confirmation_required") {
      throw new Error("N4 draft was saved before confirmation.");
    }
    const n4saved = readTool(await rpc(server.url, token, "tools/call", {
      name: "prepare_n4_draft",
      arguments: { tenancyId: sam.tenancyId, confirmationToken: n4.confirmationToken },
    }));
    if (n4saved.fileGenerated !== false || n4saved.persisted !== true) {
      throw new Error("N4 confirm should save draft data and no file.");
    }

    const audits = await prisma.agentAuditLog.count({
      where: { ownerId: user.id, viaAgent: true },
    });
    if (audits < 8) {
      throw new Error("Expected audit rows tagged via agent.");
    }
    console.log(`MCP client check passed against ${server.url}.`);
    console.log(`Token prefix ${active.token.tokenPrefix}. Audit rows: ${audits}.`);
  } finally {
    await server.close();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
