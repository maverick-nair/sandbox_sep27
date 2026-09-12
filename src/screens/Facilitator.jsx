import React, { useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { loadSettings, saveSettings } from '../engine/state.js';
import { MODEL_OPTIONS, DEFAULT_MODEL, testConnection, lastError } from '../engine/llm.js';
import { FEATURE_CARDS, BOARD_ZONES, TRACES, ERROR_BUCKETS, PERSONAS, PERSONA_ORDER, TARGET_ENVELOPE, PASS_CONDITION, REQUIRED, UX_TILES, FLOW_STEPS } from '../content/index.js';
import { Panel, Button, Field, inputClass, StatRow, Tag } from '../components/ui.jsx';
import { judgeAverage } from '../engine/llm.js';

export default function Facilitator({ onClose }) {
  const { state, dispatch } = useGame();
  const [settings, setSettings] = useState(loadSettings());
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('log');
  const [confirmReset, setConfirmReset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copyText, setCopyText] = useState(null);
  const [importError, setImportError] = useState('');

  const save = () => { const ok = saveSettings(settings); setSaved(ok ? 'Saved.' : 'Could not save: this browser blocks local storage.'); setTimeout(() => setSaved(false), 2500); };
  // Downloads are blocked inside some embeds (LMS iframes, the artifact viewer). Always offer a copyable fallback.
  const download = (name, text, type) => {
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); } catch (e) { console.warn('download blocked', e); }
    setCopyText({ name, text });
  };
  const exportState = () => download(`launch-window-${state.learner.name || 'learner'}.json`, JSON.stringify(state, null, 2), 'application/json');
  const importState = (file) => {
    const reader = new FileReader();
    reader.onload = () => { try { dispatch({ type: 'IMPORT_STATE', state: JSON.parse(reader.result) }); setImportError(''); } catch { setImportError('That file is not a valid Launch Window save.'); } };
    reader.readAsText(file);
  };
  const exportCsv = () => {
    const rows = [['timestamp', 'level', 'type', 'summary', 'score', 'judge_scores', 'judge_rationale']];
    state.decisionLog.forEach((d) => rows.push([new Date(d.ts).toISOString(), d.level, d.type, d.summary, d.score ?? '', d.judge ? JSON.stringify(d.judge.scores) : '', d.judge?.rationale || '']));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    download('launch-window-decisions.csv', csv, 'text/csv');
  };
  const runTest = async () => { setTesting(true); saveSettings(settings); setTestResult(await testConnection()); setTesting(false); };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/95 p-4 sm:p-8" role="dialog" aria-label="Facilitator view">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm tracking-widest text-amber-300">FACILITATOR VIEW</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <StatRow items={[
          { label: 'LLM calls', value: state.llm.calls },
          { label: 'Input tokens', value: state.llm.inputTokens.toLocaleString() },
          { label: 'Output tokens', value: state.llm.outputTokens.toLocaleString() },
          { label: 'Estimated cost (USD)', value: state.llm.costUsd.toFixed(4) },
        ]} />
        <p className="mt-1 text-xs text-zinc-400">{state.llm.errors} failed calls fell back to neutral scores. Cost is an estimate at list prices for the configured model.{lastError && <span className="text-sky-300"> Last error: {lastError.reason}</span>}</p>
        <div className="mt-4 flex gap-2">
          {[['log', 'Decision log'], ['settings', 'Settings'], ['data', 'Data'], ['guide', 'Facilitator guide']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded border px-3 py-1 text-xs ${tab === k ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{l}</button>)}
        </div>
        {tab === 'log' && (
          <Panel title={`Decision log (${state.decisionLog.length})`} subtitle="Every decision with timestamp and judge scores, for cohort debriefs." className="mt-3" right={<Button size="sm" variant="secondary" onClick={exportCsv}>Export CSV</Button>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-400"><tr><th className="py-1 pr-3">Time</th><th className="pr-3">Sprint</th><th className="pr-3">Type</th><th className="pr-3">Decision</th><th className="pr-3">Score</th><th>Judge</th></tr></thead>
                <tbody>
                  {state.decisionLog.map((d, i) => (
                    <tr key={i} className="border-t border-zinc-800 align-top text-zinc-300">
                      <td className="py-1.5 pr-3 font-mono text-zinc-400">{new Date(d.ts).toLocaleTimeString()}</td>
                      <td className="pr-3 font-mono">S{d.level}</td>
                      <td className="pr-3"><Tag>{d.type}</Tag></td>
                      <td className="pr-3">{d.summary}{d.cost && <span className="ml-1 text-zinc-400">({d.cost})</span>}</td>
                      <td className="pr-3 font-mono">{d.score ?? ''}</td>
                      <td>{d.judge ? <span title={d.judge.rationale}>{Object.entries(d.judge.scores).map(([k, v]) => `${k} ${v}`).join(', ')} (avg {judgeAverage(d.judge.scores).toFixed(1)}){d.judge.fallback ? ' fallback' : ''}</span> : ''}</td>
                    </tr>
                  ))}
                  {state.decisionLog.length === 0 && <tr><td colSpan={6} className="py-3 text-zinc-400">No decisions yet.</td></tr>}
                </tbody>
              </table>
            </div>
            {state.teamLog.length > 0 && <div className="mt-3 text-xs text-zinc-400">Team inputs logged: {state.teamLog.length}. Ignored without reason: {state.teamLog.filter((t) => !t.considered && !t.reason).length}.</div>}
          </Panel>
        )}
        {tab === 'settings' && (
          <Panel title="LLM settings" subtitle="Stored in this browser only. Calls go directly from the browser to the Anthropic Messages API." className="mt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Anthropic API key" hint="Required for live personas, synthetic users and judges. Without it the sandbox runs in scripted mode with neutral judge scores."><input type="password" className={inputClass} value={settings.apiKey || ''} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} /></Field>
              <Field label="Model"><select className={inputClass} value={settings.model || DEFAULT_MODEL} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>{MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label="Base URL (optional proxy)" hint="Point at a server-side proxy if you do not want keys in the browser."><input className={inputClass} value={settings.baseURL || ''} onChange={(e) => setSettings({ ...settings, baseURL: e.target.value })} placeholder="https://api.anthropic.com" /></Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><Button onClick={save}>Save settings</Button><Button variant="secondary" disabled={testing || !settings.apiKey} onClick={runTest}>{testing ? 'Testing...' : 'Test connection'}</Button>{saved && <span className="text-xs text-amber-300">{saved}</span>}{testResult && <span className={`text-xs ${testResult.ok ? 'text-amber-300' : 'text-sky-300'}`}>{testResult.message}</span>}</div>
            <p className="mt-2 text-xs text-zinc-400">Security note: a key entered here is stored in this browser and sent directly to the provider. For cohorts, deploy behind a server-side proxy and leave the key empty here.</p>
          </Panel>
        )}
        {tab === 'data' && (
          <Panel title="Save data" className="mt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportState}>Export game state JSON</Button>
              <label className="inline-flex cursor-pointer items-center rounded border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm">Import state<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && importState(e.target.files[0])} /></label>
              {!confirmReset && <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset game</Button>}
              {confirmReset && <><span className="self-center text-sm text-zinc-300">Erase the saved game?</span><Button variant="danger" onClick={() => { dispatch({ type: 'RESET' }); setConfirmReset(false); onClose(); }}>Yes, erase</Button><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></>}
              <Button variant="ghost" onClick={() => { dispatch({ type: 'BACK_TO_INTRO' }); onClose(); }}>Back to intro (keeps save)</Button>
            </div>
            {importError && <p className="mt-2 text-xs text-sky-300">{importError}</p>}
            {copyText && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-zinc-400"><span>{copyText.name}. If the download did not start (some embeds block downloads), copy from here.</span><button className="text-amber-300 hover:underline" onClick={() => navigator.clipboard?.writeText(copyText.text)}>Copy to clipboard</button></div>
                <textarea readOnly className="mt-1 h-32 w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-[10px] text-zinc-300" value={copyText.text} onFocus={(e) => e.target.select()} aria-label={copyText.name} />
              </div>
            )}
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Flags carried forward</div>
              <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400">{JSON.stringify(state.flags, null, 2)}</pre>
            </div>
          </Panel>
        )}
        {tab === 'guide' && <FacilitatorGuide />}
      </div>
    </div>
  );
}

// Expert keys, rubrics and the consequence map, for cohort debriefs. Rendered from the content module.
function FacilitatorGuide() {
  return (
    <div className="mt-3 space-y-4">
      <Panel title="Sprint 1 expert key" subtitle="Placement accuracy is scored against this key. Half credit for one correct axis.">
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-400"><tr><th className="py-1 pr-3">Request</th><th className="pr-3">Key</th><th>Why</th></tr></thead><tbody>
          {FEATURE_CARDS.map((c) => <tr key={c.id} className="border-t border-zinc-800 align-top text-zinc-300"><td className="py-1.5 pr-3 text-zinc-100">{c.title}</td><td className="pr-3 whitespace-nowrap">{BOARD_ZONES.find((z) => z.suitability === c.key.suitability && (z.value === null || z.value === c.key.value))?.label}</td><td>{c.whyKey}</td></tr>)}
        </tbody></table></div>
      </Panel>
      <Panel title="Sprint 2 envelope" subtitle={`Under ${TARGET_ENVELOPE.costPer1k} USD per 1k, under ${TARGET_ENVELOPE.p95Seconds} s p95, quality above ${TARGET_ENVELOPE.quality}. Reference solution: system prompt, embedding model, retrieval index, reranker, mid-tier model, guardrail filter, citation layer.`}>
        <p className="text-xs text-zinc-300">Trap: the fine-tuned adapter. It maximizes quality, adds 250,000 fixed cost and a six week delay, and resurfaces as an 18,000 monthly cost line in Sprint 4.</p>
      </Panel>
      <Panel title="Sprint 3 trace truth" subtitle="Each trace's expert label. A strong golden set covers every failure type plus one to three correct anchors.">
        <div className="grid gap-1 text-xs sm:grid-cols-2">{TRACES.map((t) => <div key={t.id} className="flex gap-2 text-zinc-300"><span className="font-mono text-zinc-400">{t.id}</span><span className="text-amber-200">{ERROR_BUCKETS.find((b) => b.id === t.truth).label}</span><span className="truncate text-zinc-400">{t.question}</span></div>)}</div>
        <p className="mt-2 text-xs text-zinc-300">Threshold scoring: 85 to 93 full marks, 80 to 84 strong, above 93 over-investment, below 80 sets the low threshold flag that raises Sprint 7 severity.</p>
      </Panel>
      <Panel title="Sprint 4 pass condition" subtitle={`Gross margin above ${PASS_CONDITION.grossMargin}% with adoption above ${PASS_CONDITION.adoption}%.`}>
        <p className="text-xs text-zinc-300">Reference: FAQ to cached, lookup to mid-tier, reasoning to frontier, code to mid-tier, summarization to small, HR to frontier or the human desk, per seat at 15 to 20 USD. All-frontier fails margin; all-small fails adoption because query types fall under their quality need.</p>
      </Panel>
      <Panel title="Sprint 5 hidden yes-conditions">
        {PERSONA_ORDER.map((p) => <div key={p} className="mb-2 text-xs"><span className="text-zinc-100">{PERSONAS[p].name}, {PERSONAS[p].role}:</span> <span className="text-zinc-300">{PERSONAS[p].concerns.map((c) => c.label).join('; ')}.</span></div>)}
        <p className="text-xs text-zinc-300">Over-promising language (zero risk, guarantee, cannot hallucinate) creates a liability card for Sprint 7.</p>
      </Panel>
      <Panel title="Sprint 6 required placements">
        <ul className="text-xs text-zinc-300">{REQUIRED.map((r) => <li key={r.tile}>{UX_TILES.find((t) => t.id === r.tile).label} on {FLOW_STEPS.find((s) => s.id === r.step).label}: {r.reason}</li>)}</ul>
        <p className="mt-1 text-xs text-zinc-300">Human approval on query or retrieval is scored as over-engineering.</p>
      </Panel>
      <Panel title="Consequence map" subtitle="Early decisions that resurface later.">
        <ul className="space-y-1 text-xs text-zinc-300">
          <li>Sprint 2 no citation layer: +1 incident severity in Sprint 7.</li>
          <li>Sprint 2 fine-tuned adapter: 18,000 monthly cost line in Sprint 4.</li>
          <li>Sprint 3 threshold below 80: +1 severity. Shipping below 75: +1 severity.</li>
          <li>Sprint 4 adoption figure: starting adoption for the Sprint 6 friction gauge.</li>
          <li>Sprint 5 over-promise to the CFO: liability card, +1 severity, and a CFO pre-read in Sprint 8.</li>
          <li>Sprint 6 no approval on the action step: +1 severity.</li>
          <li>Any liability card: +1 severity and a Stakeholder penalty in Sprint 7.</li>
          <li>Weakest meter after Sprint 7 decides the three board questions in Sprint 8.</li>
        </ul>
      </Panel>
      <Panel title="Judge rubrics" subtitle="Free text is scored 0 to 10 per dimension by the model judge, with a neutral 5 applied when unavailable.">
        <ul className="space-y-1 text-xs text-zinc-300">
          <li>Sprint 3 justification: evidence, trade-off, coherence.</li>
          <li>Sprint 4 vendor reasoning: evidence, risk, reversibility.</li>
          <li>Sprint 5 each persona: evidence, specificity, pushback, realism.</li>
          <li>Sprint 7 customer communication: honesty, specificity, no blame, remediation.</li>
          <li>Sprint 8 board pitch: structure, evidence, candour, clarity.</li>
        </ul>
      </Panel>
    </div>
  );
}
