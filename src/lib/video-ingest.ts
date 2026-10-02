// Validation for the edge worker's ingest payload. Counts only — this shape
// deliberately has nowhere to put an image, crop, embedding or identity.

export const MAX_BATCH = 100;

export type EquipmentValue = number | { count: number; operating?: number };

export type Observation = {
  camera_label: string;
  observed_at: string; // ISO-8601
  person_count: number;
  equipment: Record<string, EquipmentValue>;
  frames_sampled: number;
  mean_confidence: number | null;
  model_version: string | null;
};

export type IngestPayload = { centre_code: string; observations: Observation[] };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 1000;

function parseEquipment(raw: unknown): Result<Record<string, EquipmentValue>> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "equipment must be an object." };

  const out: Record<string, EquipmentValue> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || name.length > 80) return { ok: false, error: "equipment item names must be 1-80 characters." };
    if (isCount(v)) {
      out[name] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      const { count, operating } = v as { count?: unknown; operating?: unknown };
      if (!isCount(count)) return { ok: false, error: `equipment "${name}": count must be a whole number 0-1000.` };
      if (operating !== undefined && (!isCount(operating) || operating > count)) {
        return { ok: false, error: `equipment "${name}": operating must be a whole number no greater than count.` };
      }
      out[name] = operating === undefined ? { count } : { count, operating };
    } else {
      return { ok: false, error: `equipment "${name}" must be a number or {count, operating}.` };
    }
  }
  return { ok: true, value: out };
}

function parseObservation(raw: unknown, index: number): Result<Observation> {
  const where = `observations[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: `${where} must be an object.` };
  const o = raw as Record<string, unknown>;

  if (typeof o.camera_label !== "string" || !o.camera_label.trim() || o.camera_label.length > 80) {
    return { ok: false, error: `${where}.camera_label is required (max 80 chars).` };
  }
  if (typeof o.observed_at !== "string" || Number.isNaN(Date.parse(o.observed_at))) {
    return { ok: false, error: `${where}.observed_at must be an ISO-8601 timestamp.` };
  }
  if (!isCount(o.person_count)) return { ok: false, error: `${where}.person_count must be a whole number 0-1000.` };

  const equipment = parseEquipment(o.equipment);
  if (!equipment.ok) return { ok: false, error: `${where}: ${equipment.error}` };

  const frames = o.frames_sampled === undefined ? 1 : o.frames_sampled;
  if (typeof frames !== "number" || !Number.isInteger(frames) || frames < 1 || frames > 100000) {
    return { ok: false, error: `${where}.frames_sampled must be a positive whole number.` };
  }

  const conf = o.mean_confidence === undefined ? null : o.mean_confidence;
  if (conf !== null && (typeof conf !== "number" || conf < 0 || conf > 1)) {
    return { ok: false, error: `${where}.mean_confidence must be between 0 and 1.` };
  }

  const model = o.model_version === undefined ? null : o.model_version;
  if (model !== null && (typeof model !== "string" || model.length > 80)) {
    return { ok: false, error: `${where}.model_version must be a string (max 80 chars).` };
  }

  return {
    ok: true,
    value: {
      camera_label: o.camera_label.trim(),
      observed_at: new Date(o.observed_at).toISOString(),
      person_count: o.person_count,
      equipment: equipment.value,
      frames_sampled: frames,
      mean_confidence: conf,
      model_version: model,
    },
  };
}

export function parseIngestPayload(body: unknown): Result<IngestPayload> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  if (typeof b.centre_code !== "string" || !b.centre_code.trim()) return { ok: false, error: "centre_code is required." };
  if (!Array.isArray(b.observations) || b.observations.length === 0) {
    return { ok: false, error: "observations must be a non-empty array." };
  }
  if (b.observations.length > MAX_BATCH) return { ok: false, error: `At most ${MAX_BATCH} observations per request.` };

  const observations: Observation[] = [];
  for (let i = 0; i < b.observations.length; i++) {
    const parsed = parseObservation(b.observations[i], i);
    if (!parsed.ok) return parsed;
    observations.push(parsed.value);
  }
  return { ok: true, value: { centre_code: b.centre_code.trim(), observations } };
}
