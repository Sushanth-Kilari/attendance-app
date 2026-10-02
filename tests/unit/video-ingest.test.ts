import { describe, it, expect } from "vitest";
import { parseIngestPayload, MAX_BATCH } from "@/lib/video-ingest";

const obs = (over: Record<string, unknown> = {}) => ({
  camera_label: "Lab-1 front",
  observed_at: "2026-10-02T10:15:00+05:30",
  person_count: 18,
  ...over,
});

const payload = (observations: unknown[] = [obs()], centre_code = "TC-HYD-014") => ({ centre_code, observations });

describe("parseIngestPayload", () => {
  it("accepts a minimal observation and normalises it", () => {
    const r = parseIngestPayload(payload());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.observations[0]).toMatchObject({
      camera_label: "Lab-1 front",
      observed_at: "2026-10-02T04:45:00.000Z",
      person_count: 18,
      equipment: {},
      frames_sampled: 1,
      mean_confidence: null,
      model_version: null,
    });
  });

  it("accepts plain-count and operating-count equipment", () => {
    const r = parseIngestPayload(payload([obs({ equipment: { "Welding bench": 5, "CNC lathe": { count: 2, operating: 1 } } })]));
    expect(r.ok).toBe(true);
  });

  it("rejects operating greater than count", () => {
    const r = parseIngestPayload(payload([obs({ equipment: { "CNC lathe": { count: 1, operating: 2 } } })]));
    expect(r.ok).toBe(false);
  });

  it.each([
    ["negative head-count", { person_count: -1 }],
    ["fractional head-count", { person_count: 2.5 }],
    ["absurd head-count", { person_count: 5000 }],
    ["missing camera", { camera_label: "" }],
    ["bad timestamp", { observed_at: "yesterday-ish" }],
    ["confidence above 1", { mean_confidence: 1.2 }],
    ["zero frames", { frames_sampled: 0 }],
    ["array equipment", { equipment: [1, 2] }],
    ["string equipment value", { equipment: { Bench: "five" } }],
  ])("rejects %s", (_name, over) => {
    expect(parseIngestPayload(payload([obs(over)])).ok).toBe(false);
  });

  it("rejects an empty or oversized batch and a missing centre", () => {
    expect(parseIngestPayload(payload([])).ok).toBe(false);
    expect(parseIngestPayload(payload(Array.from({ length: MAX_BATCH + 1 }, () => obs()))).ok).toBe(false);
    expect(parseIngestPayload(payload([obs()], "  ")).ok).toBe(false);
    expect(parseIngestPayload(null).ok).toBe(false);
  });

  it("drops unknown fields, so an image or identity field can never pass through", () => {
    const r = parseIngestPayload(payload([obs({ frame_jpeg_base64: "AAAA", face_embedding: [0.1], person_names: ["x"] })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value.observations[0]).sort()).toEqual(
      ["camera_label", "equipment", "frames_sampled", "mean_confidence", "model_version", "observed_at", "person_count"],
    );
  });
});

describe("worker contract", () => {
  // The Python worker's tests pin its output to this same fixture
  // (worker/tests/test_contract.py), so neither side can drift alone.
  it("accepts the payload the edge worker produces", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../worker/tests/fixtures/payload_example.json"), "utf8"));
    const r = parseIngestPayload(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.observations[0].equipment["Desktop computer"]).toEqual({ count: 12, operating: 11 });
  });
});
