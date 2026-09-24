// Templates available under Experience > Simulations. Each template is an engine (mechanics)
// plus one or more storylines (content). New legacy simulations join this list as they migrate.
import { ILEAD_TEMPLATE, migrateDefinition } from './ilead/index.js';
import * as ileadContext from './ilead/contextualize.js';
import * as ileadPacks from './ilead/context-packs.js';
import * as ileadFixes from './ilead/fixes.js';

export const TEMPLATES = { ilead: { ...ILEAD_TEMPLATE, contextualize: ileadContext, packs: ileadPacks, migrate: migrateDefinition, fixes: ileadFixes } };

// From the KNOLSKAPE storyline catalogue: simulations queued to become templates.
export const PLANNED_TEMPLATES = [
  { name: 'Build Your Business', family: 'Business acumen' },
  { name: 'Trust sim', family: 'Trust and relationships' },
  { name: 'F1 Sim', family: 'High-performance teams' },
  { name: 'Design Thinking', family: 'Innovation' },
  { name: 'Agile Simulation', family: 'Agile ways of working' },
];
