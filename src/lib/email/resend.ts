import { Resend } from "resend";

export function textToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
}

function client() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  return new Resend(apiKey);
}

function fromAddress() {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error("RESEND_FROM_EMAIL is not set.");
  return from;
}

// Resend's batch endpoint sends each recipient their own message (not one
// email with everyone in "to") and reports per-item failures rather than
// failing the whole batch, so a handful of bad addresses doesn't block
// delivery to the rest of the department.
export async function sendCircularEmails({
  subject,
  html,
  recipients,
}: {
  subject: string;
  html: string;
  recipients: string[];
}): Promise<{ sent: number; failed: number }> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const resend = client();
  const from = fromAddress();

  const BATCH_SIZE = 100; // Resend's batch send caps at 100 messages per call
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const { data, error } = await resend.batch.send(
      chunk.map((to) => ({ from, to, subject, html })),
    );

    if (error) {
      failed += chunk.length;
      continue;
    }
    sent += data?.data?.length ?? 0;
    failed += chunk.length - (data?.data?.length ?? 0);
  }

  return { sent, failed };
}
