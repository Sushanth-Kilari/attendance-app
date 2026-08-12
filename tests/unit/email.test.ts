import { describe, it, expect } from "vitest";
import { textToHtml } from "@/lib/email/resend";

describe("textToHtml", () => {
  it("wraps plain text in a <p> tag", () => {
    expect(textToHtml("Hello")).toBe("<p>Hello</p>");
  });

  it("escapes &, <, and >", () => {
    expect(textToHtml("A & B < C > D")).toBe("<p>A &amp; B &lt; C &gt; D</p>");
  });

  it("converts newlines to <br>", () => {
    expect(textToHtml("Line one\nLine two")).toBe("<p>Line one<br>Line two</p>");
  });

  it("escapes before converting newlines, so a literal <br> in the input stays escaped", () => {
    expect(textToHtml("<br>\nreal break")).toBe("<p>&lt;br&gt;<br>real break</p>");
  });
});
