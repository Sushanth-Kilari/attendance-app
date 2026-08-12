import { GoogleGenAI, Type } from "@google/genai";

// Deliberately separate from gemini.ts: that file is scoped by CLAUDE.md rule 4
// to read-only narration over ai_readonly.* views. Drafting circular text is a
// different, write-adjacent use case and shouldn't share that file's contract.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey });
}

const DRAFT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    body: { type: Type.STRING },
  },
  required: ["title", "body"],
};

export type CircularDraft = { title: string; body: string };

function fallbackDraft(occasion: string, dateLabel?: string): CircularDraft {
  return {
    title: `Circular: ${occasion}`,
    body: `This is to inform all students that the college will remain closed on account of ${occasion}${
      dateLabel ? ` on ${dateLabel}` : ""
    }. Regular classes will resume on the next working day.`,
  };
}

// occasion: e.g. "Independence Day" or free text an HOD typed in.
// dateLabel: e.g. "15 August 2026" — omitted for manually-authored circulars
// with no fixed calendar date.
export async function draftCircular(occasion: string, dateLabel?: string): Promise<CircularDraft> {
  try {
    const ai = client();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Write a short, formal circular for a university notifying students about: "${occasion}"${
                dateLabel ? ` (date: ${dateLabel})` : ""
              }.

Keep it to 2-4 sentences, plain professional tone, no markdown. Return a short title and the body text.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: DRAFT_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned no draft.");
    const parsed = JSON.parse(text) as CircularDraft;
    if (!parsed.title || !parsed.body) throw new Error("Gemini returned an incomplete draft.");
    return parsed;
  } catch {
    // Never let a Gemini hiccup leave the HOD's queue silently empty.
    return fallbackDraft(occasion, dateLabel);
  }
}
