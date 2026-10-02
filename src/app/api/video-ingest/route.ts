import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseIngestPayload } from "@/lib/video-ingest";

// Machine endpoint for the centre edge worker. Authenticated by a
// per-centre ingest key (header x-ingest-key), verified INSIDE Postgres by
// ingest_video_observation() (023_video_observations.sql). Deliberately
// uses the anon key, never the service-role key (CLAUDE.md rule 1): the
// database function is the only thing this route can reach, and it can only
// append an observation for the centre whose key was presented.
export async function POST(request: Request) {
  const key = request.headers.get("x-ingest-key");
  if (!key) return NextResponse.json({ error: "Missing x-ingest-key header." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseIngestPayload(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: { status: string; error?: string }[] = [];
  for (const o of parsed.value.observations) {
    const { data, error } = await supabase.rpc("ingest_video_observation", {
      p_centre_code: parsed.value.centre_code,
      p_ingest_key: key,
      p_camera_label: o.camera_label,
      p_observed_at: o.observed_at,
      p_person_count: o.person_count,
      p_equipment: o.equipment,
      p_frames_sampled: o.frames_sampled,
      p_mean_confidence: o.mean_confidence,
      p_model_version: o.model_version,
    });

    if (error) {
      // 28000 = invalid_authorization_specification (bad centre/key). Stop
      // at once — every remaining row in the batch would fail identically.
      if (error.code === "28000") return NextResponse.json({ error: "Invalid centre or ingest key." }, { status: 401 });
      results.push({ status: "error", error: error.message });
    } else {
      results.push({ status: (data as { status: string }).status });
    }
  }

  return NextResponse.json({ results });
}
