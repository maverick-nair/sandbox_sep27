// A short guided look at the workspace, shown once after the first Monday plan. Each step lights
// up one area; steps whose area is not on screen (for example on a phone) are skipped.
import { useEffect, useLayoutEffect, useState } from 'react';

export const TOUR_STEPS = [
  { sel: '.lx-kpis', title: 'Your numbers', text: 'Conversions against the target, team morale, and the business numbers your decisions move. Keep an eye on them all quarter.' },
  { sel: '.lx-timeline', title: 'Your quarter', text: 'One block per week. Dots show how each decision landed: green went well, amber partly, red did not.' },
  { sel: '.lx-inbox', title: 'Your inbox', text: 'Emails, chats, meeting invites and business updates land here. A blue dot means it needs your reply by Friday.' },
  { sel: '.lx-waiting', title: 'What needs you today', text: 'Open a message to reply inside the conversation. People react and the numbers move straight away.' },
  { sel: '.lx-actions, .lx-action-grid', title: 'Where your time goes', text: 'One-to-ones, training, role changes and more. Each action takes days out of your week, so choose.' },
  { sel: '.lx-team', title: 'Your team', text: 'Everyone by stage, with performance and mood. Tap a person to read their profile and what they have said.' },
  { sel: '.lx-today-foot', title: 'Moving time on', text: 'When you have done what you want today, end the day. Work flows through the stages and people respond. On Friday you see the week.' },
];

const visible = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 ? r : null; };

export default function Tour({ step, onStep, onDone }) {
  const [rect, setRect] = useState(null);
  const steps = TOUR_STEPS;
  useLayoutEffect(() => {
    let i = step;
    while (i < steps.length && !visible(document.querySelector(steps[i].sel))) i += 1;
    if (i >= steps.length) { onDone(); return; }
    if (i !== step) { onStep(i); return; }
    const el = document.querySelector(steps[i].sel);
    el.scrollIntoView?.({ block: 'nearest' });
    setRect(visible(el));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => setRect(visible(document.querySelector(steps[step]?.sel)));
    window.addEventListener('resize', on);
    const onKey = (e) => { if (e.key === 'Escape') onDone(); if (e.key === 'ArrowRight' || e.key === 'Enter') next(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('keydown', onKey); };
  });
  const next = () => (step + 1 >= steps.length ? onDone() : onStep(step + 1));
  if (!rect) return null;
  const s = steps[step];
  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Below the area, else above, else beside it, so the tip never covers what it describes.
  const H = 180;
  let tipTop; let tipLeft;
  if (rect.bottom + H + 12 < vh) { tipTop = rect.bottom + 12; tipLeft = rect.left + rect.width / 2 - 160; }
  else if (rect.top - H - 12 > 0) { tipTop = rect.top - H - 12; tipLeft = rect.left + rect.width / 2 - 160; }
  else if (vw - rect.right > 344) { tipTop = rect.top + 24; tipLeft = rect.right + 12; }
  else if (rect.left > 344) { tipTop = rect.top + 24; tipLeft = rect.left - 332; }
  else { tipTop = vh - H - 12; tipLeft = rect.left + rect.width / 2 - 160; }
  tipTop = Math.max(12, Math.min(vh - H - 12, tipTop));
  tipLeft = Math.max(12, Math.min(vw - 332, tipLeft));
  const shown = steps.filter((x) => visible(document.querySelector(x.sel))).length || steps.length;
  const n = steps.slice(0, step + 1).filter((x) => visible(document.querySelector(x.sel))).length;
  return (
    <div className="lx-tour" role="dialog" aria-modal="true" aria-label={`Tour: ${s.title}`}>
      <div className="lx-tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="lx-tour-tip" style={{ top: tipTop, left: tipLeft }} key={step}>
        <div className="lx-kicker">A quick look around · {n} of {shown}</div>
        <strong>{s.title}</strong>
        <p>{s.text}</p>
        <div className="row spread">
          <button type="button" className="btn ghost sm" onClick={onDone}>Skip the tour</button>
          <button type="button" className="btn primary sm" onClick={next} autoFocus>{step + 1 >= steps.length ? 'Start playing' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
