// SCORM 1.2 packaging, done entirely in the browser: a zip with imsmanifest.xml, a self-contained
// player (this app in learner-only mode, with the simulation baked in) and the definition file.
// Inside an LMS the player finds the SCORM API, reports progress, score and pass or fail.

// ---------- a minimal zip writer (stored, no compression) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const enc = new TextEncoder();

export function buildZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((t, p) => t + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// Reads a zip written by buildZip (stored entries) back into { name: text }. Used by tests and the package check.
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let p = 0;
  const dec = new TextDecoder();
  while (p + 30 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
    const size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true);
    const xlen = dv.getUint16(p + 28, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nlen));
    const start = p + 30 + nlen + xlen;
    out[name] = { text: dec.decode(bytes.subarray(start, start + size)), crc: dv.getUint32(p + 14, true), ok: crc32(bytes.subarray(start, start + size)) === dv.getUint32(p + 14, true) };
    p = start + size;
  }
  return out;
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function scormManifest({ id, title, version, passScore }) {
  const ident = `GK-${String(id).replace(/[^A-Za-z0-9_-]/g, '')}-v${version}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${ident}" version="${version}" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-${ident}">
    <organization identifier="ORG-${ident}">
      <title>${xml(title)}</title>
      <item identifier="ITEM-${ident}" identifierref="RES-${ident}" isvisible="true">
        <title>${xml(title)}</title>
        <adlcp:masteryscore>${Number(passScore) || 65}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-${ident}" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
      <file href="simulation.json"/>
    </resource>
  </resources>
</manifest>
`;
}

// The app's own code and styles, so the package plays without any server.
export async function appSource() {
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].filter((l) => !/fonts\.googleapis/.test(l.href));
  let linkedCss = '';
  for (const l of links) { try { linkedCss += await (await fetch(l.href)).text(); } catch { /* skip */ } }
  const mod = document.querySelector('script[type="module"]');
  let js = mod?.textContent || '';
  if (!js.trim() && mod?.src) js = await (await fetch(mod.src)).text();
  if (!js.trim()) throw new Error('The player code could not be read from this page.');
  return { css: css + linkedCss, js };
}

export function playerHtml({ css, js }, pkg) {
  const data = JSON.stringify(pkg).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${xml(pkg.title)}</title>
<style>${css}</style>
<script>window.__GK_PACKAGE__ = ${data};</script>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}

export async function buildScormPackage(def, { simId, version, title }, source) {
  const src = source || (await appSource());
  const pkg = { kind: 'scorm', title: title || def.meta.name, simId, version, def, passScore: def.delivery?.passScore ?? 65 };
  const files = [
    { name: 'imsmanifest.xml', data: scormManifest({ id: simId, title: pkg.title, version, passScore: pkg.passScore }) },
    { name: 'index.html', data: playerHtml(src, pkg) },
    { name: 'simulation.json', data: JSON.stringify(def, null, 2) },
    { name: 'README.txt', data: `${pkg.title}, version ${version}\nSCORM 1.2 package made by GenieKreator Sim Studio.\nUpload the zip to your LMS as a SCORM 1.2 course. The simulation reports progress, a score out of 100 and passed or failed (pass mark ${pkg.passScore}).\n` },
  ];
  return buildZip(files);
}

// ---------- the SCORM runtime, used by the packaged player ----------
export function findScormApi(win = typeof window !== 'undefined' ? window : null) {
  let w = win;
  for (let i = 0; w && i < 10; i++) {
    if (w.API) return w.API;
    if (w.parent === w) break;
    w = w.parent;
  }
  try { if (win?.opener?.API) return win.opener.API; } catch { /* cross-origin */ }
  return null;
}

export function scormAdapter(api, { passScore = 65 } = {}) {
  if (!api) return null;
  let started = false;
  const set = (k, v) => { try { api.LMSSetValue(k, String(v)); } catch { /* LMS refused */ } };
  const commit = () => { try { api.LMSCommit(''); } catch { /* ignore */ } };
  const init = () => { if (!started) { try { api.LMSInitialize(''); } catch { /* ignore */ } started = true; } };
  // SCORM 1.2 gives the name as "Last, First".
  const learnerName = () => {
    init();
    const raw = (() => { try { return String(api.LMSGetValue('cmi.core.student_name') || ''); } catch { return ''; } })();
    const [last, first] = raw.split(',').map((x) => x.trim());
    return first ? `${first} ${last}` : raw.trim();
  };
  return {
    connected: true,
    learnerName,
    start(identity) {
      init();
      const name = learnerName();
      set('cmi.core.lesson_status', 'incomplete');
      commit();
      return name || identity?.name;
    },
    progress(state) { set('cmi.core.lesson_location', `day-${state.day}`); },
    complete() { commit(); },
    finish(rec) {
      set('cmi.core.score.min', 0);
      set('cmi.core.score.max', 100);
      set('cmi.core.score.raw', Math.round(rec.score));
      set('cmi.core.lesson_status', rec.score >= passScore ? 'passed' : 'failed');
      commit();
      try { api.LMSFinish(''); } catch { /* ignore */ }
    },
  };
}
