import { GoogleGenAI, Type } from "@google/genai";

// "gemini-2.0-flash" has zero free-tier quota on new API keys as of writing —
// the "-lite-latest" alias tracks whichever lite model currently has real
// free-tier quota, and stays that way as Google rotates model names.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey });
}

export type QueryKind = "student_subject_attendance" | "section_summary" | "defaulters";

export type RoutedQuery = {
  query: QueryKind;
  department_code: string | null;
  section_name: string | null;
  year: number | null;
};

const ROUTING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    query: {
      type: Type.STRING,
      enum: ["student_subject_attendance", "section_summary", "defaulters"],
    },
    department_code: { type: Type.STRING, nullable: true },
    section_name: { type: Type.STRING, nullable: true },
    year: { type: Type.INTEGER, nullable: true },
  },
  required: ["query"],
};

// Step 1: interpret the question into a fixed query + filters. The model
// never sees or touches the database directly — it only picks from these
// three pre-built, role-checked SQL functions.
export async function routeQuestion(question: string): Promise<RoutedQuery> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are a routing layer for a university attendance system. Given a faculty/HOD/admin's question, decide which data source answers it and what filters to apply.

Data sources:
- "student_subject_attendance": per-student, per-subject attendance rows. Use for questions about specific students or subjects.
- "section_summary": per-section, per-subject averages and defaulter counts. Use for questions about how a section or subject is doing overall.
- "defaulters": students below 75% attendance. Use for questions about who is at risk or below the threshold.

Filters (all optional — use null when not mentioned in the question): department_code (e.g. "CSE", "ECE"), section_name (e.g. "A", "B"), year (1-6).

Question: "${question}"`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ROUTING_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned no routing response.");
  return JSON.parse(text) as RoutedQuery;
}

// Step 2: narrate the real, SQL-computed rows in plain English. The model
// is explicitly told not to calculate anything — only describe what's
// already there, per CLAUDE.md's "AI narrates, never computes" rule.
export async function narrateResults(question: string, rows: Record<string, unknown>[]): Promise<string> {
  const ai = client();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `You are answering a faculty/HOD/admin's question about student attendance using ONLY the data below — it was already computed by SQL. Never calculate, estimate, or invent any number that isn't literally present in this data. If the data is empty, say so plainly instead of guessing.

Question: "${question}"

Data (JSON array, ${rows.length} rows):
${JSON.stringify(rows, null, 2)}

Answer in 2-4 sentences, plain English, no markdown.`,
          },
        ],
      },
    ],
  });

  return response.text ?? "I couldn't generate an answer.";
}
