import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Badge, Panel, Progress } from '../components/ui.jsx';
import { MediaView } from '../components/Media.jsx';
import { RULES, bandFor, LEVEL_LABELS } from '../content/rules.js';
import { getSkill } from '../content/ontology.js';
import { scorePreviewResponse } from '../engine/generator.js';
import { aggregate, scoreMcq } from '../engine/scoring.js';
import { detectPII, anonymize } from '../engine/pii.js';
import { formatSeconds } from '../engine/duration.js';
import { editDistance as dist } from '../engine/text.js';

import { orderForm } from '../engine/form.js';

export default function Step5Preview({ asm, update, go, readOnly, toast }) {
  const [device, setDevice] = useState('desktop');
  const [stage, setStage] = useState('welcome'); // welcome | practice | scenario | done | report
  const [i, setI] = useState(0);
  const [responses, setResponses] = useState({});
  const [scoring, setScoring] = useState(false);
  const [report, setReport] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const mode = asm.config.scenarioOrder || 'shuffled';
  const form = useMemo(() => orderForm(asm.scenarios || [], { mode, seed }), [asm.scenarios, mode, seed]);
  const total = form.reduce((a, s) => a + (s.recommendedMinutes || 0), 0);
  const sc = form[i];

  const submit = (resp) => { setResponses((r) => ({ ...r, [sc.id]: resp })); if (i < form.length - 1) setI(i + 1); else setStage('done'); };

  const buildReport = async () => {
    setScoring(true);
    const obsBySkill = {};
    const evidence = [];
    for (const s of form) {
      const r = responses[s.id];
      const list = (obsBySkill[s.skillId] ||= []);
      if (!r) { list.push({ score: 0, unscored: true }); continue; }
      if (s.responseType === 'MCQ') { const res = scoreMcq(s, r.selections); res.forEach((o) => list.push({ score: o.score, unscored: o.unscored })); evidence.push({ scenario: s, type: 'MCQ', items: res.map((o) => { const q = s.mcq.find((x) => x.id === o.questionId); const opt = q.options.find((x) => x.id === o.optionId); return { question: q.text, chosen: opt?.text || 'No option chosen', key: o.key, rationale: o.rationale, indicator: opt?.indicatorId }; }) }); }
      else {
        const anon = anonymize(r.text, detectPII(r.text, { allowNames: s.allowedTerms || [] }));
        const { ok, results, mode, injectionFlag, note } = await scorePreviewResponse(s, anon.text);
        if (!ok) { s.scoringQuestions.forEach(() => list.push({ score: 0, unscored: true })); evidence.push({ scenario: s, type: s.responseType, mode: 'none', note, items: [] }); continue; }
        results.forEach((q) => list.push({ score: q.score, thirdPass: q.thirdPass, integrityFlag: injectionFlag || r.pasted }));
        evidence.push({ scenario: s, type: s.responseType, mode, injectionFlag, pasted: r.pasted, redactions: anon.redactions.length, items: results.map((q) => { const sq = s.scoringQuestions.find((x) => x.id === q.questionId); return { question: sq?.text, level: q.level, quote: q.quote, anchor: sq?.anchors?.[`L${q.level}`], indicator: sq?.indicatorId, passes: q.passes }; }) });
      }
    }
    const agg = aggregate(obsBySkill);
    setReport({ agg, evidence });
    setScoring(false); setStage('report');
    update((a) => ({ ...a, previewed: true }), { action: 'preview.completed', after: { overall: agg.overall }, allowPublished: true });
  };

  const restart = () => { setStage('welcome'); setI(0); setResponses({}); setReport(null); setSeed(Math.floor(Math.random() * 1e9)); };
  const Frame = device === 'mobile' ? 'div' : 'div';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs"><Badge tone="brand">{mode === 'shuffled' ? 'Order shuffled for this participant' : 'Fixed order'}</Badge><span className="muted">Skills interleaved, no more than two audio in a row.</span>{mode === 'shuffled' && <button className="text-[var(--brand)]" onClick={restart}>Try another participant's order</button>}</div>
        <div className="flex items-center gap-2"><div className="flex rounded-lg border border-[var(--line)] bg-[var(--card)] p-0.5">{['desktop', 'mobile'].map((d) => <button key={d} onClick={() => setDevice(d)} aria-pressed={device === d} className={`rounded-md px-3 py-1 text-xs font-medium ${device === d ? 'bg-[var(--brand)] text-[var(--on-brand)]' : 'hover:bg-[var(--card-3)]'}`}>{d === 'desktop' ? 'Desktop' : 'Mobile 390'}</button>)}</div><Button variant="secondary" size="sm" onClick={restart}>Restart</Button><Button variant="secondary" size="sm" onClick={() => go(2)}>Back to scenarios</Button><Button size="sm" onClick={() => go(4)}>Continue to publish</Button></div>
      </div>
      <div className="flex justify-center">
        <Frame className={device === 'mobile' ? 'phone-frame' : 'desktop-frame'}>
          <div className="participant flex h-full flex-col overflow-auto bg-[var(--card)]" style={{ maxHeight: device === 'mobile' ? 760 : undefined }}>
            {stage === 'welcome' && <Welcome form={form} total={total} asm={asm} onStart={() => setStage('practice')} />}
            {stage === 'practice' && <Practice onDone={() => setStage('scenario')} />}
            {stage === 'scenario' && sc && <ScenarioScreen key={sc.id} sc={sc} index={i} count={form.length} remaining={form.slice(i).reduce((a, s) => a + s.recommendedMinutes, 0)} onSubmit={submit} onPause={() => toast('Progress saves on every submitted scenario. A participant can resume within 7 days across 2 sittings.')} />}
            {stage === 'done' && <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><h2 className="text-lg font-semibold">Thank you. That is every scenario.</h2><p className="muted text-sm">Your report is being prepared. It usually takes under 5 minutes. Responses are anonymized before analysis; audio is deleted after transcription.</p><Button onClick={buildReport} busy={scoring}>{scoring ? 'Scoring your responses' : 'Show my report (sample)'}</Button><p className="faint text-xs">Then an optional two question feedback on realism and clarity.</p></div>}
            {stage === 'report' && report && <SampleReport asm={asm} report={report} />}
          </div>
        </Frame>
      </div>
      <p className="faint text-center text-xs">This preview scores with the AI two pass scorer. In delivery, AI scoring activates only after calibration against two human scorers. Skill names and scoring questions are never shown during the assessment.</p>
    </div>
  );
}

function Welcome({ form, total, asm, onStart }) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div><Badge tone="brand">NanoAI</Badge><h2 className="mt-2 text-xl font-semibold">{asm.config.name || 'Skills assessment'}</h2></div>
      <ul className="space-y-2 text-sm">
        <li><strong>What this is.</strong> {form.length} short workplace situations. You respond in your own words by voice or text, or choose from a few options.</li>
        <li><strong>How long.</strong> About {total} minutes in total. Each situation shows a recommended time as guidance; there is no cutoff.</li>
        <li><strong>How it is used.</strong> For your development and readiness, not for hiring decisions.</li>
        <li><strong>Who sees results.</strong> You{asm.config.reportVisibility.manager ? ', your manager' : ''}{asm.config.reportVisibility.org ? ' and your organization at cohort level' : ''}.</li>
        <li><strong>How your answers are protected.</strong> Personal details in your answers are anonymized before analysis. Audio is deleted after transcription.</li>
        <li><strong>One thing to know.</strong> Once you submit a situation you cannot go back to it. You can pause between situations and return within 7 days.</li>
      </ul>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" defaultChecked className="mt-1" />I consent to audio processing and anonymization as described.</label>
      <Button size="lg" onClick={onStart}>Start with a short practice</Button>
    </div>
  );
}

function Practice({ onDone }) {
  const [mcq, setMcq] = useState(null);
  const [recorded, setRecorded] = useState(false);
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">Practice</h2>
      <p className="text-sm">Two quick controls so the first situation is not the first time you use them.</p>
      <div className="card p-4"><div className="mb-2 text-sm font-medium">1. Record a 30 second practice answer: what did you do this morning?</div><Recorder capSeconds={30} onSubmit={() => setRecorded(true)} practice />{recorded && <Badge tone="ok" className="mt-2">Recording works</Badge>}</div>
      <div className="card p-4"><div className="mb-2 text-sm font-medium">2. Choose one option</div>{['Tap an option like this one', 'Or this one; there is no wrong answer here'].map((t, i) => <button key={i} role="radio" aria-checked={mcq === i} onClick={() => setMcq(i)} className="option mb-2">{t}</button>)}</div>
      <Button size="lg" onClick={onDone} disabled={mcq === null}>Begin the first situation</Button>
    </div>
  );
}

function ScenarioScreen({ sc, index, count, remaining, onSubmit, onPause }) {
  const [elapsed, setElapsed] = useState(0);
  const [prompted, setPrompted] = useState(false);
  const [text, setText] = useState('');
  const [pasted, setPasted] = useState(false);
  const [selections, setSelections] = useState({});
  const [mode, setMode] = useState(sc.responseType);
  const [shortWarn, setShortWarn] = useState(false);
  useEffect(() => { const t = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(t); }, []);
  const recSecs = sc.recommendedMinutes * 60;
  useEffect(() => { if (elapsed >= recSecs && !prompted) setPrompted(true); }, [elapsed, recSecs, prompted]);
  const cap = sc.cap?.textChars || RULES.caps.textMinChars;
  const left = recSecs - elapsed;
  const submitText = () => { if (text.trim().length < 150 && !shortWarn) { setShortWarn(true); return; } onSubmit({ text, pasted }); };
  const allChosen = sc.mcq.every((q) => selections[q.id]);
  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--card)]/95 px-5 py-2 text-xs backdrop-blur"><div className="flex items-center justify-between"><span className="font-medium">Scenario {index + 1} of {count}</span><span className="muted">About {remaining} min remaining</span></div><div className="mt-1 flex items-center gap-2"><Progress value={index} max={count} /><span className={`whitespace-nowrap font-mono ${left < 0 ? 'text-[var(--warn)]' : 'muted'}`} aria-live="polite">{left >= 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} suggested` : 'Over the suggested time'}</span></div></div>
      <div className="flex-1 space-y-4 p-5">
        <div className="rounded-lg bg-[var(--card-2)] p-3 text-sm"><span className="faint mr-1 text-[11px] uppercase tracking-wider">Your situation</span>{sc.contextHeader}</div>
        <p className="whitespace-pre-wrap">{sc.situation}</p>
        {sc.media && <MediaView media={sc.media} compact />}
        <p className="font-semibold">{sc.prompt}</p>
        {prompted && <div role="status" className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-2 text-sm">You have passed the suggested time for this situation. Submit when you are ready; there is no cutoff.</div>}
        {mode === 'Audio' && <div><Recorder capSeconds={sc.cap?.audioSeconds || RULES.caps.audioMaxSeconds} onSubmit={(t) => onSubmit({ text: t, audio: true })} /><button className="mt-2 text-xs text-[var(--brand)]" onClick={() => setMode('Text')}>I cannot record: switch to text for this situation</button></div>}
        {mode === 'Text' && (
          <div>
            <textarea value={text} onChange={(e) => { if (e.target.value.length <= cap) setText(e.target.value); }} onPaste={() => setPasted(true)} rows={8} maxLength={cap} className="w-full rounded-lg border border-[var(--line)] p-3 text-base focus:border-[var(--brand)] focus:outline-none" placeholder="Type your answer" aria-label="Your answer" />
            <div className="mt-1 flex items-center justify-between text-xs"><span className={text.length >= cap ? 'font-medium text-[var(--block)]' : text.length >= cap * 0.9 ? 'text-[var(--warn)]' : 'muted'}>{text.length >= cap ? 'You have reached the limit for this answer. What you have written will be assessed.' : `${(cap - text.length).toLocaleString()} characters remaining`}</span>{sc.responseType === 'Audio' && <span className="faint">Switched from audio</span>}</div>
            {shortWarn && <p className="mt-1 text-xs text-[var(--warn)]">Your answer is quite short. Add a little more if you can, or submit as it is.</p>}
            <Button size="lg" className="mt-3 w-full" onClick={submitText} disabled={!text.trim()}>Submit answer</Button>
          </div>
        )}
        {mode === 'MCQ' && (
          <div className="space-y-4">
            {sc.mcq.map((q, qi) => <div key={q.id} role="radiogroup" aria-label={q.text}><div className="mb-2 text-sm font-medium">{sc.mcq.length > 1 && <span className="faint mr-1">{qi + 1}.</span>}{q.text}</div>{q.options.map((o) => <button key={o.id} role="radio" aria-checked={selections[q.id] === o.id} onClick={() => setSelections({ ...selections, [q.id]: o.id })} className="option mb-2">{o.text}</button>)}</div>)}
            <Button size="lg" className="w-full" disabled={!allChosen} onClick={() => onSubmit({ selections })}>Submit</Button>
          </div>
        )}
        <div className="flex justify-between text-xs"><button className="muted" onClick={onPause}>Pause after this scenario</button><button className="muted">Report a problem with this scenario</button></div>
      </div>
    </div>
  );
}

function Recorder({ capSeconds, onSubmit, practice }) {
  const [state, setState] = useState('idle'); // idle | recording | review
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [original, setOriginal] = useState('');
  const [rerecorded, setRerecorded] = useState(false);
  const [err, setErr] = useState('');
  const mediaRef = useRef(null); const analyserRef = useRef(null); const rafRef = useRef(null); const recRef = useRef(null); const timerRef = useRef(null); const streamRef = useRef(null);
  const stop = () => { clearInterval(timerRef.current); cancelAnimationFrame(rafRef.current); try { mediaRef.current?.state !== 'inactive' && mediaRef.current?.stop(); } catch {} try { recRef.current?.stop(); } catch {} streamRef.current?.getTracks().forEach((t) => t.stop()); setState('review'); setOriginal((t) => t || transcript); };
  useEffect(() => () => { clearInterval(timerRef.current); cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  const start = async () => {
    setErr(''); setSecs(0); setTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an); analyserRef.current = an;
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteTimeDomainData(data); let sum = 0; for (const v of data) { const d = (v - 128) / 128; sum += d * d; } setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4)); rafRef.current = requestAnimationFrame(tick); }; tick();
      const mr = new MediaRecorder(stream); mediaRef.current = mr; mr.start();
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) { const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US'; r.onresult = (e) => { let t = ''; for (const res of e.results) t += res[0].transcript + ' '; setTranscript(t.trim()); }; r.onerror = () => {}; try { r.start(); recRef.current = r; } catch {} }
      setState('recording');
      timerRef.current = setInterval(() => setSecs((s) => { if (s + 1 >= capSeconds) { setTimeout(stop, 0); return capSeconds; } return s + 1; }), 1000);
    } catch (e) { setErr('Microphone unavailable or denied. Switch to text for this situation; it is scored identically.'); }
  };
  const remaining = capSeconds - secs;
  const tooFar = original && dist(original, transcript) > Math.max(40, original.length * 0.25);
  return (
    <div className="card p-4">
      {state === 'idle' && <div className="flex flex-col items-center gap-2"><button onClick={start} className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--block)] text-[var(--on-brand)] shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--block)]/30" aria-label="Start recording"><span className="h-6 w-6 rounded-full bg-[var(--card)]" /></button><span className="text-sm">Tap to record. Up to {formatSeconds(capSeconds)}. Recording never starts without a tap.</span>{err && <p className="text-xs text-[var(--block)]">{err}</p>}</div>}
      {state === 'recording' && <div className="flex flex-col items-center gap-2"><button onClick={stop} className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--card-3)] text-[var(--ink)] border border-[var(--line-2)]" aria-label="Stop recording"><span className="h-5 w-5 rounded-sm bg-[var(--card)]" /></button><div className="h-2 w-40 rounded bg-[var(--card-3)]"><div className="h-2 rounded bg-[var(--ok)] transition-all" style={{ width: `${Math.round(level * 100)}%` }} /></div><span className={`font-mono text-sm ${remaining <= 15 ? 'text-[var(--warn)]' : ''}`} aria-live="polite">{formatSeconds(remaining)} left{remaining <= 15 ? '. Recording will stop at the limit.' : ''}</span>{transcript && <p className="muted text-xs italic">{transcript}</p>}</div>}
      {state === 'review' && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{secs >= capSeconds ? 'Recording stopped at the limit. What you said will be assessed.' : `Recorded ${formatSeconds(secs)}.`}</div>
          {practice ? <Button onClick={() => onSubmit('')}>Done</Button> : (
            <>
              <label className="block text-xs">Check the transcript. Fix recognition errors only; large rewrites are not accepted.<textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-[var(--line)] p-2 text-sm" placeholder={window.SpeechRecognition || window.webkitSpeechRecognition ? 'Transcript' : 'Live transcription is not available in this browser. Type what you said so the preview can score it.'} /></label>
              {tooFar && <p className="text-xs text-[var(--block)]">That is more than a correction. Please re-record instead of rewriting.</p>}
              {secs < 20 && <p className="text-xs text-[var(--warn)]">Your answer is under 20 seconds. Add more if you can by re-recording, or submit as it is.</p>}
              <div className="flex gap-2"><Button onClick={() => onSubmit(transcript)} disabled={tooFar || !transcript.trim()}>Submit answer</Button>{!rerecorded && <Button variant="secondary" onClick={() => { setRerecorded(true); setState('idle'); setOriginal(''); }}>Re-record once</Button>}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SampleReport({ asm, report }) {
  const { agg, evidence } = report;
  const band = agg.overall != null ? bandFor(agg.overall) : null;
  const color = (name) => ({ Novice: 'var(--band-novice)', Emerging: 'var(--band-emerging)', Competent: 'var(--band-competent)', Proficient: 'var(--band-proficient)', 'Role Model': 'var(--band-rolemodel)' }[name]);
  return (
    <div className="space-y-5 p-6 text-sm">
      <div><Badge tone="brand">Sample report</Badge><h2 className="mt-1 text-lg font-semibold">Your NanoAI result</h2><p className="muted text-xs">Answers three questions in order: what did I score, why, and what do I do next.</p></div>
      <section className="card p-4"><div className="faint text-[11px] uppercase tracking-wider">1. Overall result</div><div className="mt-1 flex items-baseline gap-3"><span className="text-4xl font-semibold" style={{ color: band ? color(band.name) : undefined }}>{agg.overall ?? '–'}</span><span className="text-base font-medium">{agg.overallBand || 'Not scorable'}</span></div>{band && <p className="muted mt-1 text-xs">{band.meaning}.</p>}</section>
      <section><div className="faint mb-2 text-[11px] uppercase tracking-wider">2. Skill scores</div><ul className="space-y-2">{agg.skills.map((s) => { const sk = getSkill(s.skillId); const b = s.score != null ? bandFor(s.score) : null; return <li key={s.skillId} className="card p-3"><div className="flex items-center justify-between"><span className="font-medium">{asm.skills.find((k) => k.id === s.skillId)?.clientLabel || sk?.name}</span><span className="flex items-center gap-2">{s.confidence !== 'Low' && s.score != null && <span className="font-semibold" style={{ color: b ? color(b.name) : undefined }}>{s.score}</span>}<Badge tone={s.confidence === 'High' ? 'ok' : s.confidence === 'Medium' ? 'warn' : 'block'}>{s.band || 'Pending'} · {s.confidence} confidence</Badge></span></div><div className="mt-1 h-1.5 rounded bg-[var(--card-2)]"><div className="h-1.5 rounded" style={{ width: `${((s.score || 1) - 1) / 9 * 100}%`, background: b ? color(b.name) : '#ccc' }} /></div><p className="muted mt-1 text-xs">{sk?.definition} {s.observations} observations across {asm.scenarios.filter((x) => x.skillId === s.skillId).length} scenarios.{s.confidence === 'Low' ? ' Band only: a response could not be scored or was flagged.' : ''}</p></li>; })}</ul></section>
      <section className="card p-3"><div className="faint text-[11px] uppercase tracking-wider">3. How the overall score is built</div><p className="mt-1 text-xs">Your overall score is the weighted average of your Skill scores; Skills with more observations count more. Weights: {agg.skills.map((s) => `${getSkill(s.skillId)?.name} ${s.weightShare}%`).join(', ')}.</p></section>
      <section><div className="faint mb-2 text-[11px] uppercase tracking-wider">4 and 5. Evidence and observations</div>
        <ul className="space-y-3">{evidence.map((e) => <li key={e.scenario.id} className="card p-3"><div className="flex items-center justify-between"><span className="font-medium">{e.scenario.title}</span><Badge>{e.type}</Badge></div><p className="muted text-xs">{e.scenario.contextHeader}</p>
          <ul className="mt-2 space-y-2 text-xs">{e.items.map((it, i) => <li key={i} className="rounded bg-[var(--card-2)] p-2"><div className="font-medium">{it.question}</div>{e.type === 'MCQ' ? <><div className="mt-0.5">You chose: <em>{it.chosen}</em> (value {it.key ?? '–'} of 5)</div><div className="muted mt-0.5">{it.rationale}</div></> : <><div className="mt-0.5">Level: <strong>{LEVEL_LABELS[`L${it.level}`]}</strong> ({it.level} of 3){it.passes && <span className="faint"> · passes {it.passes.join(' and ')}</span>}</div>{it.quote && <div className="mt-0.5 border-l-2 border-[var(--brand)] pl-2 italic">"{it.quote}"</div>}<div className="muted mt-0.5">What the situation required: {it.anchor}</div></>}<div className="faint mt-0.5">Behavior: {it.indicator}</div></li>)}</ul>
          {(e.redactions > 0 || e.injectionFlag || e.pasted) && <p className="faint mt-2 text-[11px]">{e.redactions > 0 ? `${e.redactions} personal detail${e.redactions === 1 ? '' : 's'} anonymized before analysis. ` : ''}{e.injectionFlag ? 'Instructions to the scorer were ignored and flagged. ' : ''}{e.pasted ? 'Pasted text recorded as an integrity signal (visible to the org viewer only).' : ''}</p>}
          {e.mode === 'llm' && <p className="faint mt-1 text-[11px]">Scored by the AI contextual scorer, two passes.</p>}{e.mode === 'none' && <p className="mt-1 text-[11px] text-[var(--block)]">Not scored: {e.note}</p>}
        </li>)}</ul></section>
      <section className="card p-3"><div className="faint text-[11px] uppercase tracking-wider">6 to 9. Strengths, development areas, deeper evaluation, recommendations</div><p className="muted mt-1 text-xs">In the delivered report these sections are written by the narrator from the evidence above only: 2 to 3 strengths and development areas each tied to a Skill, a scenario and a quote or choice; cross Skill patterns; and 3 to 5 recommended actions ordered by impact. Every sentence traces to an evidence id. Nothing about grammar, accent or fluency.</p></section>
      <p className="faint text-xs">Report language follows the participant's assessment language. PDF download and email delivery follow the KNOLSKAPE report design used by Conversation AI.</p>
    </div>
  );
}
