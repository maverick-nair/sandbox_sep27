import React, { useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { loadSettings, saveSettings } from '../engine/state.js';
import { MODEL_OPTIONS, DEFAULT_MODEL } from '../engine/llm.js';
import { Panel, Button, Field, inputClass, StatRow, Tag } from '../components/ui.jsx';
import { judgeAverage } from '../engine/llm.js';

export default function Facilitator({ onClose }) {
  const { state, dispatch } = useGame();
  const [settings, setSettings] = useState(loadSettings());
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('log');

  const save = () => { saveSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const exportState = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `launch-window-${state.learner.name || 'learner'}.json`; a.click();
  };
  const importState = (file) => {
    const reader = new FileReader();
    reader.onload = () => { try { dispatch({ type: 'IMPORT_STATE', state: JSON.parse(reader.result) }); } catch { alert('Invalid save file'); } };
    reader.readAsText(file);
  };
  const exportCsv = () => {
    const rows = [['timestamp', 'level', 'type', 'summary', 'score', 'judge_scores', 'judge_rationale']];
    state.decisionLog.forEach((d) => rows.push([new Date(d.ts).toISOString(), d.level, d.type, d.summary, d.score ?? '', d.judge ? JSON.stringify(d.judge.scores) : '', d.judge?.rationale || '']));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'launch-window-decisions.csv'; a.click();
  };

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
        <p className="mt-1 text-xs text-zinc-500">{state.llm.errors} failed calls fell back to neutral scores. Cost uses list prices for the configured model.</p>
        <div className="mt-4 flex gap-2">
          {[['log', 'Decision log'], ['settings', 'Settings'], ['data', 'Data']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded border px-3 py-1 text-xs ${tab === k ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{l}</button>)}
        </div>
        {tab === 'log' && (
          <Panel title={`Decision log (${state.decisionLog.length})`} subtitle="Every decision with timestamp and judge scores, for cohort debriefs." className="mt-3" right={<Button size="sm" variant="secondary" onClick={exportCsv}>Export CSV</Button>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500"><tr><th className="py-1 pr-3">Time</th><th className="pr-3">Sprint</th><th className="pr-3">Type</th><th className="pr-3">Decision</th><th className="pr-3">Score</th><th>Judge</th></tr></thead>
                <tbody>
                  {state.decisionLog.map((d, i) => (
                    <tr key={i} className="border-t border-zinc-800 align-top text-zinc-300">
                      <td className="py-1.5 pr-3 font-mono text-zinc-500">{new Date(d.ts).toLocaleTimeString()}</td>
                      <td className="pr-3 font-mono">S{d.level}</td>
                      <td className="pr-3"><Tag>{d.type}</Tag></td>
                      <td className="pr-3">{d.summary}{d.cost && <span className="ml-1 text-zinc-500">({d.cost})</span>}</td>
                      <td className="pr-3 font-mono">{d.score ?? ''}</td>
                      <td>{d.judge ? <span title={d.judge.rationale}>{Object.entries(d.judge.scores).map(([k, v]) => `${k} ${v}`).join(', ')} (avg {judgeAverage(d.judge.scores).toFixed(1)}){d.judge.fallback ? ' fallback' : ''}</span> : ''}</td>
                    </tr>
                  ))}
                  {state.decisionLog.length === 0 && <tr><td colSpan={6} className="py-3 text-zinc-500">No decisions yet.</td></tr>}
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
            <div className="mt-3 flex items-center gap-3"><Button onClick={save}>Save settings</Button>{saved && <span className="text-xs text-amber-300">Saved.</span>}</div>
          </Panel>
        )}
        {tab === 'data' && (
          <Panel title="Save data" className="mt-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportState}>Export game state JSON</Button>
              <label className="inline-flex cursor-pointer items-center rounded border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-sm">Import state<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files[0] && importState(e.target.files[0])} /></label>
              <Button variant="danger" onClick={() => { if (confirm('Erase the saved game?')) dispatch({ type: 'RESET' }); }}>Reset game</Button>
            </div>
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Flags carried forward</div>
              <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400">{JSON.stringify(state.flags, null, 2)}</pre>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
