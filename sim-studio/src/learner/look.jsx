// Shares the simulation's look (portraits, photos, brand, scene) with every learner screen, so any
// place that shows a person shows their portrait or the author's photo.
import { createContext, useContext, useMemo } from 'react';
import { renderText } from '../engine/text.js';
import { Portrait, Icon } from './art.jsx';

const LookCtx = createContext(null);

export function LookProvider({ def, children }) {
  const value = useMemo(() => {
    const look = def.look || {};
    const people = new Map();
    for (const a of def.actors) people.set(a.name, { id: a.id, pronoun: a.pronoun, photo: look.photos?.[a.id], variant: look.portraitVariant?.[a.id] || 0 });
    const ceo = renderText(def, '{{ceo}}');
    if (ceo && !people.has(ceo)) people.set(ceo, { id: 'ceo', pronoun: look.ceoPronoun || 'he', photo: look.ceoPhoto, variant: look.portraitVariant?.ceo || 0 });
    return { def, look, people };
  }, [def]);
  return <LookCtx.Provider value={value}>{children}</LookCtx.Provider>;
}

export const useLook = () => useContext(LookCtx);

const SYSTEM = { 'Business news': 'objective', Consequence: 'flame', 'Sales dashboard': 'funnel', 'Team chat': 'team', 'Team meeting': 'team' };

// A person's face: their photo, their illustrated portrait, or an icon for a system sender.
export function Face({ name, size = 36, mood, shape = 'circle', className = '', bare }) {
  const ctx = useLook();
  const p = ctx?.people.get(name);
  if (p) return <Portrait name={name} pronoun={p.pronoun} photo={p.photo} variant={p.variant} size={size} mood={mood} shape={shape} className={className} bare={bare} />;
  if (name === 'You') return <span className={`lx-avatar you ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">You</span>;
  const icon = SYSTEM[name] || (/(news|update|dashboard)/i.test(name || '') ? 'funnel' : null);
  return <span className={`lx-avatar sys ${className}`} style={{ width: size, height: size }} aria-hidden="true"><Icon name={icon || 'mail'} size={size * 0.5} /></span>;
}
