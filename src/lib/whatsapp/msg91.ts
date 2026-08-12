// Best-effort scaffold, NOT verified against a live account. MSG91's public
// docs are largely gated behind dashboard/marketing pages, so this endpoint
// and payload shape are built from their documented general contract, not a
// confirmed request/response pair. Once a real MSG91 account + approved
// template exist, cross-check this against the code snippet MSG91's
// dashboard auto-generates for that template (namespace, language code, and
// variable nesting are account/template-specific) before relying on it.
const MSG91_ENDPOINT = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

// WhatsApp template body variables cap around 1024 characters.
const MAX_BODY_LENGTH = 1000;

function config() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;
  const templateName = process.env.MSG91_WHATSAPP_TEMPLATE_NAME;
  const languageCode = process.env.MSG91_WHATSAPP_LANGUAGE_CODE || "en";

  if (!authKey) throw new Error("MSG91_AUTH_KEY is not set.");
  if (!integratedNumber) throw new Error("MSG91_WHATSAPP_INTEGRATED_NUMBER is not set.");
  if (!templateName) throw new Error("MSG91_WHATSAPP_TEMPLATE_NAME is not set.");

  return { authKey, integratedNumber, templateName, languageCode };
}

// Assumes ONE generic pre-approved template with two body variables
// (title, body) reused for every circular — see the plan's note on getting
// that template approved through MSG91/Meta before this can send anything.
export async function sendCircularWhatsApp({
  title,
  body,
  recipients,
}: {
  title: string;
  body: string;
  recipients: string[];
}): Promise<{ sent: number; failed: number }> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const { authKey, integratedNumber, templateName, languageCode } = config();
  const truncatedBody = body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body;

  const response = await fetch(MSG91_ENDPOINT, {
    method: "POST",
    headers: {
      authkey: authKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      integrated_number: integratedNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          to_and_components: recipients.map((phone) => ({
            to: [phone],
            components: {
              body_1: { type: "text", value: title },
              body_2: { type: "text", value: truncatedBody },
            },
          })),
        },
      },
    }),
  });

  // MSG91's exact per-recipient success/failure reporting in the response
  // body isn't confirmed (see file header) — treat the whole batch as one
  // outcome rather than guess at a partial-result shape it might not return.
  if (!response.ok) {
    return { sent: 0, failed: recipients.length };
  }
  return { sent: recipients.length, failed: 0 };
}
