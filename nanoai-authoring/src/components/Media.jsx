import React, { useState } from 'react';
import { Button, Field, Input, Textarea, Select } from './ui.jsx';
import { RULES } from '../content/rules.js';
import { wordCount } from '../engine/text.js';

const COLORS = ['#3ddc6f', '#38bdf8'];

export function Chart({ media, compact }) {
  const { points = [], series = [] } = media.data || {};
  const W = compact ? 360 : 560, H = compact ? 200 : 260, padL = 44, padB = 34, padT = 16, padR = 12;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 0), min = Math.min(...all, 0);
  const range = max - min || 1;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1);
  const y = (v) => padT + ((max - v) * (H - padT - padB)) / range;
  const bar = series.length === 1 && points.length <= 6;
  const bw = (W - padL - padR) / Math.max(1, points.length) * 0.6;
  const ticks = [min, min + range / 2, max];
  return (
    <figure className="card overflow-hidden p-3">
      <figcaption className="mb-1 text-sm font-medium">{media.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={media.alt}>
        {ticks.map((t, i) => <g key={i}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#2c2f32" /><text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#949b97">{Math.round(t * 10) / 10}</text></g>)}
        {points.map((p, i) => <text key={p} x={bar ? padL + (i + 0.5) * ((W - padL - padR) / points.length) : x(i)} y={H - 12} fontSize="11" textAnchor="middle" fill="#bac1bd">{p}</text>)}
        {series.map((s, si) => bar
          ? s.values.map((v, i) => { const cx = padL + (i + 0.5) * ((W - padL - padR) / points.length); return <g key={i}><rect x={cx - bw / 2} y={y(Math.max(v, 0))} width={bw} height={Math.abs(y(v) - y(0))} fill={COLORS[si]} rx="3" /><text x={cx} y={y(Math.max(v, 0)) - 4} fontSize="10" textAnchor="middle" fill="#f3f5f4">{v}</text></g>; })
          : <g key={s.name}><polyline fill="none" stroke={COLORS[si]} strokeWidth="2.5" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />{s.values.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(v)} r="3.5" fill={COLORS[si]} /><text x={x(i)} y={y(v) - 7} fontSize="10" textAnchor="middle" fill="#f3f5f4">{v}</text></g>)}</g>)}
        {series.length > 1 && series.map((s, si) => <g key={s.name}><rect x={padL + si * 150} y={2} width="10" height="10" fill={COLORS[si]} /><text x={padL + si * 150 + 14} y={11} fontSize="10" fill="#bac1bd">{s.name}</text></g>)}
      </svg>
      <details className="mt-1"><summary className="faint cursor-pointer text-xs">Data table alternative</summary><Table media={{ data: { columns: ['Point', ...series.map((s) => s.name)], rows: points.map((p, i) => [p, ...series.map((s) => String(s.values[i]))]) } }} /></details>
    </figure>
  );
}

export function Table({ media }) {
  const { columns = [], rows = [] } = media.data || {};
  return (
    <figure className="card overflow-x-auto p-3">
      {media.title && <figcaption className="mb-2 text-sm font-medium">{media.title}</figcaption>}
      <table className="w-full text-sm" aria-label={media.alt || media.title}>
        <thead><tr>{columns.map((c) => <th key={c} className="border-b border-[var(--line)] px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="odd:bg-[var(--card-2)]">{r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}

export function MediaView({ media, compact }) {
  if (!media) return null;
  if (media.type === 'chart') return <Chart media={media} compact={compact} />;
  if (media.type === 'table') return <Table media={media} />;
  if (media.type === 'image') return <figure className="card overflow-hidden p-2"><img src={media.src} alt={media.alt} className="max-h-72 w-full rounded object-contain" />{media.title && <figcaption className="muted mt-1 text-xs">{media.title}</figcaption>}</figure>;
  if (media.type === 'document') return <figure className="card border-l-4 border-l-[var(--brand)] p-3 text-sm"><figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">{media.title || 'Document extract'}</figcaption><div className="whitespace-pre-wrap">{media.text}</div></figure>;
  return null;
}

function parseSeries(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const series = [];
  for (const l of lines) { const [name, rest] = l.split(':'); if (!rest) continue; const values = rest.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n)); if (values.length) series.push({ name: name.trim(), values }); }
  return series;
}

// Author attaches or generates one media object. Charts and tables render from data the platform holds.
export function MediaEditor({ media, onChange, onRemove, onClose }) {
  const [type, setType] = useState(media?.type || 'chart');
  const [title, setTitle] = useState(media?.title || '');
  const [alt, setAlt] = useState(media?.alt || '');
  const [points, setPoints] = useState(media?.type === 'chart' ? media.data.points.join(', ') : 'Q1, Q2, Q3, Q4');
  const [seriesText, setSeriesText] = useState(media?.type === 'chart' ? media.data.series.map((s) => `${s.name}: ${s.values.join(', ')}`).join('\n') : 'Revenue: 12, 14, 13, 17');
  const [tableText, setTableText] = useState(media?.type === 'table' ? [media.data.columns.join(' | '), ...media.data.rows.map((r) => r.join(' | '))].join('\n') : 'Option | Cost | Time\nA | 12,000 | 3 weeks\nB | 8,000 | 6 weeks');
  const [docText, setDocText] = useState(media?.type === 'document' ? media.text : '');
  const [img, setImg] = useState(media?.type === 'image' ? { src: media.src, bytes: media.bytes, name: media.name } : null);
  const [error, setError] = useState('');

  const build = () => {
    setError('');
    if (!alt.trim()) return setError('Add an accessible alternative: what a participant must take from the media.');
    if (type === 'chart') {
      const pts = points.split(/[,\n]+/).map((p) => p.trim()).filter(Boolean);
      const series = parseSeries(seriesText);
      if (!series.length) return setError('Enter at least one series as "Name: 1, 2, 3".');
      if (series.length > RULES.media.chartMaxSeries) return setError('Keep to 2 series so the chart reads on a phone.');
      if (pts.length > RULES.media.chartMaxPoints) return setError('Keep to 8 points so the chart reads on a phone.');
      if (series.some((s) => s.values.length !== pts.length)) return setError('Each series needs one value per point.');
      return onChange({ type, title, alt, data: { points: pts, series }, source: 'Generated by the platform from numbers you entered', referencedInSituation: false });
    }
    if (type === 'table') {
      const lines = tableText.split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((r) => r.some(Boolean));
      if (lines.length < 2) return setError('Enter a header row and at least one data row, separated by |.');
      const [columns, ...rows] = lines;
      if (rows.length > RULES.media.tableMaxRows || columns.length > RULES.media.tableMaxCols) return setError('Keep the table to 6 rows by 5 columns.');
      return onChange({ type, title, alt, data: { columns, rows }, source: 'Generated by the platform from numbers you entered', referencedInSituation: false });
    }
    if (type === 'document') {
      if (wordCount(docText) > RULES.media.docExtractWordsMax) return setError('Keep the extract under 150 words.');
      if (!docText.trim()) return setError('Paste the extract text.');
      return onChange({ type, title, alt, text: docText, source: 'Supplied by the author', referencedInSituation: false });
    }
    if (type === 'image') {
      if (!img) return setError('Upload a PNG, JPG or WebP under 2 MB.');
      if (img.bytes > RULES.media.imageMaxBytes) return setError('The image is above 2 MB.');
      return onChange({ type, title, alt, src: img.src, bytes: img.bytes, name: img.name, source: 'Uploaded by the author', confidential: false, referencedInSituation: false });
    }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!/image\/(png|jpeg|webp)/.test(f.type)) return setError('Use PNG, JPG or WebP.');
    const r = new FileReader(); r.onload = () => setImg({ src: r.result, bytes: f.size, name: f.name }); r.readAsDataURL(f);
  };
  return (
    <div className="space-y-3">
      <p className="muted text-sm">Media is never illustrative. If the scenario reads the same without it, leave it out. The contextual analysis reads charts and tables as data.</p>
      <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}><option value="chart">Chart (from numbers)</option><option value="table">Table</option><option value="image">Image</option><option value="document">Document extract (email, policy, chat)</option></Select></Field>
      <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quarter to date attainment by territory" /></Field>
      {type === 'chart' && <><Field label="Point labels" hint="up to 8, comma separated"><Input value={points} onChange={(e) => setPoints(e.target.value)} /></Field><Field label="Series" hint="one per line as Name: values; up to 2"><Textarea value={seriesText} onChange={(e) => setSeriesText(e.target.value)} /></Field></>}
      {type === 'table' && <Field label="Rows" hint="header first, cells separated by |; max 6 by 5"><Textarea value={tableText} onChange={(e) => setTableText(e.target.value)} className="font-mono text-xs" /></Field>}
      {type === 'document' && <Field label="Extract" hint="under 150 words"><Textarea value={docText} onChange={(e) => setDocText(e.target.value)} /></Field>}
      {type === 'image' && <Field label="File" hint="PNG, JPG or WebP under 2 MB; no faces of real people unless licensed"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="text-sm" />{img && <img src={img.src} alt="" className="mt-2 max-h-40 rounded" />}</Field>}
      <Field label="Accessible alternative" required hint="the information a participant needs to answer, in words"><Textarea value={alt} onChange={(e) => setAlt(e.target.value)} className="min-h-[60px]" /></Field>
      {error && <p className="text-sm text-[var(--block)]">{error}</p>}
      <div className="flex justify-between">
        <div>{media && <Button variant="danger" size="sm" onClick={onRemove}>Remove media</Button>}</div>
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={build}>{media ? 'Replace media' : 'Add media'}</Button></div>
      </div>
    </div>
  );
}
