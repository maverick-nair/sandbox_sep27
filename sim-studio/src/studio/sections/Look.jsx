// Look and feel: how the simulation looks to learners. Brand colour, logo, the scene behind the
// briefing, the CEO, the product and every person on the team, each illustrated by default and
// replaceable with the author's own image.
import { useRef, useState } from 'react';
import { renderText } from '../../engine/text.js';
import { Portrait, ProductArt, PRODUCT_ART, SCENES, sceneBackground, Logo, TargetArt } from '../../learner/art.jsx';
import { defaultLook } from '../../templates/ilead/look.js';
import { addImage } from '../images.js';
import { Button, Callout, Field, SectionHead, Seg } from '../ui.jsx';

function Upload({ label, kind, onDone, notify, small }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="sr-only" aria-label={label} onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setBusy(true);
        try { const r = await addImage(f, kind); onDone(r.url); notify(r.where === 'hosted' ? 'Image uploaded' : 'Image added'); } catch (err) { notify(err.message); }
        setBusy(false);
      }} />
      <Button size="sm" variant={small ? 'ghost' : undefined} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Adding…' : label}</Button>
    </>
  );
}

export default function Look({ def, update, notify, openPanel }) {
  const look = { ...defaultLook(def), ...(def.look || {}) };
  const set = (patch) => update((d) => { d.look = { ...defaultLook(d), ...(d.look || {}), ...patch }; });
  const setPhoto = (id, url) => update((d) => { d.look ||= defaultLook(d); d.look.photos = { ...(d.look.photos || {}), [id]: url || undefined }; if (!url) delete d.look.photos[id]; });
  const variant = (id) => update((d) => { d.look ||= defaultLook(d); d.look.portraitVariant = { ...(d.look.portraitVariant || {}), [id]: ((d.look.portraitVariant || {})[id] || 0) + 1 }; });
  const ceo = renderText(def, '{{ceo}}');
  const team = def.actors.filter((a) => a.pool === 'team');
  const pool = def.actors.filter((a) => a.pool !== 'team');
  const T = (x) => renderText(def, x);

  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Look and feel" actions={<Button onClick={() => openPanel('preview')}>Preview as a learner</Button>}>
        How the simulation looks: the organization's brand and logo, the scene behind the briefing, and the faces of the CEO, the product and the team. Everything starts illustrated; replace any of it with your client's own images.
      </SectionHead>

      <div className="look-preview" style={{ background: sceneBackground(look.scene, look.sceneImage), '--brand': look.brand }}>
        <div className="look-preview-card">
          <div className="row nowrap" style={{ '--gap': '10px' }}><Logo def={def} look={look} size={40} /><span className="look-kicker">{T('{{company}}')} · {T('{{city}}')}</span></div>
          <strong className="look-title">{T('Lead the {{product}} team at {{company}}')}</strong>
          <span className="look-btn" style={{ background: look.brand }}>Begin the briefing</span>
        </div>
        <div className="look-preview-faces">
          {team.slice(0, 4).map((a) => <Portrait key={a.id} name={a.name} pronoun={a.pronoun} photo={look.photos?.[a.id]} variant={look.portraitVariant?.[a.id] || 0} size={64} shape="square" />)}
          <ProductArt kind={look.productArt} image={look.productImage} size={80} />
        </div>
      </div>

      <div className="card stack" style={{ '--gap': '12px' }}>
        <h3>Brand</h3>
        <div className="row" style={{ '--gap': '18px', alignItems: 'flex-end' }}>
          <Field label="Brand colour" hint="Used for the header, buttons and highlights learners see.">
            <div className="row nowrap"><input type="color" value={look.brand} onChange={(e) => set({ brand: e.target.value })} aria-label="Brand colour" className="color-input" /><code className="small">{look.brand}</code></div>
          </Field>
          <Field label="Logo">
            <div className="row nowrap"><Logo def={def} look={look} size={40} /><Upload label={look.logo ? 'Replace logo' : 'Add logo'} kind="logo" notify={notify} onDone={(u) => set({ logo: u })} />{look.logo && <Button size="sm" variant="ghost" onClick={() => set({ logo: '' })}>Remove</Button>}</div>
          </Field>
        </div>
      </div>

      <div className="card stack" style={{ '--gap': '12px' }}>
        <h3>Scene</h3>
        <p className="small muted">The backdrop behind the cover and the briefing.</p>
        <div className="scene-tiles">
          {Object.entries(SCENES).map(([id, label]) => (
            <button key={id} type="button" className={`scene-tile ${!look.sceneImage && look.scene === id ? 'on' : ''}`} style={{ background: sceneBackground(id) }} aria-pressed={!look.sceneImage && look.scene === id} onClick={() => set({ scene: id, sceneImage: '' })}><span>{label}</span></button>
          ))}
          {look.sceneImage && <button type="button" className="scene-tile on" style={{ background: sceneBackground(null, look.sceneImage) }} aria-pressed="true"><span>Your image</span></button>}
        </div>
        <div className="row"><Upload label="Use your own photo" kind="scene" notify={notify} onDone={(u) => set({ sceneImage: u })} />{look.sceneImage && <Button size="sm" variant="ghost" onClick={() => set({ sceneImage: '' })}>Remove photo</Button>}<span className="small muted">A photo of the client's office works well. It is darkened so text stays readable.</span></div>
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>The CEO</h3>
          <div className="row nowrap" style={{ '--gap': '14px' }}>
            <Portrait name={ceo} pronoun={look.ceoPronoun || 'he'} photo={look.ceoPhoto} variant={look.portraitVariant?.ceo || 0} size={96} />
            <div className="stack" style={{ '--gap': '6px' }}>
              <strong>{ceo}</strong>
              <span className="small muted">Signs the welcome letter and sends decision moments. The name is set in Story and context.</span>
              <Seg label="CEO pronoun" value={look.ceoPronoun || 'he'} onChange={(v) => set({ ceoPronoun: v })} options={[{ value: 'he', label: 'He' }, { value: 'she', label: 'She' }, { value: 'they', label: 'They' }]} />
              <div className="row">
                {!look.ceoPhoto && <Button size="sm" variant="ghost" onClick={() => variant('ceo')}>Another look</Button>}
                <Upload label={look.ceoPhoto ? 'Replace photo' : 'Upload photo'} kind="portrait" notify={notify} onDone={(u) => set({ ceoPhoto: u })} />
                {look.ceoPhoto && <Button size="sm" variant="ghost" onClick={() => set({ ceoPhoto: '' })}>Use illustration</Button>}
              </div>
            </div>
          </div>
        </div>
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>The product</h3>
          <div className="row nowrap" style={{ '--gap': '14px' }}>
            <ProductArt kind={look.productArt} image={look.productImage} size={110} label={T('{{product}}')} />
            <div className="stack" style={{ '--gap': '6px' }}>
              <strong>{T('{{product}}')}</strong>
              <span className="small muted">Shown in the briefing and in the learner's objective.</span>
              {!look.productImage && (
                <select className="select" value={look.productArt} onChange={(e) => set({ productArt: e.target.value })} aria-label="Product illustration">
                  {Object.entries(PRODUCT_ART).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                </select>
              )}
              <div className="row"><Upload label={look.productImage ? 'Replace image' : 'Upload product image'} kind="product" notify={notify} onDone={(u) => set({ productImage: u })} />{look.productImage && <Button size="sm" variant="ghost" onClick={() => set({ productImage: '' })}>Use illustration</Button>}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card stack" style={{ '--gap': '10px' }}>
        <div className="row spread"><h3>The team</h3><Button size="sm" variant="ghost" onClick={() => update((d) => { d.look ||= defaultLook(d); const pv = { ...(d.look.portraitVariant || {}) }; for (const a of d.actors) pv[a.id] = (pv[a.id] || 0) + 1; d.look.portraitVariant = pv; })}>New looks for everyone</Button></div>
        <p className="small muted">Every person gets an illustrated portrait that matches their pronoun and stays the same all quarter. Upload photos to use real faces (with their permission, or licensed stock images).</p>
        <div className="portrait-grid">
          {[...team, ...pool].map((a) => (
            <div key={a.id} className="portrait-cell">
              <Portrait name={a.name} pronoun={a.pronoun} photo={look.photos?.[a.id]} variant={look.portraitVariant?.[a.id] || 0} size={84} shape="square" />
              <strong className="small">{a.name}</strong>
              <span className="small muted">{a.pool === 'team' ? def.stages.find((s) => s.id === a.startStage)?.name : 'Hiring pool'}</span>
              <div className="row nowrap" style={{ '--gap': '4px' }}>
                {!look.photos?.[a.id] && <Button size="sm" variant="ghost" onClick={() => variant(a.id)} aria-label={`Another look for ${a.name}`}>Another look</Button>}
                <Upload label={look.photos?.[a.id] ? 'Replace' : 'Photo'} kind="portrait" small notify={notify} onDone={(u) => setPhoto(a.id, u)} />
                {look.photos?.[a.id] && <Button size="sm" variant="ghost" onClick={() => setPhoto(a.id, '')}>Remove</Button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Callout icon="i">Images are resized before they are stored. On claude.ai they go to this simulation's asset store; elsewhere a compact copy is kept inside the simulation. SCORM packages carry every image inside the zip. The target picture <span style={{ verticalAlign: 'middle', display: 'inline-block' }}><TargetArt size={22} /></span> and trophies are built in.</Callout>
    </div>
  );
}
