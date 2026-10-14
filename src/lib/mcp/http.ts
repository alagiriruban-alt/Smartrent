import { writeAgentAudit } from "@/lib/agent/audit";
import { consumeAgentRate } from "@/lib/agent/rate-limit";
import { authenticateAgentToken, readBearerToken } from "@/lib/agent/tokens";
import { callTool, mcpInstructions, toolsFor, type AgentContext } from "@/lib/mcp/tools";
import { ServiceError } from "@/lib/services/errors";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const PREFERRED_VERSION = "2025-03-26";

type JsonRpcId = string | number | null;

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200): Response {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, status);
}

function acceptsJson(accept: string | null): boolean {
  if (!accept || accept.trim() === "") {
    return true;
  }
  return accept.includes("application/json") || accept.includes("*/*");
}

function acceptsEvents(accept: string | null): boolean {
  return Boolean(accept && accept.includes("text/event-stream"));
}

function originAllowed(origin: string | null): boolean {
  if (!origin) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return true;
  }
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) {
    return false;
  }
  try {
    return new URL(authUrl).origin === url.origin;
  } catch {
    return false;
  }
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return "local";
}

function negotiateVersion(requested: unknown): string {
  if (typeof requested === "string" && SUPPORTED_VERSIONS.includes(requested)) {
    return requested;
  }
  return PREFERRED_VERSION;
}

function toolResponse(id: JsonRpcId, result: unknown, isError: boolean): Response {
  return rpcResult(id, {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    ],
    ...(typeof result === "string" ? {} : { structuredContent: result }),
    isError,
  });
}

async function dispatch(
  ctx: AgentContext,
  id: JsonRpcId,
  method: string,
  params: Record<string, unknown>,
): Promise<Response> {
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: negotiateVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "smartrentboss", version: "0.1.0" },
      instructions: mcpInstructions(),
    });
  }
  if (method === "ping") {
    return rpcResult(id, {});
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: toolsFor(ctx.scopes) });
  }
  if (method === "tools/call") {
    const name = params.name;
    if (typeof name !== "string" || name.length === 0) {
      return rpcError(id, -32602, "Tool name is required.");
    }
    try {
      const outcome = await callTool(ctx, name, params.arguments ?? {});
      return toolResponse(id, outcome.result, false);
    } catch (error) {
      const message =
        error instanceof ServiceError ? error.message : "The tool failed.";
      if (!(error instanceof ServiceError)) {
        console.error(error);
      }
      await writeAgentAudit({
        ownerId: ctx.ownerId,
        tokenId: ctx.tokenId,
        tool: name,
        status: "error",
        summary: `${message} via agent`,
      });
      return toolResponse(id, message, true);
    }
  }
  return rpcError(id, -32601, `Method ${method} was not found.`);
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (!originAllowed(request.headers.get("origin"))) {
    return rpcError(null, -32000, "This origin is not allowed.", 403);
  }
  if (request.method === "GET" || request.method === "DELETE") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const accept = request.headers.get("accept");
  if (accept && !acceptsJson(accept) && !acceptsEvents(accept)) {
    return rpcError(null, -32000, "Accept application/json or text/event-stream.", 406);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "The request body was not JSON.", 400);
  }
  if (Array.isArray(body)) {
    return rpcError(null, -32600, "Batch requests are not supported.", 400);
  }
  if (!body || typeof body !== "object") {
    return rpcError(null, -32600, "Invalid request.", 400);
  }
  const message = body as Record<string, unknown>;
  const id = (message.id ?? null) as JsonRpcId;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(id, -32600, "Invalid request.", 400);
  }
  const method = message.method;
  const isNotification = !Object.prototype.hasOwnProperty.call(message, "id");
  const params =
    message.params && typeof message.params === "object" && !Array.isArray(message.params)
      ? (message.params as Record<string, unknown>)
      : {};

  const secret = readBearerToken(request.headers.get("authorization"));
  if (!secret) {
    return rpcError(id, -32001, "Send a bearer token from Settings, Agent access.", 401);
  }
  const rateKey = `auth:${clientKey(request)}`;
  const token = await authenticateAgentToken(secret);
  if (!token) {
    const limited = consumeAgentRate(rateKey);
    if (!limited.allowed) {
      return rpcError(id, -32000, "Too many requests.", 429);
    }
    return rpcError(id, -32001, "That token is not valid.", 401);
  }
  const limited = consumeAgentRate(`token:${token.id}`);
  if (!limited.allowed) {
    return rpcError(
      id,
      -32000,
      `Too many requests. Try again in ${limited.retryAfterSeconds} seconds.`,
      429,
    );
  }

  if (isNotification) {
    return new Response(null, { status: 202 });
  }

  const ctx: AgentContext = {
    ownerId: token.ownerId,
    tokenId: token.id,
    scopes: token.scopes,
  };
  const response = await dispatch(ctx, id, method, params);
  if (acceptsJson(accept) || !acceptsEvents(accept)) {
    return response;
  }
  const text = await response.text();
  return new Response(`event: message\ndata: ${text}\n\n`, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}
