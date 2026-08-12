import { describe, it, expect } from "vitest";
import { todayIST, dayOfWeekIST } from "@/lib/date";

describe("todayIST", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("dayOfWeekIST", () => {
  it("maps known dates to the right 1=Mon..7=Sun value", () => {
    expect(dayOfWeekIST("2026-08-03")).toBe(1); // Monday
    expect(dayOfWeekIST("2026-08-05")).toBe(3); // Wednesday
    expect(dayOfWeekIST("2026-08-08")).toBe(6); // Saturday
    expect(dayOfWeekIST("2026-08-09")).toBe(7); // Sunday
  });
});
