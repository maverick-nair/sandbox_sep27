// Workspace state: assessments, versions and the audit log. One serializable JSON object in localStorage.
import { uid } from './text.js';
import { RULES } from '../content/rules.js';
import { ONTOLOGY_VERSION } from '../content/ontology.js';

const KEY = 'nanoai.authoring.workspace.v1';
export const SCHEMA_VERSION = 3;

export function emptyWorkspace() {
  return { schemaVersion: SCHEMA_VERSION, id: uid('ws'), name: 'My workspace', author: 'You', role: 'author', publishedCount: 0, assessments: [], audit: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0, errors: 0 } };
}

export function loadWorkspaceFrom(ws) {
  if (!ws) return emptyWorkspace();
  return migrate(ws);
}
export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(KEY);
    return loadWorkspaceFrom(raw ? JSON.parse(raw) : null);
  } catch { return emptyWorkspace(); }
}
function migrate(ws) {
  const stageFor = (a) => a.stage || (a.step >= 7 ? 4 : a.step >= 5 ? 3 : a.step >= 3 && a.scenarios?.length ? 2 : 1);
  return { ...emptyWorkspace(), ...ws, schemaVersion: SCHEMA_VERSION, assessments: (ws.assessments || []).filter((a) => !isEmptyDraft(a)).map(({ history, future, ...a }) => ({ ...a, stage: stageFor(a), calibration: a.calibration || {}, config: { scenarioOrder: 'shuffled', ...a.config } })) };
}
export function saveWorkspace(ws) { try { localStorage.setItem(KEY, JSON.stringify(ws)); } catch (e) { console.warn('save failed', e); } }

export function newAssessment(partial = {}) {
  const now = Date.now();
  return {
    id: uid('asm'), createdAt: now, updatedAt: now, status: 'draft', stage: 1, currentVersion: 0,
    intent: { audience: '', situationsText: '', purpose: 'baseline', terminology: '', documents: [], extracted: null, language: 'en' },
    skills: [], skillsConfirmed: false,
    blueprint: null, scenarios: [], generation: null,
    config: { name: '', audienceVisibility: 'invited', languages: ['en'], participantLanguages: ['en'], windowStart: '', windowEnd: '', sittings: RULES.publish.defaultSittings, sittingWindowDays: RULES.publish.defaultSittingWindowDays, retakeDays: RULES.publish.defaultRetakeDays, parallelFormOnRetake: true, reportVisibility: { participant: true, manager: false, org: true }, exportCsv: true, exportPdf: true, expectedParticipants: 30, scenarioOrder: 'shuffled' },
    versions: [], sample: false, calibration: {},
    ...partial,
  };
}

// Audit entry: every authoring, scoring question, key, cap, publish and configuration change (FR-G1).
export function audit(ws, { assessmentId, action, before, after, actor }) {
  const entry = { id: uid('aud'), at: Date.now(), actor: actor || ws.author || 'author', assessmentId, action, before: before === undefined ? undefined : compact(before), after: after === undefined ? undefined : compact(after) };
  return { ...ws, audit: [entry, ...ws.audit].slice(0, 2000) };
}
function compact(v) { try { const s = JSON.stringify(v); return s.length > 600 ? `${s.slice(0, 600)}…` : JSON.parse(s); } catch { return String(v); } }

export function upsertAssessment(ws, asm) {
  const list = ws.assessments.some((a) => a.id === asm.id) ? ws.assessments.map((a) => (a.id === asm.id ? asm : a)) : [asm, ...ws.assessments];
  return { ...ws, assessments: list };
}

// The author's content (skills, blueprint, scenarios, config, brief). Document bodies are excluded: they are large
// and have their own add and remove actions. Used to refuse content changes to a published version.
export function snapshot(asm) { const { documents, ...intent } = asm.intent || {}; return JSON.stringify({ skills: asm.skills, blueprint: asm.blueprint, scenarios: asm.scenarios, config: asm.config, intent, calibration: asm.calibration }); }
export function contentKey(asm) { return snapshot(asm) + JSON.stringify((asm.intent?.documents || []).map((d) => d.id)); }
export function isEmptyDraft(a) { return a.status === 'draft' && !a.sample && !a.currentVersion && !a.intent?.audience?.trim() && !a.intent?.situationsText?.trim() && !(a.intent?.documents || []).length && !(a.skills || []).length; }

// Publish: immutable version snapshot with pinned ontology, model and prompt versions (FR-A10, FR-G2).
export function publish(asm, { modelVersion, promptVersion, reviewRequired }) {
  const version = (asm.currentVersion || 0) + 1;
  const snap = { version, publishedAt: Date.now(), ontologyVersion: ONTOLOGY_VERSION, modelVersion, promptVersion, reviewStatus: reviewRequired ? 'pending_knolskape_review' : 'published', config: JSON.parse(JSON.stringify(asm.config)), skills: JSON.parse(JSON.stringify(asm.skills)), scenarios: JSON.parse(JSON.stringify(asm.scenarios)), blueprint: JSON.parse(JSON.stringify(asm.blueprint)), inFlight: 0 };
  return { ...asm, status: 'published', currentVersion: version, versions: [...asm.versions, snap], publishedAt: snap.publishedAt, updatedAt: Date.now() };
}

export function exportWorkspace(ws) { return JSON.stringify(ws, null, 2); }
export function importWorkspace(text) { const ws = JSON.parse(text); if (!ws.assessments) throw new Error('Not a NanoAI workspace file'); return migrate(ws); }

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
