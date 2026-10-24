/**
 * Ask the report's AI phrasing: one rule-based answer rewritten in plain words by Gemini.
 * Only the answer's own sentences are sent, never the report, its code blocks or the account.
 */
"use strict";

const MODEL = "gemini-flash-latest";
const MAX_LINES = 12;
const MAX_CHARS = 4000;
const DAILY = 60;
const LANGS = {
  en: "English",
  es: "Latin American Spanish, addressing the reader as tú",
  pt: "Brazilian Portuguese",
  de: "German, addressing the reader as Sie",
  fr: "French, addressing the reader as vous",
  it: "Italian"
};
const ID = /\b[A-Z][A-Z0-9]{0,5}-\d{1,3}\b/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

function fail(status, error, code) {
  return { ok: false, status, error, code };
}

function cleanInput(input) {
  const body = input || {};
  const lang = LANGS[String(body.lang || "").slice(0, 2)] ? String(body.lang).slice(0, 2) : "en";
  const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, MAX_LINES).map((line) => String(line || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const ref = String(body.ref || "").toUpperCase().match(/^[A-Z][A-Z0-9]{0,5}-\d{1,3}$/) ? String(body.ref).toUpperCase() : "";
  let source = [title].concat(lines).join("\n");
  if (source.length > MAX_CHARS) source = source.slice(0, MAX_CHARS);
  return { lang, title, lines, ref, source };
}

function instruction(lang) {
  return [
    "You rewrite one answer from a website QA report so that a site owner who is not a specialist understands it.",
    "Write in " + LANGS[lang] + ".",
    "Use only what the answer says. Add no fact, number, cause, product, tool or advice that is not in it.",
    "Keep ids such as F-01 or SEC-02, header names, file names, code words and URLs exactly as written.",
    "Write two to five short sentences of plain prose: no list, no Markdown, no heading, no greeting, no closing offer."
  ].join(" ");
}

function numbers(text) {
  return (String(text).match(NUMBER) || []).map((value) => value.replace(",", "."));
}

// The phrasing is kept only when it brings no id or number the answer does not hold, and still names the answer's subject.
function faithful(source, output, ref) {
  const ids = new Set(String(source).match(ID) || []);
  const nums = new Set(numbers(source));
  if ((String(output).match(ID) || []).some((id) => !ids.has(id))) return false;
  if (numbers(output).some((value) => !nums.has(value))) return false;
  return !ref || String(output).indexOf(ref) !== -1;
}

async function underCap(store, id, now) {
  if (!store || !id) return true;
  const key = id + "-" + new Date(now).toISOString().slice(0, 10);
  const row = (await store.get("url_review_ask_phrases", key)) || {};
  const used = Number(row.count) || 0;
  if (used >= DAILY) return false;
  await store.set("url_review_ask_phrases", key, { count: used + 1, expireAt: new Date(now + 2 * 864e5) });
  return true;
}

async function phrase(options) {
  const opts = options || {};
  if (!opts.key) return fail(503, "AI phrasing is off.", "off");
  const input = cleanInput(opts.input);
  if (!input.lines.length) return fail(400, "There is nothing to phrase.", "empty");
  if (!(await underCap(opts.store, opts.id, opts.now || Date.now()))) return fail(429, "AI phrasing has reached today's limit for this report.", "limit");
  const model = String(opts.model || MODEL).replace(/[^\w.-]/g, "");
  let res;
  try {
    res = await (opts.fetch || fetch)("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction(input.lang) }] },
        contents: [{ role: "user", parts: [{ text: input.source }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "low" } }
      })
    });
  } catch (error) {
    return fail(502, "AI phrasing did not answer.", "failed");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail(502, "AI phrasing did not answer.", "failed");
  const candidate = (data.candidates || [])[0] || {};
  // Flash models think before answering and spend the output budget on it; a reply that did not stop on its own is cut short.
  if (candidate.finishReason !== "STOP") return fail(502, "AI phrasing did not answer.", "failed");
  const parts = (candidate.content || {}).parts || [];
  const text = parts.map((part) => part.text || "").join("").replace(/[*_#`]+/g, "").replace(/\s+/g, " ").trim();
  if (!text) return fail(502, "AI phrasing did not answer.", "failed");
  if (!faithful(input.source, text, input.ref)) return fail(422, "The AI phrasing added something the answer does not say, so it was dropped.", "unfaithful");
  return { ok: true, text, lang: input.lang };
}

module.exports = { phrase, faithful, cleanInput, instruction, LANGS, DAILY, MODEL };
