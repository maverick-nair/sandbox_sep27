// The simulation's visual kit, drawn in SVG so it works offline, inside SCORM packages and in
// every tailoring: illustrated portraits (stable per person, varied, matched to pronouns),
// product illustrations by category, scenes, and icons for actions and rewards.
// Authors can replace any portrait, the product image, the logo or the scene with their own.
import { useId } from 'react';

// ---------- helpers ----------

export function hashOf(s) {
  let h = 2166136261;
  for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (list, h, salt = 0) => list[(h >>> salt) % list.length];

const SKIN = ['#f7d7c4', '#eec1a0', '#d9a07a', '#b97d57', '#8e5a3c', '#5e3a26'];
const HAIR = ['#1f1a17', '#3b2a20', '#6a4328', '#a0683a', '#d6a764', '#8a8a8a', '#2b2b3a'];
const BG = ['#dbe7ff', '#ffe3d6', '#dff5e8', '#f3e1ff', '#fff1c9', '#d9f1f7', '#ffe0ea'];
const SHIRT = ['#2f5fd0', '#1f7a5c', '#8a3fb3', '#c2463a', '#2b3a55', '#d98a1f', '#3b8fa8', '#5a5f6b'];
const HE_HAIR = ['short', 'side', 'crop', 'bald', 'curly', 'short'];
const SHE_HAIR = ['long', 'bob', 'bun', 'curly', 'long', 'hijab', 'ponytail'];
const THEY_HAIR = ['bob', 'short', 'curly', 'crop', 'side', 'long'];

// Returns the look for a person: skin, hair, clothes and accessories, stable for the same seed.
export function lookOf(seed, pronoun = 'they', variant = 0) {
  const h = hashOf(`${seed}:${variant}`);
  const style = pick(pronoun === 'he' ? HE_HAIR : pronoun === 'she' ? SHE_HAIR : THEY_HAIR, h, 3);
  return {
    skin: pick(SKIN, h, 1),
    hair: pick(HAIR, h, 7),
    bg: pick(BG, h, 11),
    shirt: pick(SHIRT, h, 13),
    style,
    glasses: ((h >>> 17) % 5) === 0,
    beard: pronoun === 'he' && ((h >>> 19) % 4) === 0,
    tie: pronoun === 'he' && ((h >>> 21) % 3) === 0,
    jacket: ((h >>> 23) % 3) !== 0,
    earrings: pronoun === 'she' && ((h >>> 25) % 3) === 0 && style !== 'hijab',
  };
}

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
};

// ---------- portraits ----------

export function Portrait({ name, pronoun, photo, size = 64, shape = 'circle', variant = 0, className = '', mood }) {
  const id = useId().replace(/:/g, '');
  if (photo) {
    return <img className={`gk-portrait ${shape} ${className}`} src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />;
  }
  const L = lookOf(name, pronoun, variant);
  const skinD = shade(L.skin, -28);
  const hairD = shade(L.hair, -18);
  const mouth = mood === 'bad' ? 'M44 60 Q50 57 56 60' : mood === 'warn' ? 'M44.5 59.5 L55.5 59.5' : 'M43.5 58 Q50 63.5 56.5 58';
  return (
    <svg className={`gk-portrait ${shape} ${className}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={name ? `Portrait of ${name}` : 'Portrait'}>
      <defs>
        <clipPath id={`c${id}`}>{shape === 'circle' ? <circle cx="50" cy="50" r="50" /> : <rect width="100" height="100" rx="10" />}</clipPath>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={shade(L.bg, 12)} /><stop offset="1" stopColor={shade(L.bg, -14)} /></linearGradient>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="100" height="100" fill={`url(#g${id})`} />
        {/* hair behind the head */}
        {L.style === 'long' && <path d="M29 42 C27 64 30 84 38 92 L62 92 C70 84 73 64 71 42 Z" fill={L.hair} />}
        {L.style === 'ponytail' && <path d="M64 30 C82 36 80 62 70 74 C74 58 72 44 64 38 Z" fill={L.hair} />}
        {L.style === 'hijab' && <path d="M26 46 C26 22 74 22 74 46 C76 64 70 80 80 100 L20 100 C30 80 24 64 26 46 Z" fill={L.shirt === '#2b3a55' ? '#6b4f8a' : shade(L.shirt, 30)} />}
        {/* body */}
        <path d="M8 100 C10 80 28 71 50 71 C72 71 90 80 92 100 Z" fill={L.shirt} />
        {L.jacket && <path d="M8 100 C10 80 28 71 50 71 L44 100 Z M92 100 C90 80 72 71 50 71 L56 100 Z" fill={shade(L.shirt, -38)} />}
        {L.style !== 'hijab' && <path d="M42 66 L42 74 C45 79 55 79 58 74 L58 66 Z" fill={skinD} />}
        {L.style !== 'hijab' && <path d="M40 73 L50 84 L60 73 L56 71 L50 78 L44 71 Z" fill="#f4f6fb" />}
        {L.tie && <path d="M48.5 77 L51.5 77 L53 92 L50 96 L47 92 Z" fill={shade(L.shirt, 60) === '#ffffff' ? '#c2463a' : '#b8323a'} />}
        {/* head */}
        <ellipse cx="32.5" cy="47" rx="3.2" ry="4.6" fill={skinD} />
        <ellipse cx="67.5" cy="47" rx="3.2" ry="4.6" fill={skinD} />
        <ellipse cx="50" cy="45" rx="17.5" ry="21" fill={L.skin} />
        {L.earrings && <><circle cx="32.8" cy="52.5" r="1.4" fill="#e7c14b" /><circle cx="67.2" cy="52.5" r="1.4" fill="#e7c14b" /></>}
        {/* hair in front */}
        {L.style === 'short' && <path d="M32 42 C31 25 43 20 52 21 C63 21 70 28 68 43 C66 34 60 30 50 30 C41 30 35 34 32 42 Z" fill={L.hair} />}
        {L.style === 'side' && <path d="M32 44 C29 26 44 19 54 21 C66 23 71 31 68 44 C66 36 62 31 56 30 C50 33 40 34 32 44 Z" fill={L.hair} />}
        {L.style === 'crop' && <path d="M33 38 C34 26 44 22 50 22 C58 22 66 26 67 38 C62 31 38 31 33 38 Z" fill={L.hair} />}
        {L.style === 'bald' && <path d="M33 40 C35 30 42 25 50 25 C58 25 65 30 67 40 C63 34 37 34 33 40 Z" fill={shade(L.skin, -10)} opacity="0.7" />}
        {L.style === 'curly' && <g fill={L.hair}>{[[34, 36], [38, 28], [45, 23], [53, 22], [61, 26], [66, 33], [67, 40], [33, 43]].map(([x, y], k) => <circle key={k} cx={x} cy={y} r="6.2" />)}</g>}
        {(L.style === 'long' || L.style === 'ponytail') && <path d="M32 46 C29 25 42 20 51 20 C62 20 72 27 68 46 C66 36 58 29 49 30 C43 32 36 38 32 46 Z" fill={L.hair} />}
        {L.style === 'bob' && <path d="M30 56 C26 28 40 20 51 20 C63 20 74 28 70 56 C68 46 67 38 64 34 C56 30 44 30 36 34 C33 40 32 48 30 56 Z" fill={L.hair} />}
        {L.style === 'bun' && <><circle cx="50" cy="17" r="7.5" fill={L.hair} /><path d="M32 44 C30 26 42 21 50 21 C60 21 70 26 68 44 C64 33 56 30 50 30 C43 30 36 33 32 44 Z" fill={L.hair} /></>}
        {L.style === 'hijab' && <path d="M30 48 C29 26 42 19 50 19 C58 19 71 26 70 48 C68 36 60 28 50 28 C40 28 32 36 30 48 Z" fill={L.shirt === '#2b3a55' ? '#5a3f78' : shade(L.shirt, 12)} />}
        {L.beard && <path d="M34 50 C35 64 42 68 50 68 C58 68 65 64 66 50 C63 58 58 60 50 60 C42 60 37 58 34 50 Z" fill={hairD} opacity="0.85" />}
        {/* face */}
        <path d="M40 39.5 Q43.5 37.5 47 39.5" stroke={hairD} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M53 39.5 Q56.5 37.5 60 39.5" stroke={hairD} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <ellipse cx="43.5" cy="45" rx="1.9" ry="2.3" fill="#231d1a" />
        <ellipse cx="56.5" cy="45" rx="1.9" ry="2.3" fill="#231d1a" />
        <circle cx="44.1" cy="44.3" r="0.6" fill="#fff" />
        <circle cx="57.1" cy="44.3" r="0.6" fill="#fff" />
        <path d="M50 46 Q48.5 51.5 50.6 52.3" stroke={skinD} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d={mouth} stroke="#8a3b34" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <ellipse cx="40" cy="52" rx="3" ry="1.6" fill="#e58f86" opacity="0.28" />
        <ellipse cx="60" cy="52" rx="3" ry="1.6" fill="#e58f86" opacity="0.28" />
        {L.glasses && <g fill="none" stroke="#2a2a33" strokeWidth="1.3"><circle cx="43.5" cy="45" r="4.6" /><circle cx="56.5" cy="45" r="4.6" /><path d="M48.1 45 L51.9 45" /></g>}
      </g>
    </svg>
  );
}

// ---------- product illustrations ----------

export { PRODUCT_ART, artKindFor } from '../engine/art-kind.js';
import { PRODUCT_ART } from '../engine/art-kind.js';

export function ProductArt({ kind = 'goods', image, size = 220, label }) {
  const id = useId().replace(/:/g, '');
  if (image) return <img className="gk-product-img" src={image} alt={label || ''} style={{ maxWidth: size, maxHeight: size }} />;
  const g = `pg${id}`;
  const shapes = {
    elevator: (
      <g>
        <rect x="70" y="18" width="60" height="164" rx="4" fill="#dfe6f3" stroke="#8fa0bf" strokeWidth="2" />
        <rect x="76" y="10" width="48" height="14" rx="3" fill="#4f6fae" /><circle cx="100" cy="17" r="4" fill="#9fb6ff" />
        <path d="M86 24 L86 70 M114 24 L114 70" stroke="#6b7a96" strokeWidth="1.5" />
        <rect x="80" y="70" width="40" height="62" rx="3" fill={`url(#${g})`} stroke="#3b5aa0" strokeWidth="2" />
        <path d="M100 74 L100 128" stroke="#2a3f73" strokeWidth="1.5" /><rect x="84" y="76" width="12" height="18" rx="2" fill="#e8a45c" opacity="0.8" />
        <rect x="76" y="150" width="48" height="26" rx="3" fill="#b9c6de" /><path d="M78 182 L122 182" stroke="#8fa0bf" strokeWidth="3" />
      </g>
    ),
    finance: (
      <g>
        <rect x="36" y="62" width="120" height="76" rx="10" fill={`url(#${g})`} transform="rotate(-8 96 100)" />
        <rect x="46" y="74" width="120" height="76" rx="10" fill="#1f2d52" />
        <rect x="58" y="92" width="24" height="18" rx="3" fill="#e7c14b" /><path d="M58 128 L120 128 M58 138 L100 138" stroke="#9fb6ff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="150" cy="150" r="20" fill="#e7c14b" stroke="#c49a2c" strokeWidth="3" /><text x="150" y="157" textAnchor="middle" fontSize="20" fontWeight="700" fill="#8a6a1c">$</text>
      </g>
    ),
    insurance: (<g><path d="M100 30 L154 50 C154 104 132 142 100 166 C68 142 46 104 46 50 Z" fill={`url(#${g})`} stroke="#2a3f73" strokeWidth="3" /><path d="M78 98 L94 114 L124 82" stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>),
    software: (<g><rect x="34" y="46" width="132" height="86" rx="8" fill="#1f2d52" /><rect x="42" y="54" width="116" height="70" rx="4" fill={`url(#${g})`} /><rect x="50" y="62" width="40" height="8" rx="3" fill="#fff" opacity="0.9" /><rect x="50" y="78" width="100" height="6" rx="3" fill="#fff" opacity="0.5" /><rect x="50" y="90" width="70" height="6" rx="3" fill="#fff" opacity="0.5" /><path d="M110 118 L122 104 L134 110 L148 94" stroke="#e7c14b" strokeWidth="4" fill="none" /><path d="M22 138 L178 138 L166 150 L34 150 Z" fill="#8fa0bf" /></g>),
    phone: (<g><rect x="66" y="22" width="68" height="156" rx="14" fill="#1f2d52" /><rect x="72" y="34" width="56" height="124" rx="6" fill={`url(#${g})`} /><circle cx="100" cy="168" r="4" fill="#8fa0bf" /><rect x="80" y="46" width="18" height="18" rx="5" fill="#fff" opacity="0.9" /><rect x="102" y="46" width="18" height="18" rx="5" fill="#e7c14b" /><rect x="80" y="70" width="40" height="30" rx="5" fill="#fff" opacity="0.5" /><rect x="80" y="106" width="40" height="8" rx="4" fill="#fff" opacity="0.6" /></g>),
    vehicle: (<g><path d="M30 124 L42 92 C46 82 56 76 68 76 L128 76 C140 76 150 82 156 92 L170 124 L170 144 L30 144 Z" fill={`url(#${g})`} /><path d="M58 92 L72 82 L126 82 L140 92 Z" fill="#dfe6f3" /><circle cx="64" cy="146" r="16" fill="#1f2d52" /><circle cx="64" cy="146" r="6" fill="#b9c6de" /><circle cx="138" cy="146" r="16" fill="#1f2d52" /><circle cx="138" cy="146" r="6" fill="#b9c6de" /><rect x="156" y="114" width="12" height="8" rx="2" fill="#e7c14b" /></g>),
    energy: (<g><circle cx="148" cy="48" r="20" fill="#e7c14b" /><g stroke="#e7c14b" strokeWidth="4" strokeLinecap="round">{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d={`M${148 + Math.cos((a * Math.PI) / 180) * 28} ${48 + Math.sin((a * Math.PI) / 180) * 28} L${148 + Math.cos((a * Math.PI) / 180) * 36} ${48 + Math.sin((a * Math.PI) / 180) * 36}`} />)}</g><path d="M30 150 L60 84 L140 84 L170 150 Z" fill={`url(#${g})`} stroke="#1f2d52" strokeWidth="3" /><path d="M56 106 L148 106 M46 128 L158 128 M86 84 L76 150 M114 84 L124 150" stroke="#1f2d52" strokeWidth="2" /><rect x="94" y="150" width="12" height="26" fill="#6b7a96" /></g>),
    health: (<g><rect x="62" y="56" width="76" height="110" rx="12" fill="#f4f6fb" stroke="#8fa0bf" strokeWidth="3" /><rect x="58" y="36" width="84" height="26" rx="6" fill={`url(#${g})`} /><path d="M100 88 L100 136 M76 112 L124 112" stroke="#c2463a" strokeWidth="14" strokeLinecap="round" /></g>),
    building: (<g><rect x="44" y="60" width="54" height="120" fill={`url(#${g})`} /><rect x="102" y="36" width="56" height="144" fill="#1f2d52" />{[0, 1, 2, 3, 4, 5].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={112 + c * 22} y={48 + r * 20} width="12" height="10" fill="#e7c14b" opacity={(r + c) % 3 ? 0.9 : 0.35} />))}{[0, 1, 2, 3].map((r) => <rect key={r} x="56" y={74 + r * 24} width="30" height="10" fill="#fff" opacity="0.6" />)}<rect x="30" y="178" width="140" height="6" fill="#8fa0bf" /></g>),
    industrial: (<g><circle cx="96" cy="100" r="44" fill={`url(#${g})`} /><circle cx="96" cy="100" r="16" fill="#1f2d52" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="90" y="46" width="12" height="18" rx="2" fill="#4f6fae" transform={`rotate(${a} 96 100)`} />)}<circle cx="148" cy="148" r="20" fill="#8fa0bf" /><circle cx="148" cy="148" r="7" fill="#1f2d52" /></g>),
    service: (<g><rect x="50" y="70" width="100" height="84" rx="10" fill={`url(#${g})`} /><path d="M82 70 L82 58 C82 52 86 48 92 48 L108 48 C114 48 118 52 118 58 L118 70" stroke="#1f2d52" strokeWidth="7" fill="none" /><rect x="50" y="100" width="100" height="10" fill="#1f2d52" opacity="0.35" /><rect x="92" y="96" width="16" height="18" rx="3" fill="#e7c14b" /></g>),
    goods: (<g><path d="M100 36 L162 66 L162 136 L100 166 L38 136 L38 66 Z" fill={`url(#${g})`} /><path d="M38 66 L100 96 L162 66 M100 96 L100 166" stroke="#1f2d52" strokeWidth="3" fill="none" opacity="0.5" /><path d="M69 51 L131 81 L131 100" stroke="#e7c14b" strokeWidth="8" fill="none" /></g>),
  };
  return (
    <svg className="gk-product-art" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label || PRODUCT_ART[kind] || 'Product'}>
      <defs><linearGradient id={g} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7aa2ff" /><stop offset="1" stopColor="#3b5aa0" /></linearGradient></defs>
      <ellipse cx="100" cy="188" rx="70" ry="8" fill="#000" opacity="0.12" />
      {shapes[kind] || shapes.goods}
    </svg>
  );
}

// ---------- scenes ----------

export const SCENES = {
  boardroom: 'Meeting room',
  city: 'City skyline',
  office: 'Open office',
  studio: 'Studio (plain)',
};

// A scene as a CSS background: an SVG, dark enough for white text on top.
export function sceneBackground(scene, custom) {
  if (custom) return `linear-gradient(180deg, rgba(10,12,24,0.72), rgba(10,12,24,0.86)), url("${custom}") center / cover no-repeat`;
  const svg = {
    boardroom: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2c3350'/><stop offset='1' stop-color='#0f1224'/></linearGradient><radialGradient id='l' cx='.5' cy='.2' r='.7'><stop offset='0' stop-color='#6d7bb8' stop-opacity='.45'/><stop offset='1' stop-color='#0f1224' stop-opacity='0'/></radialGradient></defs><rect width='1600' height='900' fill='url(#w)'/><rect x='260' y='60' width='1080' height='330' fill='#39426a' opacity='.55'/><g stroke='#1d2240' stroke-width='10' opacity='.8'><path d='M530 60 V390 M800 60 V390 M1070 60 V390'/></g><rect width='1600' height='900' fill='url(#l)'/><ellipse cx='800' cy='690' rx='640' ry='120' fill='#0b0d1a' opacity='.9'/><g fill='#151a33'>${[220, 420, 620, 820, 1020, 1220].map((x) => `<path d='M${x} 560 q40 -70 90 0 v120 h-90z'/>`).join('')}${[300, 560, 820, 1080, 1340].map((x) => `<path d='M${x - 60} 820 q50 -90 110 0 v80 h-110z'/>`).join('')}</g></svg>`,
    city: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#1a1740'/><stop offset='.6' stop-color='#3b2a6e'/><stop offset='1' stop-color='#7a3d62'/></linearGradient></defs><rect width='1600' height='900' fill='url(#s)'/><circle cx='1260' cy='220' r='60' fill='#f5c97a' opacity='.5'/><g fill='#141430'>${[[0, 520, 140], [130, 420, 110], [230, 560, 160], [380, 360, 120], [490, 470, 150], [630, 300, 130], [750, 440, 170], [910, 380, 120], [1020, 500, 150], [1160, 330, 130], [1280, 460, 170], [1440, 400, 160]].map(([x, y, w]) => `<rect x='${x}' y='${y}' width='${w}' height='${900 - y}'/>`).join('')}</g><g fill='#f5c97a' opacity='.55'>${Array.from({ length: 90 }, (_, i) => `<rect x='${(i * 173) % 1560 + 20}' y='${420 + ((i * 97) % 420)}' width='8' height='12'/>`).join('')}</g></svg>`,
    office: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='o' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#24304f'/><stop offset='1' stop-color='#10152a'/></linearGradient></defs><rect width='1600' height='900' fill='url(#o)'/><g fill='#3a4876' opacity='.45'>${[0, 1, 2, 3, 4].map((i) => `<rect x='${100 + i * 300}' y='80' width='240' height='260'/>`).join('')}</g><g fill='#0d1224'>${[0, 1, 2, 3].map((i) => `<rect x='${120 + i * 380}' y='600' width='300' height='24'/><rect x='${150 + i * 380}' y='520' width='90' height='70' rx='6'/><rect x='${260 + i * 380}' y='624' width='12' height='120'/>`).join('')}</g><g fill='#1f5a44' opacity='.7'><circle cx='60' cy='640' r='70'/><circle cx='1540' cy='600' r='80'/></g></svg>`,
    studio: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'><defs><radialGradient id='a' cx='.8' cy='0' r='.8'><stop offset='0' stop-color='#3b2a7a'/><stop offset='1' stop-color='#141a2b' stop-opacity='0'/></radialGradient><radialGradient id='b' cx='0' cy='1' r='.7'><stop offset='0' stop-color='#5a2340'/><stop offset='1' stop-color='#141a2b' stop-opacity='0'/></radialGradient></defs><rect width='1600' height='900' fill='#161a33'/><rect width='1600' height='900' fill='url(#a)'/><rect width='1600' height='900' fill='url(#b)'/></svg>`,
  }[scene] || null;
  if (!svg) return sceneBackground('studio');
  return `linear-gradient(180deg, rgba(10,12,24,0.35), rgba(10,12,24,0.7)), url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") center / cover no-repeat`;
}

// ---------- small pictures ----------

export function TargetArt({ size = 180 }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Target">
      <circle cx="90" cy="104" r="78" fill="#3a3f55" /><circle cx="90" cy="104" r="60" fill="#fff" /><circle cx="90" cy="104" r="42" fill="#3a3f55" /><circle cx="90" cy="104" r="24" fill="#fff" /><circle cx="90" cy="104" r="10" fill="#e0524a" />
      <path d="M94 100 L176 60" stroke="#c9873a" strokeWidth="6" strokeLinecap="round" />
      <path d="M170 50 L192 44 L184 64 Z M176 60 L196 60 L184 74 Z" fill="#e7a93a" />
    </svg>
  );
}

export function TrophyArt({ size = 120, tier = 'gold' }) {
  const c = { gold: ['#f5c542', '#c9951f'], silver: ['#d9dde6', '#9aa2b2'], bronze: ['#e3a06a', '#a9642f'], practice: ['#9fb6ff', '#4f6fae'] }[tier] || ['#f5c542', '#c9951f'];
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${tier} trophy`}>
      <path d="M36 20 H84 V44 C84 62 72 74 60 74 C48 74 36 62 36 44 Z" fill={c[0]} stroke={c[1]} strokeWidth="3" />
      <path d="M36 28 H20 C20 46 28 54 38 54 M84 28 H100 C100 46 92 54 82 54" stroke={c[1]} strokeWidth="5" fill="none" />
      <rect x="54" y="74" width="12" height="16" fill={c[1]} /><rect x="38" y="90" width="44" height="12" rx="3" fill={c[1]} /><rect x="32" y="102" width="56" height="8" rx="3" fill="#3a3f55" />
      <path d="M50 32 L54 44 L66 44 L56 51 L60 62 L50 55 L40 62 L44 51 L34 44 L46 44 Z" fill="#fff" opacity="0.8" transform="translate(10 -2) scale(0.85)" />
    </svg>
  );
}

const ICON_PATHS = {
  team: 'M7 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm10 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 19c0-3 2.5-5 5-5s5 2 5 5M12 19c0-3 2.5-5 5-5s5 2 5 5',
  energy: 'M13 2 L4 14 H11 L10 22 L20 9 H13 Z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  training: 'M3 5h18v11H3zM8 21l4-5 4 5M7 9h6M7 12h9',
  hire: 'M9 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M19 8v6M16 11h6',
  fire: 'M9 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 11h6',
  meet: 'M4 5h11v8H8l-4 3zM20 9v9l-3-2h-6v-3',
  assess: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5M8 11l2 2 4-4',
  reward: 'M7 3h10v5a5 5 0 0 1-10 0zM7 5H4c0 3 1.5 4 3 4M17 5h3c0 3-1.5 4-3 4M12 13v4M8 21h8M9 17h6',
  goals: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12l8-8',
  coach: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  feedback: 'M4 4h16v11H9l-5 4zM8 9h8M8 12h5',
  funnel: 'M3 4h18l-7 8v7l-4 2v-9z',
  trophy: 'M7 3h10v5a5 5 0 0 1-10 0zM12 13v4M8 21h8',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2',
  objective: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
  help: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4zM20 4h-3a3 3 0 0 0-3 3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  flame: 'M12 22c-4 0-7-2.7-7-6.5C5 11 9 9 9 4c3 2 4 4 4 6 1-1 1.5-2 1.5-3.5C17 9 19 12 19 15.5 19 19.3 16 22 12 22z',
};
const ACTION_ICON = { 'meet-team': 'team', energise: 'energy', email: 'mail', reassign: 'swap', training: 'training', hire: 'hire', fire: 'fire', 'face-to-face': 'meet', assess: 'assess', reward: 'reward', 'set-goals': 'goals', coach: 'coach', feedback: 'feedback' };

export function Icon({ name, size = 18, className = '' }) {
  const d = ICON_PATHS[ACTION_ICON[name] || name] || ICON_PATHS.star;
  return <svg className={`gk-icon ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

// A ring for 0 to 100 (skill, morale, result), coloured by level.
export function StatRing({ value, label, size = 38, hidden, band }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value ?? 0));
  const col = v >= 70 ? 'var(--good)' : v >= 40 ? 'var(--warn)' : 'var(--bad)';
  return (
    <span className="gk-ring" title={hidden ? `${label}: unknown` : `${label}: ${band || Math.round(v)}`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
        {!hidden && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="gk-ring-fill" />}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3} fontWeight="700" fill="currentColor">{hidden ? '?' : band ? band.slice(0, 1).toUpperCase() : Math.round(v)}</text>
      </svg>
      {label && <span className="gk-ring-label">{label}</span>}
    </span>
  );
}

export function Logo({ def, look, size = 30 }) {
  const logo = look?.logo;
  const name = def.context.entities.find((e) => e.key === 'company')?.value || '';
  if (logo) return <img className="gk-logo" src={logo} alt={name} style={{ height: size, maxWidth: size * 4 }} />;
  return <span className="lx-mark" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.5, ...(look?.brand ? { background: `linear-gradient(135deg, ${look.brand}, ${shade(look.brand, -50)})` } : {}) }}>{name.slice(0, 1)}</span>;
}
