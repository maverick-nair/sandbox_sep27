import { contextBoundItems } from '../../engine/text.js';
import { desiredStyle } from '../../engine/engine.js';
import { styleMix, SESSION_LENGTHS, DIFFICULTY } from '../../engine/authoring.js';
import { healthSummary } from '../../engine/validate.js';
import { pct } from '../../engine/balance.js';
import { Button, Pill, TextInput, StylePill } from '../ui.jsx';
import { profileSummary } from '../Tailoring.jsx';

const LOOP = [
  ['Monday', 'Set a leadership style for each team member. Right reads build skill and morale; wrong ones cost them.'],
  ['During the week', 'Take actions (meet, coach, give feedback, train, reward, restructure). Each costs days and is judged against what each person needs.'],
  ['Every day', 'Leads flow through the stages. Each stage converts according to how well its people perform.'],
  ['End of run', 'Conversions against target, plus a report on five leadership competencies.'],
];

export default function Overview({ def, update, sim, go, issues, openPanel }) {
  const company = def.context.entities.find((e) => e.key === 'company')?.value;
  const industryChanged = def.context.industry.toLowerCase() !== def.context.originalIndustry.toLowerCase();
  const bound = industryChanged ? contextBoundItems(def) : [];
  const mix = styleMix(def, desiredStyle);
  const quadrants = Object.values(mix).filter((n) => n > 0).length;
  const h = healthSummary(issues);
  const ack = new Set(def.meta.acknowledged || []);
  const assumptions = def.meta.assumptions || [];
  const stale = sim.balance && sim.balance.at < sim.updatedAt;
  const len = SESSION_LENGTHS.find((l) => l.weeks === def.timeline.weeks);
  const team = def.actors.filter((a) => a.pool === 'team').length;
  const pool = def.actors.filter((a) => a.pool === 'hire').length;
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency, notation: 'compact' });

  const checks = [
    {
      label: 'Context',
      state: bound.length ? 'warn' : 'good',
      text: `${profileSummary(def.context.profile)}.${bound.length ? ` ${bound.length} situations still come from the original ${def.context.originalIndustry.toLowerCase()} storyline.` : ''}`,
      action: () => go('story', { field: bound.length ? 'rewrite' : 'profile' }),
      actionLabel: bound.length ? 'Rewrite' : 'Edit',
    },
    {
      label: 'Team diagnosis',
      state: quadrants >= 3 ? 'good' : 'warn',
      text: `The starting team needs ${quadrants} of 4 leadership styles.`,
      action: () => go('team'),
      actionLabel: 'Open team',
    },
    {
      label: 'Health',
      state: h.errors ? 'bad' : h.warnings ? 'warn' : 'good',
      text: h.errors ? `${h.errors} to fix, ${h.warnings} to review.` : h.warnings ? `${h.warnings} to review.` : 'No issues.',
      action: () => openPanel('health'),
      actionLabel: 'Open',
    },
    {
      label: 'Balance',
      state: !sim.balance || stale ? 'warn' : sim.balance.status === 'balanced' ? 'good' : 'bad',
      text: !sim.balance ? 'Not run yet.' : `${stale ? 'Out of date. ' : ''}Skilled leader reaches ${pct(sim.balance.bots.expert.p50)} of target; guessing reaches ${pct(sim.balance.bots.random.p50)}.`,
      action: () => openPanel('balance'),
      actionLabel: sim.balance ? 'Re-run' : 'Run',
    },
    {
      label: 'Migration assumptions',
      state: assumptions.every((a) => ack.has(a.id)) ? 'good' : 'warn',
      text: `${assumptions.filter((a) => ack.has(a.id)).length} of ${assumptions.length} confirmed.`,
      action: () => document.getElementById('assumptions')?.scrollIntoView({ behavior: 'smooth' }),
      actionLabel: 'Review',
    },
  ];
  const tone = { good: 'good', warn: 'warn', bad: 'bad' };
  const toneLabel = { good: 'Done', warn: 'Review', bad: 'Fix' };

  return (
    <div className="stack" style={{ '--gap': '24px' }}>
      <div className="stack" style={{ '--gap': '8px' }}>
        <div className="eyebrow">iLead template {def.meta.templateVersion} · {def.meta.storyline}</div>
        <div style={{ maxWidth: 560 }}>
          <TextInput label="Simulation name" value={def.meta.name} onChange={(v) => update((d) => { d.meta.name = v; })} />
        </div>
      </div>

      <div className="grid cols-4">
        <KeyNumber label="Session" value={len ? len.label : `${def.timeline.weeks} weeks`} sub={`${def.timeline.weeks} weeks of ${def.timeline.daysPerWeek} days · ${DIFFICULTY[def.meta.difficulty]?.label || 'Custom'}`} onClick={() => go('settings')} />
        <KeyNumber label="Team" value={`${team} people`} sub={`${pool} hiring candidates · ${def.stages.length} stages`} onClick={() => go('team')} />
        <KeyNumber label="Target" value={`${def.funnel.target} conversions`} sub={`${money.format(def.funnel.target * def.funnel.valuePerConversion)} revenue`} onClick={() => go('funnel')} />
        <KeyNumber label="Playable content" value={`${def.actions.filter((a) => a.enabled).length} actions`} sub={`${def.events.filter((e) => e.enabled).length} events · ${def.triggers.filter((t) => t.enabled).length} triggers`} onClick={() => go('actions')} />
      </div>

      <section className="card stack" aria-labelledby="ready-h">
        <h2 id="ready-h">Readiness</h2>
        <div className="stack" style={{ '--gap': '0' }}>
          {checks.map((c) => (
            <div key={c.label} className="check-row">
              <span><Pill tone={tone[c.state]}>{toneLabel[c.state]}</Pill></span>
              <strong>{c.label}</strong>
              <span className="ink2 small check-text">{c.text}</span>
              <Button size="sm" onClick={c.action}>{c.actionLabel}</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="loop-h">
        <h2 id="loop-h">How an iLead run works</h2>
        <div className="grid cols-4">
          {LOOP.map(([t, d], i) => (
            <div key={t} className="card flat stack" style={{ '--gap': '6px' }}>
              <span className="eyebrow">Step {i + 1}</span>
              <h3>{t}</h3>
              <p className="small ink2">{d}</p>
            </div>
          ))}
        </div>
        <div className="row small muted" style={{ '--gap': '6px' }}>
          <span>The four styles:</span>
          {def.leadership.styles.map((s) => <StylePill key={s.id} def={def} styleId={s.id}>{s.name}: {s.skill} skill, {s.morale} morale</StylePill>)}
        </div>
      </section>

      <section id="assumptions" className="card stack" aria-labelledby="as-h">
        <div>
          <h2 id="as-h">Migration assumptions</h2>
          <p className="small ink2" style={{ marginTop: 4 }}>The legacy documents did not specify these values. The template ships sensible defaults; confirm each once someone who knows the original simulation has checked it.</p>
        </div>
        {assumptions.map((a) => (
          <label key={a.id} className="row nowrap" style={{ alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
            <input type="checkbox" checked={ack.has(a.id)} onChange={(e) => update((d) => {
              const set = new Set(d.meta.acknowledged || []);
              if (e.target.checked) set.add(a.id); else set.delete(a.id);
              d.meta.acknowledged = [...set];
            })} style={{ marginTop: 3 }} />
            <span className="grow small">{a.text}</span>
            <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); go(a.section); }}>Open</Button>
          </label>
        ))}
      </section>

      <section className="card stack" aria-labelledby="lf-h">
        <div>
          <h2 id="lf-h">What the migration found in the legacy content</h2>
          <p className="small ink2" style={{ marginTop: 4 }}>Conflicts between the model document and the content workbook, and how the template handles them.</p>
        </div>
        {(def.meta.findings || []).map((f) => (
          <div key={f.id} className="row nowrap" style={{ alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <Pill tone={f.severity === 'fixed' ? 'good' : 'warn'}>{f.severity === 'fixed' ? 'Resolved' : 'Open'}</Pill>
            <span className="small grow">{f.text}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function KeyNumber({ label, value, sub, onClick }) {
  return (
    <button type="button" className="card stack" style={{ '--gap': '2px', textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <span className="eyebrow">{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 650 }} className="num">{value}</span>
      <span className="small muted">{sub}</span>
    </button>
  );
}
