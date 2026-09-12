// Anthropic Messages API integration. Persona chat, synthetic users and JSON judges.
// Never blocks progression: on any failure the caller gets { ok: false } plus a neutral result.
import Anthropic from '@anthropic-ai/sdk';
import { loadSettings } from './state.js';

// USD per million tokens, used for the facilitator cost counter.
const PRICES = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};
export const MODEL_OPTIONS = Object.keys(PRICES);
export const DEFAULT_MODEL = 'claude-opus-5';

let usageListener = null;
export function onUsage(fn) { usageListener = fn; }

function getClient() {
  const s = loadSettings();
  if (!s.apiKey) return null;
  return new Anthropic({ apiKey: s.apiKey, baseURL: s.baseURL || undefined, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60000 });
}

export function llmAvailable() {
  return Boolean(loadSettings().apiKey);
}

function report(model, usage, error) {
  const p = PRICES[model] || PRICES[DEFAULT_MODEL];
  const inTok = usage?.input_tokens || 0;
  const outTok = usage?.output_tokens || 0;
  const costUsd = (inTok * p.input + outTok * p.output) / 1e6;
  usageListener?.({ inputTokens: inTok, outputTokens: outTok, costUsd, error: Boolean(error) });
}

export async function chat({ system, messages, maxTokens = 600 }) {
  const client = getClient();
  const model = loadSettings().model || DEFAULT_MODEL;
  if (!client) return { ok: false, text: '', reason: 'no_key' };
  try {
    const res = await client.messages.create({ model, max_tokens: maxTokens, system, messages });
    report(model, res.usage);
    if (res.stop_reason === 'refusal') return { ok: false, text: '', reason: 'refusal' };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { ok: true, text };
  } catch (e) {
    console.warn('LLM call failed', e);
    report(model, null, e);
    return { ok: false, text: '', reason: e?.message || 'error' };
  }
}

export function stripFences(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

// Judge free text against rubric dimensions. Returns scores 0 to 10 per dimension and a one sentence rationale.
export async function judge({ task, dimensions, text, context = '' }) {
  const neutral = {};
  dimensions.forEach((d) => (neutral[d.id] = 5));
  const system = `You are a strict but fair judge for an AI Product Management training sandbox. Score the learner's response on each rubric dimension from 0 to 10. Return only JSON with this shape and nothing else: {"scores": {${dimensions.map((d) => `"${d.id}": <0-10>`).join(', ')}}, "rationale": "<one sentence>", "flags": {"over_promised": <true|false>, "references_evidence": <true|false>}}. No code fences.`;
  const user = `Task: ${task}\n\nRubric:\n${dimensions.map((d) => `- ${d.id}: ${d.desc}`).join('\n')}\n\nContext available to the learner:\n${context || '(none)'}\n\nLearner response:\n"""${text}"""`;
  const res = await chat({ system, messages: [{ role: 'user', content: user }], maxTokens: 400 });
  if (!res.ok) return { ok: false, scores: neutral, rationale: 'Judge unavailable. Neutral score applied.', flags: {}, fallback: true, reason: res.reason };
  try {
    const parsed = JSON.parse(stripFences(res.text));
    const scores = {};
    dimensions.forEach((d) => { const v = Number(parsed.scores?.[d.id]); scores[d.id] = Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 5; });
    return { ok: true, scores, rationale: String(parsed.rationale || ''), flags: parsed.flags || {}, fallback: false };
  } catch (e) {
    console.warn('Judge JSON parse failed', e, res.text);
    return { ok: false, scores: neutral, rationale: 'Judge returned unreadable output. Neutral score applied.', flags: {}, fallback: true, reason: 'parse' };
  }
}

export function judgeAverage(scores) {
  const vals = Object.values(scores);
  if (!vals.length) return 5;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
