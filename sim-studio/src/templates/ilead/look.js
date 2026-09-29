// How the simulation looks and plays as a game: brand, images, scene, and the reward layer.
// Everything here is authored in the Studio (Look and feel, Game elements).
import { artKindFor } from '../../engine/art-kind.js';

export function defaultLook(def) {
  const p = def?.context?.profile || {};
  return {
    brand: '#2f5fd0',
    logo: '',
    scene: 'boardroom',
    sceneImage: '',
    ceoPhoto: '',
    productImage: '',
    productArt: artKindFor([p.offeringCategory, p.offeringName, p.industry].join(' ')),
    photos: {},
    portraitVariant: {},
  };
}

export const DEFAULT_LEVELS = [
  { name: 'New in the role', xp: 0 },
  { name: 'Finding your feet', xp: 40 },
  { name: 'Trusted manager', xp: 100 },
  { name: 'Team builder', xp: 180 },
  { name: 'Inspiring leader', xp: 280 },
];

export function defaultGame() {
  return { xp: true, achievements: true, benchmarks: true, levels: DEFAULT_LEVELS.map((l) => ({ ...l })), streaks: true, celebrations: true, liveLeaderboard: true, liveRank: true };
}

export const DEFAULT_GOALS = ['Improve your team’s skill, morale and performance.'];

export const levelOf = (game, xp) => {
  const levels = (game?.levels?.length ? game.levels : DEFAULT_LEVELS).slice().sort((a, b) => a.xp - b.xp);
  let i = 0;
  for (let k = 0; k < levels.length; k++) if (xp >= levels[k].xp) i = k;
  const next = levels[i + 1];
  return { index: i, level: levels[i], next, progress: next ? (xp - levels[i].xp) / Math.max(1, next.xp - levels[i].xp) : 1, count: levels.length };
};
