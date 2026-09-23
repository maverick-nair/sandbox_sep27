// Upload ingestion (PRD 9.1 Step 1). Text is extracted in the browser and stays in the workspace.
// TXT, MD, CSV, JSON read directly; DOCX, PPTX, XLSX are unzipped and their XML text pulled; PDF via pdf.js.
import JSZip from 'jszip';

const MAX_CHARS = 120000;

function xmlText(xml, tagRe) {
  const out = [];
  for (const m of xml.matchAll(tagRe)) out.push(m[1]);
  return out.join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
}

async function readDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('No document body found');
  return doc.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
}
async function readPptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const parts = [];
  for (const s of slides) { const xml = await zip.file(s).async('string'); parts.push(`Slide ${s.match(/\d+/)[0]}: ${xmlText(xml, /<a:t>([^<]*)<\/a:t>/g)}`); }
  return parts.join('\n\n');
}
async function readXlsx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = ssXml ? [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')) : [];
  const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort();
  const parts = [];
  for (const s of sheets) {
    const xml = await zip.file(s).async('string');
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const v = (c[2].match(/<v>([^<]*)<\/v>/) || [])[1];
        const inline = (c[2].match(/<t[^>]*>([^<]*)<\/t>/) || [])[1];
        if (/t="s"/.test(c[1]) && v != null) cells.push(shared[Number(v)] || '');
        else cells.push(inline ?? v ?? '');
      }
      if (cells.some((x) => x !== '')) rows.push(cells.join(' | '));
    }
    parts.push(`Sheet ${s.match(/\d+/)[0]}:\n${rows.join('\n')}`);
  }
  return parts.join('\n\n');
}
async function readPdf(buf) {
  const pdfjs = await import('pdfjs-dist');
  // The worker is served from the CDN pinned to the installed version, so the app bundle stays small.
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(`Page ${i}: ${content.items.map((it) => it.str).join(' ')}`);
  }
  return parts.join('\n\n');
}

export const ACCEPTED = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.json';

export async function extractText(file) {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop();
  let text = '';
  if (['txt', 'md', 'csv', 'json'].includes(ext)) text = await file.text();
  else {
    const buf = await file.arrayBuffer();
    if (ext === 'docx') text = await readDocx(buf);
    else if (ext === 'pptx') text = await readPptx(buf);
    else if (ext === 'xlsx') text = await readXlsx(buf);
    else if (ext === 'pdf') text = await readPdf(buf);
    else throw new Error(`Unsupported file type .${ext}. Accepted: PDF, DOCX, PPTX, XLSX, TXT.`);
  }
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated, chars: text.length, type: ext };
}
