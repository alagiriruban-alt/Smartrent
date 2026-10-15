/** Ownership shares are basis points. 5000 is 50 percent. */
export function percentToBps(input: string | number): number | null {
  const text = String(input).trim().replace(/%$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps) || bps <= 0 || bps > 10000) {
    return null;
  }
  return bps;
}

export function formatShare(shareBps: number): string {
  const whole = Math.floor(shareBps / 100);
  const fraction = String(shareBps % 100).padStart(2, "0");
  return fraction === "00" ? `${whole}%` : `${whole}.${fraction}%`;
}

export type ShareLine = {
  key: string;
  shareBps: number;
  amountCents: number;
};

/**
 * Split a cent total by ownership. Shares that add to 100% absorb
 * leftover cents. Any other total leaves the remainder unallocated.
 */
export function splitCentsByShare(
  totalCents: number,
  shares: { key: string; shareBps: number }[],
) {
  const totalBps = shares.reduce((sum, share) => sum + share.shareBps, 0);
  const lines: ShareLine[] = shares.map((share) => ({
    key: share.key,
    shareBps: share.shareBps,
    amountCents: Math.floor((totalCents * share.shareBps) / 10000),
  }));
  let allocatedCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (totalBps === 10000) {
    let leftover = totalCents - allocatedCents;
    for (let index = 0; leftover > 0 && index < lines.length; index += 1) {
      lines[index].amountCents += 1;
      leftover -= 1;
    }
    allocatedCents = totalCents;
  }
  return {
    balanced: totalBps === 10000 && shares.length > 0,
    totalBps,
    lines,
    allocatedCents,
    unallocatedCents: totalCents - allocatedCents,
  };
}

export function parseOwnerLines(
  text: string,
): { ok: true; owners: { name: string; shareBps: number }[] } | { ok: false; message: string } {
  const owners: { name: string; shareBps: number }[] = [];
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, message: "Enter at least one owner and a percent." };
  }
  for (const line of lines) {
    const match = line.match(/^(.+?)[,\s]+(\d+(?:\.\d{1,2})?)\s*%?\s*$/);
    if (!match) {
      return {
        ok: false,
        message: `Could not read "${line}". Use a line like Avery Chen, 50.`,
      };
    }
    const name = match[1].trim();
    const shareBps = percentToBps(match[2]);
    if (name.length < 2 || name.length > 80 || shareBps === null) {
      return { ok: false, message: `Check the name and percent on "${line}".` };
    }
    owners.push({ name, shareBps });
  }
  const total = owners.reduce((sum, owner) => sum + owner.shareBps, 0);
  if (total !== 10000) {
    return {
      ok: false,
      message: "Ownership percents have to add up to 100.",
    };
  }
  return { ok: true, owners };
}
