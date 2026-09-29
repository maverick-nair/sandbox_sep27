// Look and feel: how the simulation looks to learners. The background behind every screen, the
// brand colour and logo, the product, and a face for every character: the CEO, anyone else who
// sends the learner a message, the team and the hiring pool. Everything starts illustrated;
// the author can replace any of it with their own images, one at a time or several at once.
import { useRef, useState } from 'react';
import { renderText } from '../../engine/text.js';
import { Portrait, ProductArt, PRODUCT_ART, SCENES, sceneBackground, Logo, TargetArt } from '../../learner/art.jsx';
import { npcsOf } from '../../learner/look.jsx';
import { shellBackground } from '../../learner/Shell.jsx';
import { defaultLook } from '../../templates/ilead/look.js';
import { addImage, matchPerson } from '../images.js';
import { Button, Callout, Field, SectionHead, Seg } from '../ui.jsx';

function Upload({ label, kind, onDone, notify, small, variant, multiple, onMany }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple={multiple} className="sr-only" aria-label={label} onChange={async (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = '';
        if (!files.length) return;
        setBusy(true);
        try {
          if (onMany) await onMany(files);
          else { const r = await addImage(files[0], kind); onDone(r.url); notify(r.where === 'hosted' ? 'Image uploaded' : 'Image added'); }
        } catch (err) { notify(err.message); }
        setBusy(false);
      }} />
      <Button size="sm" variant={variant || (small ? 'ghost' : undefined)} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Adding…' : label}</Button>
    </>
  );
}

export default function Look({ def, update, notify, openPanel }) {
  const look = { ...defaultLook(def), ...(def.look || {}) };
  const set = (patch) => update((d) => { d.look = { ...defaultLook(d), ...(d.look || {}), ...patch }; });
  const setPhoto = (id, url) => update((d) => {
    d.look ||= defaultLook(d);
    d.look.photos = { ...(d.look.photos || {}) };
    if (url) d.look.photos[id] = url; else delete d.look.photos[id];
    if (id === 'ceo') d.look.ceoPhoto = url || '';
  });
  const setPronoun = (id, v) => update((d) => { d.look ||= defaultLook(d); d.look.pronouns = { ...(d.look.pronouns || {}), [id]: v }; if (id === 'ceo') d.look.ceoPronoun = v; });
  const variant = (id) => update((d) => { d.look ||= defaultLook(d); d.look.portraitVariant = { ...(d.look.portraitVariant || {}), [id]: ((d.look.portraitVariant || {})[id] || 0) + 1 }; });
  const T = (x) => renderText(def, x);
  const npcs = npcsOf(def);
  const team = def.actors.filter((a) => a.pool === 'team');
  const pool = def.actors.filter((a) => a.pool !== 'team');
  const stage = (a) => def.stages.find((s) => s.id === a.startStage)?.name;
  const everyone = [
    ...npcs.map((n) => ({ id: n.id, name: n.name, role: n.role, pronoun: n.pronoun, photo: n.photo, group: 'npc' })),
    ...team.map((a) => ({ id: a.id, name: a.name, role: stage(a), pronoun: a.pronoun, photo: look.photos?.[a.id], group: 'team' })),
    ...pool.map((a) => ({ id: a.id, name: a.name, role: 'Hiring pool', pronoun: a.pronoun, photo: look.photos?.[a.id], group: 'pool' })),
  ];
  const withPhotos = everyone.filter((p) => p.photo).length;

  const bulk = async (files) => {
    const matched = [];
    const missed = [];
    for (const f of files) {
      const p = matchPerson(f.name, everyone);
      if (!p) { missed.push(f.name); continue; }
      const r = await addImage(f, 'portrait');
      setPhoto(p.id, r.url);
      matched.push(p.name);
    }
    notify(`${matched.length} photo${matched.length === 1 ? '' : 's'} added${matched.length ? ` (${matched.slice(0, 4).join(', ')}${matched.length > 4 ? '…' : ''})` : ''}.${missed.length ? ` Not matched: ${missed.slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''}. Name files after the person, for example kent-goldberg.jpg.` : ''}`);
  };

  const Cell = ({ p, big }) => (
    <div className={`portrait-cell ${big ? 'big' : ''}`}>
      <Portrait name={p.name} pronoun={p.pronoun} photo={p.photo} variant={look.portraitVariant?.[p.id] || 0} size={big ? 112 : 84} shape="square" />
      <strong className="small">{p.name}</strong>
      <span className="small muted">{p.role}</span>
      {p.group === 'npc' && !p.photo && (
        <select className="select xs" value={p.pronoun} onChange={(e) => setPronoun(p.id, e.target.value)} aria-label={`Pronoun for ${p.name}`}>
          <option value="he">He</option><option value="she">She</option><option value="they">They</option>
        </select>
      )}
      <div className="row nowrap" style={{ '--gap': '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Upload label={p.photo ? 'Replace photo' : 'Upload photo'} kind="portrait" small={!big} notify={notify} onDone={(u) => setPhoto(p.id, u)} />
        {p.photo ? <Button size="sm" variant="ghost" onClick={() => setPhoto(p.id, '')}>Remove</Button> : <Button size="sm" variant="ghost" onClick={() => variant(p.id)} aria-label={`Another look for ${p.name}`}>Another look</Button>}
      </div>
    </div>
  );

  const bgUrl = look.sceneImage;
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <SectionHead eyebrow="Build" title="Look and feel" actions={<Button onClick={() => openPanel('preview')}>Preview as a learner</Button>}>
        How the simulation looks: the background behind every screen, the organization's brand and logo, the product, and a face for every character learners meet. Everything starts illustrated; replace any of it with your client's own images.
      </SectionHead>

      <div className="look-shell-preview" style={{ background: shellBackground(look), '--nx-accent': look.brand }}>
        <div className="lsp-side"><Logo def={def} look={look} size={28} /><span /><span /><span /></div>
        <div className="lsp-main">
          <div className="lsp-top" />
          <div className="lsp-hero">
            <div className="lsp-text"><span className="lsp-kicker">Welcome on board</span><strong>{T('Welcome to {{company}}.')}</strong><span className="lsp-btn" style={{ background: look.brand }}>Next: About Product</span></div>
            <div className="lsp-figure"><Portrait name={npcs[0]?.name} pronoun={npcs[0]?.pronoun} photo={npcs[0]?.photo} variant={look.portraitVariant?.ceo || 0} size={150} bare /></div>
            <div className="lsp-cards"><span /><span /><span /></div>
          </div>
        </div>
      </div>

      <div className="card stack" style={{ '--gap': '12px' }}>
        <h3>Simulation background</h3>
        <p className="small muted">Shown behind every learner screen: the briefing, the workspace and the debrief. It is darkened so text stays readable. A photo of the client's office, reception or showroom works well.</p>
        <div className="scene-tiles">
          {Object.entries(SCENES).map(([id, label]) => (
            <button key={id} type="button" className={`scene-tile ${!bgUrl && look.bgMode !== 'plain' && look.scene === id ? 'on' : ''}`} style={{ background: sceneBackground(id) }} aria-pressed={!bgUrl && look.bgMode !== 'plain' && look.scene === id} onClick={() => set({ scene: id, sceneImage: '', bgMode: 'scene' })}><span>{label}</span></button>
          ))}
          {bgUrl && <button type="button" className={`scene-tile ${look.bgMode !== 'plain' ? 'on' : ''}`} style={{ background: `url("${bgUrl}") center / cover` }} aria-pressed={look.bgMode !== 'plain'} onClick={() => set({ bgMode: 'scene' })}><span>Your image</span></button>}
          <button type="button" className={`scene-tile plain ${look.bgMode === 'plain' ? 'on' : ''}`} aria-pressed={look.bgMode === 'plain'} onClick={() => set({ bgMode: 'plain' })}><span>None</span></button>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <Upload label={bgUrl ? 'Replace background image' : 'Upload a background image'} kind="scene" variant="primary" notify={notify} onDone={(u) => set({ sceneImage: u, bgMode: 'scene' })} />
          {bgUrl && <Button size="sm" variant="ghost" onClick={() => set({ sceneImage: '' })}>Remove image</Button>}
          <label className="row nowrap small" style={{ '--gap': '8px' }}>Darkness
            <input type="range" min="50" max="95" value={Math.round((look.bgDim ?? 0.84) * 100)} onChange={(e) => set({ bgDim: Number(e.target.value) / 100 })} aria-label="Background darkness" />
            <span className="num">{Math.round((look.bgDim ?? 0.84) * 100)}%</span>
          </label>
        </div>
      </div>

      <div className="card stack" style={{ '--gap': '12px' }}>
        <div className="row spread">
          <div>
            <h3>Characters</h3>
            <p className="small muted">Every person learners meet. Photos show on the welcome letter, in the spotlight, the inbox, conversations, meetings and the team floor. {withPhotos} of {everyone.length} have a photo.</p>
          </div>
          <div className="row nowrap">
            <Upload label="Upload several photos" multiple variant="primary" notify={notify} onMany={bulk} />
            <Button size="sm" variant="ghost" onClick={() => update((d) => { d.look ||= defaultLook(d); const pv = { ...(d.look.portraitVariant || {}) }; for (const p of everyone) pv[p.id] = (pv[p.id] || 0) + 1; d.look.portraitVariant = pv; })}>New illustrations for everyone</Button>
          </div>
        </div>
        <p className="small muted">For several at once, name each file after the person (kent-goldberg.jpg, or kent.jpg when the first name is unique). Use photos you have permission to use, or licensed stock images. Portraits are cropped square from the centre.</p>
        <h4 className="look-group">Leadership and other contacts</h4>
        <div className="portrait-grid">{everyone.filter((p) => p.group === 'npc').map((p) => <Cell key={p.id} p={p} big />)}</div>
        <h4 className="look-group">Your team</h4>
        <div className="portrait-grid">{everyone.filter((p) => p.group === 'team').map((p) => <Cell key={p.id} p={p} />)}</div>
        {pool.length > 0 && (
          <>
            <h4 className="look-group">Hiring pool</h4>
            <div className="portrait-grid">{everyone.filter((p) => p.group === 'pool').map((p) => <Cell key={p.id} p={p} />)}</div>
          </>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card stack" style={{ '--gap': '12px' }}>
          <h3>Brand</h3>
          <Field label="Brand colour" hint="The accent for buttons, highlights and progress learners see.">
            <div className="row nowrap"><input type="color" value={look.brand} onChange={(e) => set({ brand: e.target.value })} aria-label="Brand colour" className="color-input" /><code className="small">{look.brand}</code></div>
          </Field>
          <Field label="Logo">
            <div className="row nowrap"><Logo def={def} look={look} size={40} /><Upload label={look.logo ? 'Replace logo' : 'Upload logo'} kind="logo" notify={notify} onDone={(u) => set({ logo: u })} />{look.logo && <Button size="sm" variant="ghost" onClick={() => set({ logo: '' })}>Remove</Button>}</div>
          </Field>
        </div>
        <div className="card stack" style={{ '--gap': '10px' }}>
          <h3>The product</h3>
          <div className="row nowrap" style={{ '--gap': '14px' }}>
            <ProductArt kind={look.productArt} image={look.productImage} size={110} label={T('{{product}}')} />
            <div className="stack" style={{ '--gap': '6px' }}>
              <strong>{T('{{product}}')}</strong>
              <span className="small muted">Shown large on About Product and in the objective.</span>
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
      <Callout icon="i">Images are resized before they are stored. On claude.ai they go to this simulation's asset store; elsewhere a compact copy is kept inside the simulation. SCORM packages carry every image inside the zip. The target picture <span style={{ verticalAlign: 'middle', display: 'inline-block' }}><TargetArt size={22} /></span> and trophies are built in.</Callout>
    </div>
  );
}
