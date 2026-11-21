// Cloudflare Worker for the L'Oréal Routine Builder.
// - POST requests: forwards the chat messages to OpenAI and returns the reply.
// - GET requests: serves the website files (index.html, script.js, etc.).
// The OpenAI key is stored ONLY as the encrypted Cloudflare secret OPENAI_API_KEY.
// It is never written in this file or in any browser code.

// Websites that are allowed to call this Worker from a browser.
const ALLOWED_ORIGINS = [
  "https://09-prj-loreal-routine-builder.hq3717.workers.dev",
  "https://ibraheem-05.github.io",
  "http://localhost:8788",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

// GitHub Codespaces preview pages look like https://name-3000.app.github.dev,
// so we also allow any address that matches this pattern.
function isAllowedOrigin(origin) {
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.app\.github\.dev$/.test(origin)
  );
}

// The Worker always uses its own instructions, so visitors can't change them.
const SYSTEM_PROMPT =
  "You are a friendly L'Oréal skincare and beauty advisor. " +
  "When the user selects products, build a clear, personalized routine using ONLY those products: " +
  "give the correct order, the benefit of each step, and simple usage directions (morning/evening when it applies). " +
  "Answer follow-up questions about the routine, skincare, haircare, makeup, and fragrance. " +
  "If a question is unrelated to beauty, politely steer the conversation back to beauty topics. " +
  "Do not invent ingredients, prices, or medical claims, and do not give medical diagnoses. " +
  "Write in plain text without markdown symbols (no asterisks or pound signs); use short paragraphs or numbered lines.";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // CORS headers let the browser page talk to this Worker.
    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // Small helper that sends a JSON response.
    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });

    // Browsers send an OPTIONS "preflight" request before a JSON POST.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Page loads: hand the request to the static website files.
    if (request.method === "GET" || request.method === "HEAD") {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return reply({ status: "ok", service: "L'Oreal routine builder API", method: "POST" });
    }

    if (request.method !== "POST") {
      return reply({ error: "Use POST to send a chat message." }, 405);
    }
    if (origin && !isAllowedOrigin(origin)) {
      return reply({ error: "Origin not allowed." }, 403);
    }
    if (!env.OPENAI_API_KEY) {
      return reply({ error: "The AI service is not configured yet." }, 503);
    }

    // Read and check the request body.
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 120000) return reply({ error: "Request is too large." }, 413);
      input = JSON.parse(raw);
    } catch {
      return reply({ error: "Request body must be valid JSON." }, 400);
    }

    // Keep only user/assistant messages (our own system prompt is added below).
    const submitted = Array.isArray(input?.messages) ? input.messages : [];
    const messages = submitted
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: m.content }));

    const valid =
      messages.length > 0 &&
      messages.length <= 40 &&
      messages[messages.length - 1].role === "user" &&
      messages.every(
        (m) => typeof m.content === "string" && m.content.trim() !== "" && m.content.length <= 20000
      );
    if (!valid) {
      return reply({ error: "Send chat messages that end with a user message." }, 400);
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_completion_tokens: 900,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        // Log the provider's error type to Cloudflare logs (never the key).
        const provider = await response.json().catch(() => ({}));
        console.error("OpenAI error", response.status, provider?.error?.code, provider?.error?.type);

        if (response.status === 401 || response.status === 403) {
          return reply({ error: "The AI service credentials need attention." }, 502);
        }
        if (response.status === 429) {
          return reply({ error: "The AI service is at its limit right now. Try again later." }, 503);
        }
        return reply({ error: "The AI service could not complete the request." }, 502);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return reply({ error: "The AI service returned an empty answer." }, 502);
      }

      // Same shape the frontend reads: data.choices[0].message.content
      return reply({ choices: [{ message: { content } }] });
    } catch (error) {
      console.error("Could not reach OpenAI:", error?.message);
      return reply({ error: "The Worker could not reach the AI service." }, 502);
    }
  },
};
