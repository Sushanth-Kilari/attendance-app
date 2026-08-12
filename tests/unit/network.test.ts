import { describe, it, expect } from "vitest";
import { ipInCidr, isIpAllowed, getClientIp } from "@/lib/network";

describe("ipInCidr", () => {
  it("matches an IP within a /24 range", () => {
    expect(ipInCidr("203.0.113.42", "203.0.113.0/24")).toBe(true);
  });

  it("rejects an IP outside a /24 range", () => {
    expect(ipInCidr("203.0.114.42", "203.0.113.0/24")).toBe(false);
  });

  it("treats a bare IP (no /bits) as an exact /32 match", () => {
    expect(ipInCidr("203.0.113.42", "203.0.113.42")).toBe(true);
    expect(ipInCidr("203.0.113.43", "203.0.113.42")).toBe(false);
  });

  it("matches a /32 explicitly", () => {
    expect(ipInCidr("203.0.113.42", "203.0.113.42/32")).toBe(true);
  });

  it("/0 matches everything", () => {
    expect(ipInCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
  });

  it("rejects malformed IPs and CIDRs", () => {
    expect(ipInCidr("not-an-ip", "203.0.113.0/24")).toBe(false);
    expect(ipInCidr("203.0.113.42", "not-a-cidr/24")).toBe(false);
    expect(ipInCidr("203.0.113.42", "203.0.113.0/99")).toBe(false);
    expect(ipInCidr("203.0.113.256", "203.0.113.0/24")).toBe(false);
  });
});

describe("isIpAllowed", () => {
  const ranges = [{ cidr: "203.0.113.0/24" }, { cidr: "198.51.100.7/32" }];

  it("allows an IP matching any configured range", () => {
    expect(isIpAllowed("203.0.113.50", ranges)).toBe(true);
    expect(isIpAllowed("198.51.100.7", ranges)).toBe(true);
  });

  it("rejects an IP matching no range", () => {
    expect(isIpAllowed("8.8.8.8", ranges)).toBe(false);
  });

  it("rejects a null IP", () => {
    expect(isIpAllowed(null, ranges)).toBe(false);
  });

  it("rejects everything when no ranges are configured", () => {
    expect(isIpAllowed("203.0.113.50", [])).toBe(false);
  });
});

describe("getClientIp", () => {
  it("takes the leftmost entry of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.50, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(headers)).toBe("203.0.113.50");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.50" });
    expect(getClientIp(headers)).toBe("203.0.113.50");
  });

  it("returns null when neither header is present", () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
