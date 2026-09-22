import React, { useState } from 'react';
import { Badge, Button, Severity } from '../components/ui.jsx';
import { RULES } from '../content/rules.js';
import { GateGroups } from '../steps/Step6Gate.jsx';
import Step7Publish from '../steps/Step7Publish.jsx';

// Publish stage: the quality gate summary sits above the configuration so the author sees what blocks and
// fixes it from here. Details expand on demand.
export default function Publish(props) {
  const { asm, gate, go } = props;
  const [open, setOpen] = useState(!gate.canPublish);
  const scenarios = asm.scenarios || [];
  const tone = gate.hard.length ? 'border-[var(--block)]/40' : 'border-[var(--ok)]/40';
  return (
    <div className="space-y-5">
      <section className={`card ${tone}`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${gate.hard.length ? 'bg-[var(--block-soft)] text-[var(--block)]' : 'bg-[var(--ok-soft)] text-[var(--ok)]'}`}>{gate.hard.length ? gate.hard.length : '✓'}</span>
            <div><div className="text-sm font-semibold">{gate.hard.length ? `${gate.hard.length} item${gate.hard.length === 1 ? '' : 's'} block publish` : 'Passes the quality gate'}</div><div className="faint text-xs">{gate.soft.length} suggestion{gate.soft.length === 1 ? '' : 's'} · {scenarios.filter((s) => s.approved).length}/{scenarios.length} approved · {gate.totalMinutes} min estimated{gate.totalMinutes > RULES.time.totalWarn ? ' (long)' : ''}</div></div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {gate.hard.length > 0 && <Button size="sm" onClick={() => { const first = gate.hard[0]; if (first.scenarioId) go(2, { scenarioId: first.scenarioId }); else if (first.step === 2) go(1); else if (first.step === 3) go(2, { plan: true }); }}>Fix the first</Button>}
            <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Show details'}</Button>
          </div>
        </div>
        {open && <div className="border-t border-[var(--line)] p-5"><GateGroups {...props} /></div>}
      </section>
      <Step7Publish {...props} embedded />
    </div>
  );
}
