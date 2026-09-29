/* Design Task Hub: fills the Task Manager workbook template with app data.
 *
 * Works at the XML level so every formula, table, dropdown and conditional
 * format in the workbook stays exactly as authored. Runs in the browser and
 * in Node (tests pass JSZip, DOMParser and XMLSerializer in).
 *
 *   const bytes = await DTHExport.build({JSZip, DOMParser, XMLSerializer}, templateBytes, data)
 */
(function (root) {
  "use strict";
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";

  // Style indices from the workbook (see tools/build_template.py)
  const S = { text: 10, wrap: 14, center: 9, date: 11, int: 12, dec1: 60 };

  const SHEETS = {
    tracker: "xl/worksheets/sheet1.xml",
    scorecard: "xl/worksheets/sheet2.xml",
    settings: "xl/worksheets/sheet3.xml",
    leave: "xl/worksheets/sheet4.xml",
    dashboard: "xl/worksheets/sheet5.xml",
    details: "xl/worksheets/sheet6.xml",
    log: "xl/worksheets/sheet7.xml",
  };

  function serial(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return null;
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function clean(v) {
    // Drop characters XML 1.0 cannot carry
    return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  }

  function colNum(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function splitRef(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    return { col: m[1], row: Number(m[2]) };
  }

  class SheetDoc {
    constructor(xml, P) {
      this.doc = new P.DOMParser().parseFromString(xml, "application/xml");
      this.P = P;
      this.sheetData = this.doc.getElementsByTagNameNS(NS, "sheetData")[0];
      this.rows = new Map();
      for (let n = this.sheetData.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1 && n.localName === "row") this.rows.set(Number(n.getAttribute("r")), n);
      }
    }
    row(r) {
      let row = this.rows.get(r);
      if (row) return row;
      row = this.doc.createElementNS(NS, "row");
      row.setAttribute("r", String(r));
      let after = null;
      for (const [k, el] of this.rows) if (k > r && (!after || k < Number(after.getAttribute("r")))) after = el;
      this.sheetData.insertBefore(row, after);
      this.rows.set(r, row);
      return row;
    }
    cell(ref) {
      const { col, row: r } = splitRef(ref);
      const row = this.row(r);
      const want = colNum(col);
      let before = null;
      for (let n = row.firstChild; n; n = n.nextSibling) {
        if (n.nodeType !== 1) continue;
        const cr = n.getAttribute("r");
        if (cr === ref) return n;
        if (colNum(splitRef(cr).col) > want) { before = n; break; }
      }
      const c = this.doc.createElementNS(NS, "c");
      c.setAttribute("r", ref);
      row.insertBefore(c, before);
      return c;
    }
    _reset(c, style) {
      while (c.firstChild) c.removeChild(c.firstChild);
      c.removeAttribute("t");
      if (style != null) c.setAttribute("s", String(style));
    }
    str(ref, text, style) {
      const c = this.cell(ref);
      this._reset(c, style);
      const t = clean(text);
      if (!t) return;
      c.setAttribute("t", "inlineStr");
      const is = this.doc.createElementNS(NS, "is");
      const tt = this.doc.createElementNS(NS, "t");
      tt.setAttributeNS(XML_NS, "xml:space", "preserve");
      tt.appendChild(this.doc.createTextNode(t));
      is.appendChild(tt);
      c.appendChild(is);
    }
    num(ref, value, style) {
      const c = this.cell(ref);
      this._reset(c, style);
      if (value === null || value === undefined || value === "" || !isFinite(Number(value))) return;
      const v = this.doc.createElementNS(NS, "v");
      v.appendChild(this.doc.createTextNode(String(Number(value))));
      c.appendChild(v);
    }
    date(ref, iso, style) { this.num(ref, serial(iso), style); }
    formula(ref, f, style) {
      const c = this.cell(ref);
      this._reset(c, style);
      const fe = this.doc.createElementNS(NS, "f");
      fe.appendChild(this.doc.createTextNode(f));
      c.appendChild(fe);
    }
    blank(ref) { this._reset(this.cell(ref)); }
    // Copy a formula row (table row with calculated columns) to row r.
    cloneRow(fromR, toR) {
      const src = this.rows.get(fromR);
      const copy = src.cloneNode(true);
      copy.setAttribute("r", String(toR));
      for (let n = copy.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) n.setAttribute("r", splitRef(n.getAttribute("r")).col + toR);
      }
      const old = this.rows.get(toR);
      if (old) this.sheetData.replaceChild(copy, old);
      else {
        let after = null;
        for (const [k, el] of this.rows) if (k > toR && (!after || k < Number(after.getAttribute("r")))) after = el;
        this.sheetData.insertBefore(copy, after);
      }
      this.rows.set(toR, copy);
    }
    setAutoFilter(ref) {
      const af = this.doc.getElementsByTagNameNS(NS, "autoFilter")[0];
      if (af) af.setAttribute("ref", ref);
    }
    setDimension(ref) {
      const d = this.doc.getElementsByTagNameNS(NS, "dimension")[0];
      if (d) d.setAttribute("ref", ref);
    }
    toString() { return new this.P.XMLSerializer().serializeToString(this.doc); }
  }

  function taskAssigned(t) {
    const tag = [t.master, t.sub].filter(Boolean).join(" / ");
    return t.title ? (tag ? tag + ": " + t.title : t.title) : tag;
  }

  function taskIdFor(i) { return "T-" + String(i + 1).padStart(3, "0"); }

  function setTableRef(xml, lastRow, lastCol) {
    return xml.replace(/(<table\b[^>]*\sref=")([A-Z]+)4:[A-Z]+\d+"/, (m, a, c1) => `${a}${c1}4:${lastCol}${lastRow}"`)
      .replace(/(<autoFilter\b[^>]*\sref=")([A-Z]+)4:[A-Z]+\d+"/, (m, a, c1) => `${a}${c1}4:${lastCol}${lastRow}"`);
  }

  async function build(P, templateBytes, data) {
    const zip = await P.JSZip.loadAsync(templateBytes);
    const read = (p) => zip.file(p).async("string");
    const cfg = data.config || {};
    const tasks = data.tasks || [];
    const leave = data.leave || [];
    const warnings = [];
    const idOf = new Map(tasks.map((t, i) => [t.id, taskIdFor(i)]));

    // ---- Tracker (tblTasks rows start at 5; template has formula rows 5-54)
    const tr = new SheetDoc(await read(SHEETS.tracker), P);
    const TASK_TEMPLATE_LAST = 54;
    const lastTaskRow = Math.max(TASK_TEMPLATE_LAST, 4 + tasks.length);
    for (let r = TASK_TEMPLATE_LAST + 1; r <= lastTaskRow; r++) tr.cloneRow(TASK_TEMPLATE_LAST, r);
    tasks.forEach((t, i) => {
      const r = 5 + i;
      tr.str("B" + r, taskAssigned(t));
      tr.str("C" + r, t.project);
      tr.str("E" + r, t.designer);
      tr.str("F" + r, t.priority);
      tr.date("G" + r, t.start);
      tr.date("H" + r, t.target);
      tr.num("I" + r, t.effort);
      tr.str("J" + r, t.status);
      tr.date("K" + r, t.actualEnd);
      tr.num("L" + r, t.revisions == null ? "" : t.revisions);
      tr.str("M" + r, t.blockers);
    });
    if (lastTaskRow > 504) tr.setDimension("A1:U" + lastTaskRow);
    zip.file(SHEETS.tracker, tr.toString());
    zip.file("xl/tables/table1.xml", setTableRef(await read("xl/tables/table1.xml"), lastTaskRow, "U"));

    // ---- Leave & Holidays (tblLeave A5:F54, tblHolidays H5:I34)
    const lv = new SheetDoc(await read(SHEETS.leave), P);
    const LEAVE_TEMPLATE_LAST = 54;
    const lastLeaveRow = Math.max(LEAVE_TEMPLATE_LAST, 4 + leave.length);
    for (let r = LEAVE_TEMPLATE_LAST + 1; r <= lastLeaveRow; r++) lv.cloneRow(LEAVE_TEMPLATE_LAST, r);
    leave.forEach((l, i) => {
      const r = 5 + i;
      lv.str("A" + r, l.designer);
      lv.date("B" + r, l.from);
      lv.date("C" + r, l.to);
      lv.str("D" + r, l.type);
      lv.str("E" + r, l.note);
    });
    const hol = (cfg.holidays || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (hol.length > 30) warnings.push(`Only the first 30 of ${hol.length} holidays fit the Holidays table.`);
    for (let i = 0; i < 30; i++) {
      const h = hol[i];
      if (h) { lv.date("H" + (5 + i), h.date); lv.str("I" + (5 + i), h.name); }
      else { lv.num("H" + (5 + i), null); lv.str("I" + (5 + i), ""); }
    }
    zip.file(SHEETS.leave, lv.toString());
    zip.file("xl/tables/table2.xml", setTableRef(await read("xl/tables/table2.xml"), lastLeaveRow, "F"));

    // ---- Settings (lists and scoring)
    const st = new SheetDoc(await read(SHEETS.settings), P);
    const list = (col, arr, max = 30) => {
      for (let i = 0; i < max; i++) st.str(col + (5 + i), arr[i] || "");
    };
    const designers = cfg.designers || [];
    const pms = cfg.pms || [];
    const projects = cfg.projects || [];
    if (designers.length > 5) warnings.push("The Scorecard and Dashboard show the first 5 designers; the rest are still in the Tracker.");
    if (projects.length > 30) warnings.push("Settings holds 30 projects; extra projects show as \"Not mapped\".");
    list("A", designers);
    list("B", pms);
    list("F", projects.map((p) => p.name));
    list("G", projects.map((p) => p.lead));
    const sc = cfg.scoring || {};
    const num = (ref, v) => { if (v !== undefined && v !== null && v !== "") st.num(ref, v); };
    num("J5", sc.speedWeight); num("J6", sc.qualityWeight); num("J7", sc.commitmentWeight);
    num("J9", sc.revisionZero); num("J10", sc.excellent); num("J11", sc.good); num("J12", sc.needsImprovement);
    num("J16", sc.weeklyHours); num("J17", sc.daysPerWeek); num("J20", sc.overloadAbove); num("J21", sc.underBelow);
    zip.file(SHEETS.settings, st.toString());

    // ---- Scorecard period
    if (data.period && data.period.from && data.period.to) {
      const scd = new SheetDoc(await read(SHEETS.scorecard), P);
      scd.date("B4", data.period.from);
      scd.date("B5", data.period.to);
      zip.file(SHEETS.scorecard, scd.toString());
    }

    // ---- Task Details (row r matches Tracker row r)
    const td = new SheetDoc(await read(SHEETS.details), P);
    tasks.forEach((t, i) => {
      const r = 5 + i;
      const ups = (t.updates || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
      const last = ups[ups.length - 1];
      const hours = ups.reduce((s, u) => s + (Number(u.hours) || 0), 0);
      td.formula("A" + r, `IF(Tracker!A${r}="","",Tracker!A${r})`, S.center);
      td.str("B" + r, t.master, S.text);
      td.str("C" + r, t.sub, S.text);
      td.str("D" + r, t.title, S.wrap);
      td.formula("E" + r, `IF(Tracker!C${r}="","",Tracker!C${r})`, S.text);
      td.formula("F" + r, `IF(Tracker!E${r}="","",Tracker!E${r})`, S.center);
      td.formula("G" + r, `IF(Tracker!J${r}="","",Tracker!J${r})`, S.center);
      td.formula("H" + r, `IF(Tracker!Q${r}="","",Tracker!Q${r})`, S.center);
      td.formula("I" + r, `IF(Tracker!I${r}="","",Tracker!I${r})`, S.dec1);
      td.num("J" + r, t.progress == null ? "" : t.progress, S.int);
      td.num("K" + r, Math.round(hours * 100) / 100, S.dec1);
      td.date("L" + r, last ? last.d : null, S.date);
      td.str("M" + r, last ? last.note : "", S.wrap);
      td.str("N" + r, t.assignedBy, S.center);
      td.date("O" + r, t.createdAt, S.date);
      td.str("P" + r, t.brief, S.wrap);
    });
    const lastTd = 4 + Math.max(1, tasks.length);
    td.setAutoFilter("A4:P" + lastTd);
    td.setDimension("A1:P" + lastTd);
    zip.file(SHEETS.details, td.toString());

    // ---- Daily Log
    const lg = new SheetDoc(await read(SHEETS.log), P);
    const logRows = [];
    tasks.forEach((t) => (t.updates || []).forEach((u) => logRows.push({ t, u })));
    logRows.sort((a, b) => (a.u.d === b.u.d ? (idOf.get(a.t.id) < idOf.get(b.t.id) ? -1 : 1) : a.u.d < b.u.d ? -1 : 1));
    logRows.forEach(({ t, u }, i) => {
      const r = 5 + i;
      lg.date("A" + r, u.d, S.date);
      lg.str("B" + r, idOf.get(t.id), S.center);
      lg.str("C" + r, t.designer, S.center);
      lg.str("D" + r, t.master, S.text);
      lg.str("E" + r, t.sub, S.text);
      lg.num("F" + r, u.hours, S.dec1);
      lg.num("G" + r, u.progress, S.int);
      lg.str("H" + r, u.status, S.center);
      lg.str("I" + r, u.note, S.wrap);
      lg.str("J" + r, u.blocker, S.wrap);
    });
    const lastLg = 4 + Math.max(1, logRows.length);
    lg.setAutoFilter("A4:J" + lastLg);
    lg.setDimension("A1:J" + lastLg);
    zip.file(SHEETS.log, lg.toString());

    // ---- Dashboard: product tag list, then trim chart ranges to real counts
    const ds = new SheetDoc(await read(SHEETS.dashboard), P);
    const tags = cfg.masterTags || [];
    if (tags.length > 15) warnings.push("The Dashboard charts the first 15 products / master tasks.");
    for (let i = 0; i < 15; i++) {
      ds.str("A" + (98 + i), tags[i] ? tags[i].name : "", S.text);
      ds.str("B" + (98 + i), tags[i] ? tags[i].group || "" : "", S.text);
    }
    zip.file(SHEETS.dashboard, ds.toString());

    const nDes = Math.max(1, Math.min(5, designers.length));
    const nTag = Math.max(1, Math.min(15, tags.length));
    const nPrj = Math.max(1, Math.min(30, projects.length));
    const trim = (xml, lastTemplateRow, lastRow) =>
      xml.replace(new RegExp("\\$([A-Z]+)\\$" + lastTemplateRow + "(?!\\d)", "g"), (m, c) => `$${c}$${lastRow}`);
    const chart = async (i, fn) => {
      const p = `xl/charts/chart${i}.xml`;
      zip.file(p, fn(await read(p)));
    };
    await chart(1, (x) => trim(x, 72, 67 + nDes));
    await chart(2, (x) => trim(x, 72, 67 + nDes));
    await chart(4, (x) => x.replace(/<c:ser><c:idx val="(\d+)"\/>[\s\S]*?<\/c:ser>/g, (m, idx) => (Number(idx) < nDes ? m : "")));
    await chart(5, (x) => trim(x, 112, 97 + nTag));
    await chart(6, (x) => trim(x, 145, 115 + nPrj));

    // ---- Designer copy: hide owner-only sheets and lock the sheet list
    if (data.designerCopy) {
      let wb = await read("xl/workbook.xml");
      for (const name of ["Scorecard", "Settings", "Dashboard", "Task Details", "Daily Log"]) {
        wb = wb.replace(`<sheet name="${name}" `, `<sheet name="${name}" state="hidden" `);
      }
      wb = wb.replace(/<bookViews>/, '<workbookProtection lockStructure="1"/><bookViews>');
      zip.file("xl/workbook.xml", wb);
    }

    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return { bytes, warnings };
  }

  const api = { build, serial, taskAssigned, taskIdFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DTHExport = api;
})(typeof self !== "undefined" ? self : this);
