import React, { useState } from 'react';
import { Button, Panel, Field, Input, Select, Badge } from '../components/ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { loadSettings, saveSettings, MODEL_OPTIONS, DEFAULT_MODEL, testConnection, callLog, lastError, PROMPT_VERSION } from '../engine/llm.js';
import { exportWorkspace, importWorkspace, toCsv } from '../engine/store.js';
import { ONTOLOGY_VERSION } from '../content/ontology.js';
import { storageEstimate, approxBytes } from '../engine/storage.js';
import { generateScenario } from '../engine/generator.js';
import { makeRow } from '../engine/blueprint.js';

function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

export default function Settings() {
  const { ws, setWs, toast } = useWorkspace();
  const [s, setS] = useState(() => ({ model: DEFAULT_MODEL, ...loadSettings() }));
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(null);
  const [est, setEst] = useState(null);
  React.useEffect(() => { storageEstimate().then(setEst); }, [ws]);
  const selfTest = async () => {
    saveSettings(s); setGen({ busy: true });
    const row = makeRow('SK-COACH', 'Text', 'Medium', 'T2');
    const sc = await generateScenario(row, { intent: { audience: 'team leads', purpose: 'baseline', terminology: '', documents: [] }, skills: [{ id: 'SK-COACH' }], scenarios: [] }, 0, { onStatus: (st) => setGen({ busy: true, status: st }) });
    setGen({ busy: false, ok: sc.generatedBy === 'llm', by: sc.generatedBy, title: sc.title, sq: sc.scoringQuestions?.length, words: sc.situation.split(/\s+/).length, reason: sc.generatedBy === 'llm' ? '' : (lastError?.reason || 'The model call failed or returned an invalid shape, so the library fallback was used.') });
  };
  const save = () => { saveSettings(s); toast('Settings saved', 'ok'); };
  const run = async () => { saveSettings(s); setBusy(true); setTest(await testConnection()); setBusy(false); };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="AI generation" subtitle="Calls go from this browser to the Anthropic Messages API. Without a key the platform runs in scripted mode from its scenario library.">
        <div className="space-y-3">
          <Field label="API key"><Input type="password" value={s.apiKey || ''} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-ant-..." autoComplete="off" /></Field>
          <Field label="Model"><Select value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })}>{MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
          <Field label="Base URL" hint="optional; point at a server side proxy so keys never sit in the browser"><Input value={s.baseURL || ''} onChange={(e) => setS({ ...s, baseURL: e.target.value })} placeholder="https://proxy.example.com/anthropic" /></Field>
          <div className="flex flex-wrap gap-2"><Button onClick={save}>Save</Button><Button variant="secondary" onClick={run} busy={busy}>Test connection</Button><Button variant="secondary" onClick={selfTest} busy={gen?.busy} disabled={!s.apiKey}>Test generation</Button></div>
          {test && <p className={`text-sm ${test.ok ? 'text-[var(--ok)]' : 'text-[var(--block)]'}`}>{test.message}</p>}
          {gen && !gen.busy && <p className={`text-sm ${gen.ok ? 'text-[var(--ok)]' : 'text-[var(--block)]'}`}>{gen.ok ? `Generation works: "${gen.title}", ${gen.words} words, ${gen.sq} scoring questions, drafted by the model and validated.` : `Generation fell back to the library (${gen.by}). ${gen.reason}`}</p>}
          {gen?.busy && <p className="muted pulse text-sm">{gen.status || 'Generating one test scenario'}</p>}
          <p className="rounded-lg bg-[var(--warn-soft)]/60 p-2 text-xs"><strong>Security.</strong> A key entered here is stored in this browser only and calls go from the browser. For a shared or client facing deployment, set the base URL to a server side proxy that holds the key and applies workspace permissions, and leave the key field empty.</p>
          {lastError && <p className="faint text-xs">Last error: {lastError.reason}</p>}
          <p className="faint text-xs">Prompt version {PROMPT_VERSION}. Generation uses temperature 0 and pinned model versions per published assessment. Uploaded documents and author text are treated as data; instructions inside them are ignored.</p>
        </div>
      </Panel>
      <Panel title="Workspace" subtitle={`Ontology ${ONTOLOGY_VERSION}`}>
        <div className="space-y-3">
          <Field label="Workspace name"><Input value={ws.name} onChange={(e) => setWs({ ...ws, name: e.target.value })} /></Field>
          <Field label="Your name" hint="recorded as the actor in the audit log"><Input value={ws.author} onChange={(e) => setWs({ ...ws, author: e.target.value })} /></Field>
          <Field label="Your role" hint="controls what you can approve; a deployment with sign in assigns this centrally"><Select value={ws.role || 'author'} onChange={(e) => setWs({ ...ws, role: e.target.value })}><option value="author">Author: create, edit, preview, publish in this workspace</option><option value="reviewer">Reviewer: also complete KNOLSKAPE review of published versions</option><option value="calibrator">Calibrator: also enter calibration levels and activate AI scoring</option><option value="admin">Workspace admin: all of the above</option></Select></Field>
          <div className="card p-3 text-sm"><div className="faint text-[11px] uppercase">Storage</div><div>{(approxBytes(ws) / 1024).toFixed(0)} KB workspace in {'IndexedDB'}{est ? ` · ${(est.usage / 1048576).toFixed(1)} MB used of about ${(est.quota / 1073741824).toFixed(1)} GB available` : ''}</div><div className="faint text-xs">Undo history is capped at 25 steps per assessment and excludes document bodies. Export a copy before clearing browser data.</div></div>
          <div className="grid grid-cols-2 gap-2 text-sm"><div className="card p-3"><div className="faint text-[11px] uppercase">Tokens</div>{ws.usage.inputTokens.toLocaleString()} in / {ws.usage.outputTokens.toLocaleString()} out</div><div className="card p-3"><div className="faint text-[11px] uppercase">Estimated cost</div>${ws.usage.costUsd.toFixed(3)}</div></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => download(`nanoai-workspace-${new Date().toISOString().slice(0, 10)}.json`, exportWorkspace(ws))}>Export workspace</Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--line)] bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50">Import workspace<input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const w = importWorkspace(await f.text()); if (confirm('Replace the current workspace with the imported one?')) { setWs(w); toast('Workspace imported', 'ok'); } } catch (err) { toast(err.message, 'error'); } }} /></label>
            <Button variant="danger" onClick={() => { if (confirm('Reset the workspace? All drafts, published versions and the audit log in this browser are removed.')) { localStorage.removeItem('nanoai.authoring.workspace.v1'); window.location.reload(); } }}>Reset workspace</Button>
          </div>
        </div>
      </Panel>
      <Panel title="Audit log" subtitle="Every authoring, scoring question, key, cap, publish and configuration change with actor and before and after state." right={<Button size="sm" variant="secondary" onClick={() => download('nanoai-audit.csv', toCsv(ws.audit.map((e) => ({ at: new Date(e.at).toISOString(), actor: e.actor, assessment: e.assessmentId, action: e.action, before: typeof e.before === 'string' ? e.before : JSON.stringify(e.before ?? ''), after: typeof e.after === 'string' ? e.after : JSON.stringify(e.after ?? '') }))), 'text/csv')}>Export CSV</Button>} className="lg:col-span-2" padding="p-0">
        <div className="max-h-80 overflow-auto" tabIndex={0} aria-label="Audit log, scrollable">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white"><tr className="text-left"><th className="px-4 py-2">When</th><th className="px-2 py-2">Actor</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Before</th><th className="px-2 py-2">After</th></tr></thead>
            <tbody>{ws.audit.slice(0, 300).map((e) => <tr key={e.id} className="border-t border-[var(--line)] align-top"><td className="whitespace-nowrap px-4 py-1.5">{new Date(e.at).toLocaleString()}</td><td className="px-2 py-1.5">{e.actor}</td><td className="px-2 py-1.5"><Badge>{e.action}</Badge></td><td className="max-w-xs truncate px-2 py-1.5 font-mono">{typeof e.before === 'string' ? e.before : JSON.stringify(e.before ?? '')}</td><td className="max-w-xs truncate px-2 py-1.5 font-mono">{typeof e.after === 'string' ? e.after : JSON.stringify(e.after ?? '')}</td></tr>)}</tbody>
          </table>
          {ws.audit.length === 0 && <p className="muted p-4 text-sm">No events yet.</p>}
        </div>
      </Panel>
      <Panel title="AI call log" subtitle="Prompt version, model, input hash, schema validity, latency. No content is logged." className="lg:col-span-2" padding="p-0">
        <div className="max-h-64 overflow-auto" tabIndex={0} aria-label="AI call log, scrollable">
          <table className="w-full text-xs"><thead className="sticky top-0 bg-white"><tr className="text-left"><th className="px-4 py-2">When</th><th className="px-2 py-2">Purpose</th><th className="px-2 py-2">Model</th><th className="px-2 py-2">Hash</th><th className="px-2 py-2">Schema valid</th><th className="px-2 py-2">Latency</th><th className="px-2 py-2">Tokens</th></tr></thead>
            <tbody>{[...callLog].reverse().slice(0, 200).map((c, i) => <tr key={i} className="border-t border-[var(--line)]"><td className="whitespace-nowrap px-4 py-1.5">{new Date(c.at).toLocaleTimeString()}</td><td className="px-2 py-1.5">{c.purpose}</td><td className="px-2 py-1.5">{c.model}</td><td className="px-2 py-1.5 font-mono">{c.inputHash}</td><td className="px-2 py-1.5">{c.ok ? <Badge tone="ok">yes</Badge> : <Badge tone="block">{c.reason}</Badge>}</td><td className="px-2 py-1.5">{c.latencyMs} ms</td><td className="px-2 py-1.5">{c.usage ? `${c.usage.input_tokens}/${c.usage.output_tokens}` : ''}</td></tr>)}</tbody></table>
          {callLog.length === 0 && <p className="muted p-4 text-sm">No AI calls this session.</p>}
        </div>
      </Panel>
    </div>
  );
}
