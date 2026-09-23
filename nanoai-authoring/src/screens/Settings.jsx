import React, { useState } from 'react';
import { Button, Panel, Field, Input, Select, Badge } from '../components/ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { callLog, lastError, PROMPT_VERSION } from '../engine/llm.js';
import { exportWorkspace, importWorkspace, toCsv } from '../engine/store.js';
import { ONTOLOGY_VERSION } from '../content/ontology.js';
import { storageEstimate, approxBytes } from '../engine/storage.js';

function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

export default function Settings() {
  const { ws, setWs, toast } = useWorkspace();
  const [est, setEst] = useState(null);
  React.useEffect(() => { storageEstimate().then(setEst); }, [ws]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="AI" subtitle="Provided by GenieKreator. There is nothing to connect, no keys and no model subscription.">
        <div className="space-y-2 text-sm">
          <p className="muted">NanoAI reads briefs, proposes Skills, drafts scenarios, writes scoring questions and MCQ keys, and scores previews with the AI that GenieKreator runs for your workspace.</p>
          <p className="muted">Uploaded documents and your text are treated as data; instructions inside them are ignored. Personal data is anonymized in your browser before anything is sent.</p>
          {lastError && <p className="faint text-xs">Last AI issue: {lastError.reason}</p>}
          <p className="faint text-xs">Prompt version {PROMPT_VERSION}. Each published version records the model and prompts it was built with.</p>
        </div>
      </Panel>
      <Panel title="Workspace" subtitle={`Ontology ${ONTOLOGY_VERSION}`}>
        <div className="space-y-3">
          <Field label="Workspace name"><Input value={ws.name} onChange={(e) => setWs({ ...ws, name: e.target.value })} /></Field>
          <Field label="Your name" hint="recorded as the actor in the audit log"><Input value={ws.author} onChange={(e) => setWs({ ...ws, author: e.target.value })} /></Field>
          <Field label="Your role" hint="controls what you can approve; a deployment with sign in assigns this centrally"><Select value={ws.role || 'author'} onChange={(e) => setWs({ ...ws, role: e.target.value })}><option value="author">Author: create, edit, preview, publish in this workspace</option><option value="calibrator">Calibrator: also enter calibration levels and activate AI scoring</option><option value="admin">Workspace admin: all of the above</option></Select></Field>
          <div className="card p-3 text-sm"><div className="faint text-[11px] uppercase">Storage</div><div>{(approxBytes(ws) / 1024).toFixed(0)} KB workspace in {'IndexedDB'}{est ? ` · ${(est.usage / 1048576).toFixed(1)} MB used of about ${(est.quota / 1073741824).toFixed(1)} GB available` : ''}</div><div className="faint text-xs">Export a copy before clearing browser data.</div></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => download(`nanoai-workspace-${new Date().toISOString().slice(0, 10)}.json`, exportWorkspace(ws))}>Export workspace</Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--line)] bg-[var(--card)] px-3.5 py-2 text-sm font-medium hover:bg-[var(--card-3)]">Import workspace<input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const w = importWorkspace(await f.text()); if (confirm('Replace the current workspace with the imported one?')) { setWs(w); toast('Workspace imported', 'ok'); } } catch (err) { toast(err.message, 'error'); } }} /></label>
            <Button variant="danger" onClick={() => { if (confirm('Reset the workspace? All drafts, published versions and the audit log in this browser are removed.')) { localStorage.removeItem('nanoai.authoring.workspace.v1'); window.location.reload(); } }}>Reset workspace</Button>
          </div>
        </div>
      </Panel>
      <Panel title="Audit log" subtitle="Every authoring, scoring question, key, cap, publish and configuration change with actor and before and after state." right={<Button size="sm" variant="secondary" onClick={() => download('nanoai-audit.csv', toCsv(ws.audit.map((e) => ({ at: new Date(e.at).toISOString(), actor: e.actor, assessment: e.assessmentId, action: e.action, before: typeof e.before === 'string' ? e.before : JSON.stringify(e.before ?? ''), after: typeof e.after === 'string' ? e.after : JSON.stringify(e.after ?? '') }))), 'text/csv')}>Export CSV</Button>} className="lg:col-span-2" padding="p-0">
        <div className="max-h-80 overflow-auto" tabIndex={0} aria-label="Audit log, scrollable">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--card)]"><tr className="text-left"><th className="px-4 py-2">When</th><th className="px-2 py-2">Actor</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Before</th><th className="px-2 py-2">After</th></tr></thead>
            <tbody>{ws.audit.slice(0, 300).map((e) => <tr key={e.id} className="border-t border-[var(--line)] align-top"><td className="whitespace-nowrap px-4 py-1.5">{new Date(e.at).toLocaleString()}</td><td className="px-2 py-1.5">{e.actor}</td><td className="px-2 py-1.5"><Badge>{e.action}</Badge></td><td className="max-w-xs truncate px-2 py-1.5 font-mono">{typeof e.before === 'string' ? e.before : JSON.stringify(e.before ?? '')}</td><td className="max-w-xs truncate px-2 py-1.5 font-mono">{typeof e.after === 'string' ? e.after : JSON.stringify(e.after ?? '')}</td></tr>)}</tbody>
          </table>
          {ws.audit.length === 0 && <p className="muted p-4 text-sm">No events yet.</p>}
        </div>
      </Panel>
      <Panel title="AI call log" subtitle="Prompt version, model, input hash, schema validity, latency. No content is logged." className="lg:col-span-2" padding="p-0">
        <div className="max-h-64 overflow-auto" tabIndex={0} aria-label="AI call log, scrollable">
          <table className="w-full text-xs"><thead className="sticky top-0 bg-[var(--card)]"><tr className="text-left"><th className="px-4 py-2">When</th><th className="px-2 py-2">Purpose</th><th className="px-2 py-2">Model</th><th className="px-2 py-2">Hash</th><th className="px-2 py-2">Schema valid</th><th className="px-2 py-2">Latency</th><th className="px-2 py-2">Tokens</th></tr></thead>
            <tbody>{[...callLog].reverse().slice(0, 200).map((c, i) => <tr key={i} className="border-t border-[var(--line)]"><td className="whitespace-nowrap px-4 py-1.5">{new Date(c.at).toLocaleTimeString()}</td><td className="px-2 py-1.5">{c.purpose}</td><td className="px-2 py-1.5">{c.model}</td><td className="px-2 py-1.5 font-mono">{c.inputHash}</td><td className="px-2 py-1.5">{c.ok ? <Badge tone="ok">yes</Badge> : <Badge tone="block">{c.reason}</Badge>}</td><td className="px-2 py-1.5">{c.latencyMs} ms</td><td className="px-2 py-1.5">{c.usage ? `${c.usage.input_tokens}/${c.usage.output_tokens}` : ''}</td></tr>)}</tbody></table>
          {callLog.length === 0 && <p className="muted p-4 text-sm">No AI calls this session.</p>}
        </div>
      </Panel>
    </div>
  );
}
