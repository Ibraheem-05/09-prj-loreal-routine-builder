// Cloudflare Worker for the L'Oréal Routine Builder.
// - POST requests: sends the chat to OpenAI (with live web search) and returns the reply.
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

// Languages the page can ask for (the page sends "en" or "ar").
// To add another right-to-left language, add it here and in script.js.
const LANGUAGE_NAMES = { en: "English", ar: "Arabic" };
const SOURCES_LABEL = { en: "Sources:", ar: "المصادر:" };

// The Worker always uses its own instructions, so visitors can't change them.
function buildSystemPrompt(language, canSearch) {
  let prompt =
    "You are a friendly L'Oréal skincare and beauty advisor. " +
    "When the user selects products, build a clear, personalized routine using ONLY those products: " +
    "give the correct order, the benefit of each step, and simple usage directions (morning/evening when it applies). " +
    "Answer follow-up questions about the routine, skincare, haircare, makeup, and fragrance. " +
    "If a question is unrelated to beauty, politely steer the conversation back to beauty topics. " +
    "Do not invent ingredients, prices, or medical claims, and do not give medical diagnoses. " +
    "Write in plain text without markdown symbols (no asterisks or pound signs); use short paragraphs or numbered lines.";

  if (canSearch) {
    prompt +=
      " Use web search to add current, accurate information about the products or routine " +
      "(for example how to use an ingredient, product updates, or sun-safety tips) and mention where it came from. " +
      "Only rely on pages you actually found.";
  }
  if (language !== "en") {
    prompt += ` Write your entire answer in ${LANGUAGE_NAMES[language]}.`;
  }
  return prompt;
}

// Small helper that calls the OpenAI API and never throws.
async function callOpenAI(env, path, body, timeoutMs) {
  try {
    const response = await fetch(`https://api.openai.com${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Log the provider's error type to Cloudflare logs (never the key).
      console.error("OpenAI error", path, body.model, response.status, data?.error?.code, data?.error?.type);
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    console.error("Could not reach OpenAI:", path, error?.message);
    return { ok: false, status: 0, data: {} };
  }
}

// Read the answer + web links out of a Responses API result.
function readResponsesResult(data) {
  let text = "";
  const sources = [];
  for (const item of data?.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type !== "output_text") continue;
      text += part.text || "";
      for (const note of part.annotations || []) {
        if (note.type === "url_citation") sources.push({ title: note.title, url: note.url });
      }
    }
  }
  return { text, sources };
}

// Read the answer + web links out of a Chat Completions result.
function readChatResult(data) {
  const message = data?.choices?.[0]?.message || {};
  const sources = [];
  for (const note of message.annotations || []) {
    if (note.type === "url_citation" && note.url_citation) {
      sources.push({ title: note.url_citation.title, url: note.url_citation.url });
    }
  }
  return { text: message.content || "", sources };
}

// Remove duplicate links and tracking parameters, keep at most 5.
function cleanSources(sources) {
  const seen = new Set();
  const clean = [];
  for (const source of sources) {
    try {
      const url = new URL(source.url);
      url.searchParams.delete("utm_source");
      const link = url.toString();
      if (seen.has(link)) continue;
      seen.add(link);
      clean.push({ title: (source.title || url.hostname).trim(), url: link });
    } catch {
      // Skip anything that is not a real web address.
    }
  }
  return clean.slice(0, 5);
}

// Try to answer with live web search. Returns null if search is not available,
// so the caller can fall back to a normal answer.
async function answerWithSearch(env, messages, language) {
  const system = buildSystemPrompt(language, true);

  // Attempt 1: Responses API with the web_search tool.
  const first = await callOpenAI(env, "/v1/responses", {
    model: "gpt-4.1",
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    input: [{ role: "system", content: system }, ...messages],
    max_output_tokens: 1500,
  }, 40000);
  if (first.ok) {
    const result = readResponsesResult(first.data);
    if (result.text.trim()) return { ...result, mode: "responses+web_search" };
  }
  if (first.status === 401 || first.status === 429) return { failed: first };

  // Attempt 2: OpenAI's search-enabled Chat Completions model.
  const second = await callOpenAI(env, "/v1/chat/completions", {
    model: "gpt-5-search-api",
    web_search_options: {},
    messages: [{ role: "system", content: system }, ...messages],
  }, 40000);
  if (second.ok) {
    const result = readChatResult(second.data);
    if (result.text.trim()) return { ...result, mode: "chat+search-model" };
  }
  if (second.status === 401 || second.status === 429) return { failed: second };

  return null;
}

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

    // Turns an OpenAI error into a short, safe message for the page.
    const failure = (result) => {
      if (result.status === 401 || result.status === 403) {
        return reply({ error: "The AI service credentials need attention." }, 502);
      }
      if (result.status === 429) {
        return reply({ error: "The AI service is at its limit right now. Try again later." }, 503);
      }
      return reply({ error: "The AI service could not complete the request." }, 502);
    };

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

    // Keep only user/assistant messages (our own system prompt is added later).
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

    // Language chosen on the page (defaults to English).
    const language = input?.language in LANGUAGE_NAMES ? input.language : "en";

    // 1) Preferred: answer with live web search and links.
    const searched = await answerWithSearch(env, messages, language);
    if (searched?.failed) return failure(searched.failed);

    let text;
    let sources = [];
    let mode;
    if (searched) {
      text = searched.text.trim();
      sources = cleanSources(searched.sources);
      mode = searched.mode;
    } else {
      // 2) Fallback: a normal answer without web search, so the chat still works.
      const plain = await callOpenAI(env, "/v1/chat/completions", {
        model: "gpt-4.1",
        messages: [{ role: "system", content: buildSystemPrompt(language, false) }, ...messages],
        max_completion_tokens: 900,
      }, 30000);
      if (!plain.ok) return failure(plain);
      text = (plain.data?.choices?.[0]?.message?.content || "").trim();
      mode = "plain";
    }

    if (!text) {
      return reply({ error: "The AI service returned an empty answer." }, 502);
    }
    console.log("answered with", mode, "sources:", sources.length);

    // Put the web links under the answer so the page can show them.
    let content = text;
    if (sources.length > 0) {
      const lines = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`);
      content += `\n\n${SOURCES_LABEL[language]}\n${lines.join("\n")}`;
    }

    // Same shape the frontend reads: data.choices[0].message.content
    return reply({ choices: [{ message: { content } }], sources, mode });
  },
};
