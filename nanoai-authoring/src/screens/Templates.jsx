import React from 'react';
import { Icon, I } from '../components/Shell.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { TEMPLATES } from '../content/templates.js';
import { getSkill } from '../content/ontology.js';
import { purposeById } from '../content/rules.js';

const ART = { people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', handshake: 'M11 17l2 2a2 2 0 0 0 3-3M14 14l2.5 2.5a2 2 0 0 0 3-3L15 9l-3 3-2-2 3-3-3-3-7 7 4 4', headset: 'M3 18v-6a9 9 0 0 1 18 0v6M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3zM21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', chart: 'M3 3v18h18M7 14l4-4 4 4 5-6', compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16 8l-2.5 6.5L7 17l2.5-6.5z' };

export default function Templates() {
  const { createFromTemplate, goHome } = useWorkspace();
  return (
    <div className="space-y-6">
      <button onClick={goHome} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"><Icon d={I.back} size={14} />Back</button>
      <div className="text-center"><h1 className="text-3xl font-semibold">Choose a <span className="text-[var(--brand)]">Template</span></h1><p className="muted mt-1 text-sm">Pick a ready made NanoAI template to get started quickly. Everything stays editable.</p></div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <li key={t.id} className="card flex flex-col p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]" aria-hidden="true"><Icon d={ART[t.icon]} size={20} /></span>
            <h2 className="mt-3 text-base font-semibold">{t.name}</h2>
            <p className="muted mt-0.5 text-sm">{t.tagline}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills in this template">{t.skills.map((id) => <li key={id} className="chip">{getSkill(id)?.name}</li>)}</ul>
            <p className="faint mt-2 text-xs">{t.audience} · {purposeById(t.purpose).label} · {t.skills.length} Skills, about {t.skills.length * 2} scenarios</p>
            <button onClick={() => createFromTemplate(t)} className="mt-4 inline-flex min-h-[32px] items-center gap-1 self-start text-sm font-semibold text-[var(--brand)] hover:underline" aria-label={`Use the ${t.name} template`}>Use this template <span aria-hidden="true">→</span></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
