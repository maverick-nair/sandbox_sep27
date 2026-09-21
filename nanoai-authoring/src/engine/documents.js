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
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
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

// Scripted situation extraction: paragraphs that describe an event or a decision. The LLM path in
// generator.js does this properly; this keeps the flow working offline.
const CUES = /\b(customer|client|complain|escalat|deadline|miss|delay|refus|dispute|conflict|error|incident|late|fail|angry|frustrat|request|approve|budget|target|behind|ahead|report|manager|team|decid|risk|policy|breach|discount|churn|refund|handover|resign|absent|feedback|priorit|urgent)\w*/gi;
export function extractSituations(text = '', source = 'upload') {
  const paras = text.split(/\n{1,}|(?<=[.!?])\s{2,}/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 25);
  const scored = paras.map((p, i) => ({ id: `sit_${i}`, text: p.length > 700 ? `${p.slice(0, 700)}…` : p, cues: (p.match(CUES) || []).length, source })).filter((p) => p.cues >= 3).sort((a, b) => b.cues - a.cues).slice(0, 12);
  const roles = [...new Set((text.match(/\b(?:account manager|team lead|regional manager|store manager|branch manager|sales manager|supervisor|analyst|engineer|nurse|agent|consultant|head of \w+|director|vp|officer|associate|executive|representative)\b/gi) || []).map((r) => r.toLowerCase()))].slice(0, 8);
  const terms = [...new Set((text.match(/\b[A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+){0,2}\b/g) || []).filter((t) => t.length > 3 && !/^(The|This|That|Page|Slide|Sheet|When|What|Where|Who|How|Why|And|But|For|With|From|Our|Your)\b/.test(t)))].slice(0, 12);
  const decisions = paras.filter((p) => /\b(should|decide|whether|option|choose|either|or not|trade.?off)\b/i.test(p)).slice(0, 5).map((p) => p.slice(0, 200));
  return { situations: scored, roles, terms, decisions, noUsableSituations: scored.length === 0 && text.trim().length > 0 };
}
