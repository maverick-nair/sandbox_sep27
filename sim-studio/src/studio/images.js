// Images authors add (logo, CEO photo, product image, team photos, scene). Each image is resized
// in the browser first. When the page runs on claude.ai with the asset store, it is uploaded
// there and the definition keeps its durable address ("/_blob/<id>"); otherwise a compact copy is
// kept inside the definition, so it still plays offline and inside SCORM packages.

const LIMITS = { portrait: 320, logo: 360, product: 640, scene: 1600 };

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
    img.src = url;
  });
}

async function resize(file, kind) {
  if (file.type === 'image/svg+xml') return { blob: file, type: file.type };
  const img = await loadImage(file);
  const max = LIMITS[kind] || 640;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Portraits are cropped square from the centre, the way cards show them.
  if (kind === 'portrait') {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = Math.min(max, side);
    c.width = out; c.height = out;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 3, side, side, 0, 0, out, out);
  } else ctx.drawImage(img, 0, 0, w, h);
  const type = kind === 'logo' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((r) => c.toBlob(r, type, 0.82));
  return { blob, type, dataUrl: c.toDataURL(type, kind === 'scene' ? 0.72 : 0.82) };
}

let assetsPromise = null;
const assetsNs = () => {
  const c = typeof window !== 'undefined' ? window.claude : undefined;
  if (!c?.use) return Promise.resolve(null);
  assetsPromise ||= c.use('assets').catch(() => null);
  return assetsPromise;
};

export async function hostedAssets() {
  return !!(await assetsNs());
}

// Returns { url, where: 'hosted' | 'inline' }.
export async function addImage(file, kind = 'product') {
  if (!file) throw new Error('No file chosen.');
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, JPG, WebP or SVG).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB. Choose a smaller one.');
  const r = await resize(file, kind);
  const assets = await assetsNs();
  if (assets) {
    try {
      const up = await assets.upload(r.blob, { type: r.type });
      return { url: `/_blob/${up.id}`, where: 'hosted' };
    } catch { /* fall back to an inline copy */ }
  }
  if (r.dataUrl) return { url: r.dataUrl, where: 'inline' };
  const text = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.blob); });
  return { url: text, where: 'inline' };
}

// For SCORM packages: every hosted image becomes an inline copy, so the package needs no server.
export async function inlineImages(def) {
  const d = JSON.parse(JSON.stringify(def));
  const toData = async (u) => {
    if (!u || u.startsWith('data:')) return u;
    try {
      const b = await (await fetch(u)).blob();
      return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    } catch { return ''; }
  };
  const L = d.look || {};
  for (const k of ['logo', 'sceneImage', 'ceoPhoto', 'productImage']) if (L[k]) L[k] = await toData(L[k]);
  for (const id of Object.keys(L.photos || {})) L.photos[id] = await toData(L.photos[id]);
  return d;
}
