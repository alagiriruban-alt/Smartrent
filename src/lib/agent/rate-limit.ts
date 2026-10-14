type Bucket = {
  windowStart: number;
  count: number;
};

const WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

function configuredLimit(): number {
  const raw = Number(process.env.AGENT_RATE_LIMIT_PER_MINUTE ?? 60);
  if (!Number.isFinite(raw) || raw < 1) {
    return 60;
  }
  return Math.floor(raw);
}

let limitPerMinute = configuredLimit();

export function agentRateLimitPerMinute(): number {
  return limitPerMinute;
}

export function setAgentRateLimitForTests(limit: number) {
  limitPerMinute = limit;
  buckets.clear();
}

export function resetAgentRateLimits() {
  limitPerMinute = configuredLimit();
  buckets.clear();
}

export function consumeAgentRate(
  key: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true };
  }
  if (existing.count >= limitPerMinute) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }
  existing.count += 1;
  return { allowed: true };
}
