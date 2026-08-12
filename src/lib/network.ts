// IPv4-only: campus networks in scope for this app don't run IPv6 client
// addressing, and hand-rolling dual-stack CIDR matching isn't worth it
// for a small admin-entered allowlist.
function ipToLong(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) + octet;
  }
  return n >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.trim().split("/");
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipLong = ipToLong(ip);
  const rangeLong = ipToLong(range);
  if (ipLong === null || rangeLong === null) return false;

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipLong & mask) === (rangeLong & mask);
}

export function isIpAllowed(ip: string | null, ranges: { cidr: string }[]): boolean {
  if (!ip) return false;
  return ranges.some((r) => ipInCidr(ip, r.cidr));
}

// Vercel/most proxies set x-forwarded-for as "client, proxy1, proxy2" —
// the leftmost entry is the original client.
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}
