"use client";

import { useState } from "react";
import { Loader2, OctagonAlert, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SUGGESTIONS = [
  "Which students are below 75% attendance?",
  "How is section A doing?",
  "Give me the overall attendance summary.",
];

export default function AiQueryPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  async function ask(q: string) {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setRows([]);
    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setAnswer(data.answer);
      setRows(data.rows ?? []);
    } catch {
      setError("Could not reach the AI service.");
    } finally {
      setLoading(false);
    }
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Ask about attendance in plain English. Answers are narrated from real numbers computed by SQL — the AI never
        invents or calculates a percentage itself.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which students in CSE are below 75%?"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Ask
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={loading}
          >
            {s}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <OctagonAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {answer && (
        <Card className="shadow-sm">
          <CardContent className="flex items-start gap-3 pt-6">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-foreground">{answer}</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c}>{String(r[c] ?? "")}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
