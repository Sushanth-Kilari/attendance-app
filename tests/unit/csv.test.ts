import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a basic header + rows", () => {
    const rows = parseCsv("a,b\n1,2\n3,4");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("handles a quoted field with an embedded comma", () => {
    const rows = parseCsv('name,note\nAarav,"Sharma, CSE"');
    expect(rows).toEqual([{ name: "Aarav", note: "Sharma, CSE" }]);
  });

  it("handles an escaped quote inside a quoted field", () => {
    const rows = parseCsv('name,note\nAarav,"He said ""hi"""');
    expect(rows).toEqual([{ name: "Aarav", note: 'He said "hi"' }]);
  });

  it("handles an embedded newline inside a quoted field", () => {
    const rows = parseCsv('name,note\nAarav,"line one\nline two"');
    expect(rows).toEqual([{ name: "Aarav", note: "line one\nline two" }]);
  });

  it("trims header keys and cell values", () => {
    const rows = parseCsv(" a , b \n 1 , 2 ");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });

  it("filters out blank rows", () => {
    const rows = parseCsv("a,b\n1,2\n\n\n3,4");
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("returns an empty array for a header-only or empty input", () => {
    expect(parseCsv("a,b")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
});
