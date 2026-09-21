import A from './seedsA.js';
import B from './seedsB.js';
import C from './seedsC.js';
import D from './seedsD.js';
export const SEEDS = [...A, ...B, ...C, ...D];
export function seedsForSkill(skillId) { return SEEDS.filter((s) => s.skillId === skillId); }
