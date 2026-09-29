"""Build the export template used by Design Task Hub.

Takes the original "Product Designer Task Manager" workbook and adds five
sheets without touching the existing four (Tracker, Scorecard, Settings,
Leave & Holidays), their formulas, tables, dropdowns or formatting:

  Dashboard     KPI tiles, six native Excel charts, and the formula tables
                behind them (all driven by the existing tables and sheets)
  Task Details  master task / subtask tags, progress and hours per Tracker row
  Daily Log     one row per designer daily update
  Task Funnel   every PM request, one row per subtask, with the owner decision
  Deliverables  one row per item inside a batch task (each video of a set)

The workbook is edited at the XML level (no openpyxl round trip) so the
x14 dropdown validations, dynamic-array metadata and table definitions of
the original survive byte for byte.

Usage: python build_template.py <original.xlsx> <template.xlsx>
"""
import re
import sys
import zipfile
from xml.sax.saxutils import escape

SRC, DST = sys.argv[1], sys.argv[2]

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

# Existing cellXfs indices in the original styles.xml (reused so the new
# sheets look like the rest of the workbook).
S_TITLE, S_NOTE, S_HEAD, S_HEAD_GREY, S_HEAD_TEAL = 4, 3, 5, 6, 33
S_CENTER, S_TEXT, S_WRAP, S_DATE, S_INT, S_DEC1, S_PCT = 9, 10, 14, 11, 12, 60, 18
S_SECTION = 35  # bold

# Palette (validated categorical order from the app's chart palette)
# KNOLSKAPE brand steps, validated for colour-blind separation in this order
BLUE, ORANGE, AQUA, YELLOW, MAGENTA = "0337D8", "E86A00", "7E9CF0", "C12400", "8A9A1A"
GOOD, WARN, SERIOUS, CRIT, GREY, NAVY = "5E8C00", "FBD300", "E85C24", "C12400", "A6A6A6", "111827"


def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


class Sheet:
    def __init__(self):
        self.cells = {}
        self.heights = {}
        self.merges = []

    def f(self, ref, formula, style=S_CENTER):
        self.cells[ref] = ("f", formula, style)

    def s(self, ref, text, style=S_TEXT):
        self.cells[ref] = ("s", text, style)

    def n(self, ref, num, style=S_CENTER):
        self.cells[ref] = ("n", num, style)

    def blank(self, ref, style):
        self.cells[ref] = ("b", None, style)

    def xml(self, cols, extra_before_margins="", tail="", sheet_view="", dim="A1", fit_width=False):
        rows = {}
        for ref, v in self.cells.items():
            m = re.match(r"([A-Z]+)(\d+)$", ref)
            c, r = m.group(1), int(m.group(2))
            cn = 0
            for ch in c:
                cn = cn * 26 + ord(ch) - 64
            rows.setdefault(r, []).append((cn, ref, v))
        out = []
        for r in sorted(rows):
            ht = self.heights.get(r)
            attrs = f' ht="{ht}" customHeight="1"' if ht else ""
            out.append(f'<row r="{r}"{attrs}>')
            for _, ref, (kind, val, st) in sorted(rows[r]):
                if kind == "f":
                    out.append(f'<c r="{ref}" s="{st}"><f>{escape(val)}</f></c>')
                elif kind == "s":
                    out.append(f'<c r="{ref}" s="{st}" t="inlineStr"><is><t xml:space="preserve">{escape(val)}</t></is></c>')
                elif kind == "n":
                    out.append(f'<c r="{ref}" s="{st}"><v>{val}</v></c>')
                else:
                    out.append(f'<c r="{ref}" s="{st}"/>')
            out.append("</row>")
        cols_xml = "".join(
            f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i, w in cols
        )
        merges = ""
        if self.merges:
            merges = f'<mergeCells count="{len(self.merges)}">' + "".join(
                f'<mergeCell ref="{m}"/>' for m in self.merges) + "</mergeCells>"
        return (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<worksheet xmlns="{MAIN_NS}" xmlns:r="{REL_NS}">'
            + ('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' if fit_width else "")
            + f'<dimension ref="{dim}"/>'
            f"<sheetViews>{sheet_view}</sheetViews>"
            '<sheetFormatPr baseColWidth="10" defaultRowHeight="16"/>'
            f"<cols>{cols_xml}</cols><sheetData>{''.join(out)}</sheetData>"
            f"{merges}{extra_before_margins}"
            '<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
            + ('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' if fit_width else "")
            + f"{tail}</worksheet>"
        )


# ---------------------------------------------------------------- Dashboard
# Row map (the export code in the app trims chart ranges to these anchors).
DES_HEAD, DES_FIRST, DES_N = 67, 68, 5         # designers (Scorecard supports 5)
ST_HEAD, ST_FIRST = 75, 76                     # delivery status
WK_HEAD, WK_FIRST, WK_N = 85, 86, 8            # weekly hours
TAG_HEAD, TAG_FIRST, TAG_N = 97, 98, 15        # product tags
PRJ_HEAD, PRJ_FIRST, PRJ_N = 115, 116, 30      # projects
STATUSES = ["Done On Time", "Done Late", "On Track", "Scheduled", "Overdue", "Blocked", "Not Scheduled"]
STATUS_COLORS = [GOOD, SERIOUS, BLUE, "86B6EF", CRIT, WARN, GREY]

PERIOD_IN = "'Daily Log'!$A:$A,\">=\"&Scorecard!$B$4,'Daily Log'!$A:$A,\"<=\"&Scorecard!$B$5"

d = Sheet()
d.s("A1", "Performance Dashboard", S_TITLE)
d.f("A2", '="Live from the Tracker, Scorecard, Task Details and Daily Log. Period "&TEXT(Scorecard!B4,"dd-mmm-yyyy")&" to "&TEXT(Scorecard!B5,"dd-mmm-yyyy")&" (set on the Scorecard). Charts refresh when the workbook recalculates."', S_NOTE)
d.heights[5] = 40
kpis = [
    ("Total Tasks", "=Scorecard!A8", 72),
    ("Completed", "=Scorecard!B8", 72),
    ("Open", "=Scorecard!C8", 72),
    ("Overdue", "=Scorecard!E8", 72),
    ("Blocked", "=Scorecard!D8", 72),
    ("On-Time % (all done)", '=IFERROR(COUNTIFS(tblTasks[Delivery Status],"Done On Time")/COUNTIFS(tblTasks[Delivery Status],"Done*"),"-")', 73),
    ("Avg Task Score", '=IFERROR(AVERAGE(tblTasks[Task Score]),"-")', 72),
    ("Hours Logged (period)", "=SUMIFS('Daily Log'!$F:$F," + PERIOD_IN + ")", 72),
]
for i, (label, formula, st) in enumerate(kpis):
    c1, c2 = col_letter(1 + 2 * i), col_letter(2 + 2 * i)
    d.s(f"{c1}4", label, S_HEAD)
    d.blank(f"{c2}4", S_HEAD)
    d.f(f"{c1}5", formula.lstrip("="), st)
    d.blank(f"{c2}5", st)
    d.merges += [f"{c1}4:{c2}4", f"{c1}5:{c2}5"]

d.s("A66", "Data behind the charts", S_SECTION)
# Designer performance
heads = ["Designer", "Completed (period)", "On-Time %", "Avg TAT (days)", "Speed", "Quality",
         "Commitment", "Overall", "Rating", "Hours Logged (period)", "Utilisation (this week)"]
for i, h in enumerate(heads):
    d.s(f"{col_letter(i + 1)}{DES_HEAD}", h, S_HEAD)
util_rows = [41, 47, 53, 59, 65]
for k in range(DES_N):
    r, sr = DES_FIRST + k, 12 + k
    d.f(f"A{r}", f"Scorecard!A{sr}", S_TEXT)
    d.f(f"B{r}", f"Scorecard!B{sr}", S_INT)
    d.f(f"C{r}", f"Scorecard!D{sr}", S_PCT)
    d.f(f"D{r}", f"Scorecard!C{sr}", S_DEC1)
    for c, src in zip("EFGH", "FGHI"):
        d.f(f"{c}{r}", f"Scorecard!{src}{sr}", S_INT)
    d.f(f"I{r}", f"Scorecard!J{sr}", S_CENTER)
    d.f(f"J{r}", f"IF($A{r}=\"\",\"\",SUMIFS('Daily Log'!$F:$F,'Daily Log'!$C:$C,$A{r}," + PERIOD_IN + "))", S_DEC1)
    d.f(f"K{r}", f"Scorecard!C{util_rows[k]}", S_PCT)

# Delivery status
d.s(f"A{ST_HEAD}", "Delivery Status", S_HEAD)
d.s(f"B{ST_HEAD}", "Tasks", S_HEAD)
for k, st in enumerate(STATUSES):
    r = ST_FIRST + k
    d.s(f"A{r}", st, S_TEXT)
    d.f(f"B{r}", f"COUNTIFS(tblTasks[Delivery Status],$A{r})", S_INT)

# Weekly hours logged
d.s(f"A{WK_HEAD}", "Week starting (Mon)", S_HEAD)
for k in range(DES_N):
    c = col_letter(2 + k)
    d.f(f"{c}{WK_HEAD}", f"Scorecard!$A${12 + k}", S_HEAD)
d.s(f"G{WK_HEAD}", "Team Total", S_HEAD)
for k in range(WK_N):
    r = WK_FIRST + k
    if k == 0:
        d.f(f"A{r}", f"TODAY()-WEEKDAY(TODAY(),2)+1-{7 * (WK_N - 1)}", S_DATE)
    else:
        d.f(f"A{r}", f"A{r - 1}+7", S_DATE)
    for j in range(DES_N):
        c = col_letter(2 + j)
        d.f(f"{c}{r}", f"IF({c}${WK_HEAD}=\"\",\"\",SUMIFS('Daily Log'!$F:$F,'Daily Log'!$C:$C,{c}${WK_HEAD},'Daily Log'!$A:$A,\">=\"&$A{r},'Daily Log'!$A:$A,\"<\"&($A{r}+7)))", S_DEC1)
    d.f(f"G{r}", f"SUMIFS('Daily Log'!$F:$F,'Daily Log'!$A:$A,\">=\"&$A{r},'Daily Log'!$A:$A,\"<\"&($A{r}+7))", S_DEC1)

# Product tags (names written by the app)
for i, h in enumerate(["Product / Master Task", "Product Line", "Tasks", "Open", "Est. Hours", "Hours Logged", "Avg Progress %"]):
    d.s(f"{col_letter(i + 1)}{TAG_HEAD}", h, S_HEAD)
TD = "'Task Details'!"
for k in range(TAG_N):
    r = TAG_FIRST + k
    d.blank(f"A{r}", S_TEXT)
    d.blank(f"B{r}", S_TEXT)
    d.f(f"C{r}", f'IF($A{r}="","",COUNTIFS({TD}$B:$B,$A{r}))', S_INT)
    d.f(f"D{r}", f'IF($A{r}="","",C{r}-COUNTIFS({TD}$B:$B,$A{r},{TD}$H:$H,"Done*"))', S_INT)
    d.f(f"E{r}", f'IF($A{r}="","",SUMIFS({TD}$I:$I,{TD}$B:$B,$A{r}))', S_DEC1)
    d.f(f"F{r}", f'IF($A{r}="","",SUMIFS({TD}$K:$K,{TD}$B:$B,$A{r}))', S_DEC1)
    d.f(f"G{r}", f'IF($A{r}="","",IFERROR(AVERAGEIFS({TD}$J:$J,{TD}$B:$B,$A{r})/100,"-"))', S_PCT)

# Projects (from Settings)
for i, h in enumerate(["Project", "Lead PM", "Tasks", "Open", "Completed", "Overdue", "Est. Hours"]):
    d.s(f"{col_letter(i + 1)}{PRJ_HEAD}", h, S_HEAD)
for k in range(PRJ_N):
    r, sr = PRJ_FIRST + k, 5 + k
    d.f(f"A{r}", f'IF(Settings!F{sr}="","",Settings!F{sr})', S_TEXT)
    d.f(f"B{r}", f'IF($A{r}="","",Settings!G{sr}&"")', S_TEXT)
    d.f(f"C{r}", f'IF($A{r}="","",COUNTIFS(tblTasks[Project],$A{r}))', S_INT)
    d.f(f"D{r}", f'IF($A{r}="","",C{r}-E{r})', S_INT)
    d.f(f"E{r}", f'IF($A{r}="","",COUNTIFS(tblTasks[Project],$A{r},tblTasks[Delivery Status],"Done*"))', S_INT)
    d.f(f"F{r}", f'IF($A{r}="","",COUNTIFS(tblTasks[Project],$A{r},tblTasks[Delivery Status],"Overdue"))', S_INT)
    d.f(f"G{r}", f'IF($A{r}="","",SUMIFS(tblTasks[Estimated Effort (Hrs)],tblTasks[Project],$A{r}))', S_DEC1)

# Request funnel (subtask rows on the Task Funnel sheet)
FUN_HEAD = PRJ_FIRST + PRJ_N + 2
FUNNEL = ["Awaiting approval", "Changes requested", "Approved", "Rejected"]
d.s(f"A{FUN_HEAD}", "Request Funnel", S_HEAD)
d.s(f"B{FUN_HEAD}", "Subtasks", S_HEAD)
for k, st in enumerate(FUNNEL):
    r = FUN_HEAD + 1 + k
    d.s(f"A{r}", st, S_TEXT)
    d.f(f"B{r}", f"COUNTIFS('Task Funnel'!$O:$O,$A{r})", S_INT)
# 4E lines (Task Details column Q)
E4_HEAD = FUN_HEAD + len(FUNNEL) + 2
for i, h in enumerate(["4E Line", "Tasks", "Open", "Est. Hours", "Hours Logged"]):
    d.s(f"{col_letter(i + 1)}{E4_HEAD}", h, S_HEAD)
for k, line in enumerate(["Evaluate", "Educate", "Experience", "Enable", "GENIE Platform", "Other"]):
    r = E4_HEAD + 1 + k
    d.s(f"A{r}", line, S_TEXT)
    d.f(f"B{r}", f"COUNTIFS({TD}$Q:$Q,$A{r})", S_INT)
    d.f(f"C{r}", f'B{r}-COUNTIFS({TD}$Q:$Q,$A{r},{TD}$H:$H,"Done*")', S_INT)
    d.f(f"D{r}", f"SUMIFS({TD}$I:$I,{TD}$Q:$Q,$A{r})", S_DEC1)
    d.f(f"E{r}", f"SUMIFS({TD}$K:$K,{TD}$Q:$Q,$A{r})", S_DEC1)
# Deliverables completed per week (batch tasks, Deliverables sheet)
DEL_HEAD = E4_HEAD + 9
DEL_FIRST = DEL_HEAD + 1
DV = "'Deliverables'!"
d.s(f"A{DEL_HEAD}", "Deliverables done, week of", S_HEAD)
for k in range(DES_N):
    c = col_letter(2 + k)
    d.f(f"{c}{DEL_HEAD}", f"Scorecard!$A${12 + k}", S_HEAD)
d.s(f"G{DEL_HEAD}", "Team Total", S_HEAD)
for k in range(WK_N):
    r = DEL_FIRST + k
    d.f(f"A{r}", f"$A${WK_FIRST + k}", S_DATE)
    for j in range(DES_N):
        c = col_letter(2 + j)
        d.f(f"{c}{r}", f'IF({c}${DEL_HEAD}="","",COUNTIFS({DV}$B:$B,{c}${DEL_HEAD},{DV}$H:$H,"Done",{DV}$I:$I,">="&$A{r},{DV}$I:$I,"<"&($A{r}+7)))', S_INT)
    d.f(f"G{r}", f'COUNTIFS({DV}$H:$H,"Done",{DV}$I:$I,">="&$A{r},{DV}$I:$I,"<"&($A{r}+7))', S_INT)
HPD = DEL_FIRST + WK_N
d.s(f"A{HPD}", "Hours per deliverable", S_SECTION)
for j in range(DES_N):
    c = col_letter(2 + j)
    d.f(f"{c}{HPD}", f'IF({c}${DEL_HEAD}="","",IFERROR(SUMIFS({TD}$K:$K,{TD}$F:$F,{c}${DEL_HEAD},{TD}$U:$U,">1")/SUMIFS({TD}$W:$W,{TD}$F:$F,{c}${DEL_HEAD},{TD}$U:$U,">1"),"-"))', S_DEC1)
d.f(f"G{HPD}", f'IFERROR(SUMIFS({TD}$K:$K,{TD}$U:$U,">1")/SUMIFS({TD}$W:$W,{TD}$U:$U,">1"),"-")', S_DEC1)
DASH_LAST = HPD

dash_cols = [(1, 24)] + [(i, 18 if i == 9 else 12.5) for i in range(2, 17)]
dash_view = '<sheetView showGridLines="0" workbookViewId="0"/>'
dash_xml = d.xml(dash_cols, tail='<drawing r:id="rId1"/>', sheet_view=dash_view, fit_width=True,
                 dim=f"A1:P{DASH_LAST}")

# ------------------------------------------------------------ Task Details
TD_HEADS = [
    ("Task ID", S_HEAD_GREY, 9), ("Master Task", S_HEAD, 20), ("Subtask", S_HEAD, 18),
    ("Task Title", S_HEAD, 36), ("Project", S_HEAD_GREY, 20), ("Designer", S_HEAD_GREY, 14),
    ("Status", S_HEAD_GREY, 13), ("Delivery Status", S_HEAD_GREY, 15), ("Est. Hours", S_HEAD_GREY, 10),
    ("Progress %", S_HEAD_TEAL, 11), ("Hours Logged", S_HEAD_TEAL, 11), ("Last Update", S_HEAD_TEAL, 13),
    ("Latest Note", S_HEAD_TEAL, 44), ("Assigned By", S_HEAD, 14), ("Assigned On", S_HEAD, 13),
    ("Brief / Link", S_HEAD, 36), ("4E Line", S_HEAD, 12), ("Master Task Title", S_HEAD, 30),
    ("Request ID", S_HEAD, 11), ("Approved On", S_HEAD, 13), ("Qty", S_HEAD, 7), ("Unit", S_HEAD, 12),
    ("Items Done", S_HEAD_TEAL, 10),
]
t = Sheet()
t.s("A1", "Task Details", S_TITLE)
t.s("A2", "Written by Design Task Hub on export. Row 5 here is row 5 on the Tracker. Grey columns link to the Tracker; teal columns come from designers' daily updates.", S_NOTE)
t.heights[4] = 34
for i, (h, st, _) in enumerate(TD_HEADS):
    t.s(f"{col_letter(i + 1)}4", h, st)
frozen = ('<sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="4" topLeftCell="B5" '
          'activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B5" sqref="B5"/></sheetView>')
td_xml = t.xml([(i + 1, w) for i, (_, _, w) in enumerate(TD_HEADS)],
               extra_before_margins="", sheet_view=frozen, dim="A1:W4")
td_xml = td_xml.replace("</sheetData>", '</sheetData><autoFilter ref="A4:W4"/>')

# --------------------------------------------------------------- Daily Log
DL_HEADS = [("Date", 12), ("Task ID", 9), ("Designer", 14), ("Master Task", 20), ("Subtask", 18),
            ("Hours", 9), ("Progress %", 11), ("Status", 13), ("Note", 50), ("Blocker", 36)]
g = Sheet()
g.s("A1", "Daily Log", S_TITLE)
g.s("A2", "One row per designer update per task per day, written by Design Task Hub on export. Hours feed the Dashboard.", S_NOTE)
g.heights[4] = 34
for i, (h, _) in enumerate(DL_HEADS):
    g.s(f"{col_letter(i + 1)}4", h, S_HEAD_TEAL)
frozen2 = ('<sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" '
           'activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView>')
dl_xml = g.xml([(i + 1, w) for i, (_, w) in enumerate(DL_HEADS)], sheet_view=frozen2, dim="A1:J4")
dl_xml = dl_xml.replace("</sheetData>", '</sheetData><autoFilter ref="A4:J4"/>')

# ------------------------------------------------------------- Task Funnel
TF_HEADS = [("Request ID", 11), ("Submitted", 12), ("PM", 12), ("4E Line", 12), ("Product", 18), ("Project", 20),
            ("Master Task", 30), ("Priority", 10), ("Subtask", 16), ("Detail", 40), ("Designer", 13), ("Start", 12),
            ("End", 12), ("Est. Hours", 10), ("Status", 17), ("Decided On", 12), ("Owner Note", 36), ("Task ID", 9),
            ("Qty", 7), ("Unit", 12)]
tf = Sheet()
tf.s("A1", "Task Funnel", S_TITLE)
tf.s("A2", "Every request PMs submitted, one row per subtask, with your decision. Approved subtasks become Tracker rows (Task ID).", S_NOTE)
tf.heights[4] = 34
for i, (h, _) in enumerate(TF_HEADS):
    tf.s(f"{col_letter(i + 1)}4", h, S_HEAD)
tf_xml = tf.xml([(i + 1, w) for i, (_, w) in enumerate(TF_HEADS)], sheet_view=frozen2, dim="A1:T4")
tf_xml = tf_xml.replace("</sheetData>", '</sheetData><autoFilter ref="A4:T4"/>')

# ------------------------------------------------------------ Deliverables
DLV_HEADS = [("Task ID", 9), ("Designer", 13), ("Product", 18), ("Subtask", 16), ("Batch", 34), ("#", 5),
             ("Deliverable", 34), ("Status", 13), ("Done On", 12), ("Revisions", 10), ("Link", 40)]
dv = Sheet()
dv.s("A1", "Deliverables", S_TITLE)
dv.s("A2", "One row per item inside a batch task (for example each video in a set of 12), written by Design Task Hub on export.", S_NOTE)
dv.heights[4] = 34
for i, (h, _) in enumerate(DLV_HEADS):
    dv.s(f"{col_letter(i + 1)}4", h, S_HEAD_TEAL)
dv_xml = dv.xml([(i + 1, w) for i, (_, w) in enumerate(DLV_HEADS)], sheet_view=frozen2, dim="A1:K4")
dv_xml = dv_xml.replace("</sheetData>", '</sheetData><autoFilter ref="A4:K4"/>')


# ------------------------------------------------------------------ charts
def rich(text, size=1200, bold=True):
    b = ' b="1"' if bold else ' b="0"'
    return (f'<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="{size}"{b}/></a:pPr>'
            f'<a:r><a:rPr lang="en-US" sz="{size}"{b}><a:solidFill><a:srgbClr val="262626"/></a:solidFill></a:rPr>'
            f'<a:t>{escape(text)}</a:t></a:r></a:p></c:rich></c:tx>')


def fill(color):
    return f'<c:spPr><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>'


def axes(cat_pos, val_pos, val_fmt="0", val_max=None, cat_fmt="General", reverse_cat=False, line=False, auto_cat=True):
    mx = f'<c:max val="{val_max}"/><c:min val="0"/>' if val_max is not None else '<c:min val="0"/>'
    orient = "maxMin" if reverse_cat else "minMax"
    grid = ('<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E7E6E2"/></a:solidFill>'
            '</a:ln></c:spPr></c:majorGridlines>')
    axis_line = '<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>'
    return (
        f'<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="{orient}"/></c:scaling><c:delete val="0"/>'
        f'<c:axPos val="{cat_pos}"/><c:numFmt formatCode="{cat_fmt}" sourceLinked="0"/><c:majorTickMark val="none"/>'
        f'<c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>{axis_line}<c:crossAx val="5002"/>'
        f'<c:crosses val="autoZero"/><c:auto val="{1 if auto_cat else 0}"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>'
        '<c:noMultiLvlLbl val="0"/></c:catAx>'
        f'<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/>{mx}</c:scaling><c:delete val="0"/>'
        f'<c:axPos val="{val_pos}"/>{grid}<c:numFmt formatCode="{escape(val_fmt)}" sourceLinked="0"/>'
        '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>'
        '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:crossAx val="5001"/>'
        f'<c:crosses val="{"max" if reverse_cat else "autoZero"}"/>'
        f'<c:crossBetween val="{"midCat" if line else "between"}"/></c:valAx>'
    )


def chart_space(title, plot, legend=True):
    leg = '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' if legend else ""
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        f'xmlns:r="{REL_NS}"><c:roundedCorners val="0"/><c:chart>'
        f'<c:title>{rich(title)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
        f'<c:plotArea><c:layout/>{plot}</c:plotArea>{leg}'
        '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'
        '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill>'
        '<a:srgbClr val="E7E6E2"/></a:solidFill></a:ln></c:spPr>'
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="52514E"/>'
        '</a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:chartSpace>'
    )


def bar_series(idx, name_ref, cat_ref, val_ref, color, points=None):
    dpts = ""
    for i, pc in enumerate(points or []):
        dpts += (f'<c:dPt><c:idx val="{i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>'
                 f'{fill(pc)}</c:dPt>')
    tx = f'<c:tx><c:strRef><c:f>{name_ref}</c:f></c:strRef></c:tx>' if name_ref else ""
    return (f'<c:ser><c:idx val="{idx}"/><c:order val="{idx}"/>{tx}{fill(color)}'
            f'<c:invertIfNegative val="0"/>{dpts}'
            f'<c:cat><c:strRef><c:f>{cat_ref}</c:f></c:strRef></c:cat>'
            f'<c:val><c:numRef><c:f>{val_ref}</c:f></c:numRef></c:val></c:ser>')


def bar_chart(series, direction="col", grouping="clustered"):
    overlap = "100" if grouping == "stacked" else "-10"
    return (f'<c:barChart><c:barDir val="{direction}"/><c:grouping val="{grouping}"/><c:varyColors val="0"/>'
            f'{"".join(series)}<c:gapWidth val="70"/><c:overlap val="{overlap}"/>'
            '<c:axId val="5001"/><c:axId val="5002"/></c:barChart>')


D = "Dashboard!"
des_cat = f"{D}$A${DES_FIRST}:$A${DES_FIRST + DES_N - 1}"
charts = []

# 1 Designer scores
ser = [bar_series(i, f"{D}${c}${DES_HEAD}", des_cat, f"{D}${c}${DES_FIRST}:${c}${DES_FIRST + DES_N - 1}", col)
       for i, (c, col) in enumerate(zip("EFGH", [BLUE, ORANGE, AQUA, NAVY]))]
charts.append(chart_space("Designer scores (period, 0 to 100)", bar_chart(ser) + axes("b", "l", "0", 100)))

# 2 Utilisation this week
ser = [bar_series(0, None, des_cat, f"{D}$K${DES_FIRST}:$K${DES_FIRST + DES_N - 1}", BLUE)]
charts.append(chart_space("Utilisation this week (100% = full capacity)", bar_chart(ser) + axes("b", "l", "0%"), legend=False))

# 3 Delivery status
st_cat = f"{D}$A${ST_FIRST}:$A${ST_FIRST + len(STATUSES) - 1}"
ser = [bar_series(0, None, st_cat, f"{D}$B${ST_FIRST}:$B${ST_FIRST + len(STATUSES) - 1}", BLUE, STATUS_COLORS)]
charts.append(chart_space("Tasks by delivery status", bar_chart(ser, "bar") + axes("l", "b", "0", reverse_cat=True), legend=False))

# 4 Weekly hours (line)
wk_cat = f"{D}$A${WK_FIRST}:$A${WK_FIRST + WK_N - 1}"
line_ser = ""
for i, col in enumerate([BLUE, ORANGE, AQUA, YELLOW, MAGENTA]):
    c = col_letter(2 + i)
    line_ser += (
        f'<c:ser><c:idx val="{i}"/><c:order val="{i}"/><c:tx><c:strRef><c:f>{D}${c}${WK_HEAD}</c:f></c:strRef></c:tx>'
        f'<c:spPr><a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:round/></a:ln></c:spPr>'
        f'<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="{col}"/></a:solidFill>'
        f'<a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>'
        f'<c:cat><c:numRef><c:f>{wk_cat}</c:f></c:numRef></c:cat>'
        f'<c:val><c:numRef><c:f>{D}${c}${WK_FIRST}:${c}${WK_FIRST + WK_N - 1}</c:f></c:numRef></c:val>'
        '<c:smooth val="0"/></c:ser>')
line_plot = (f'<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>{line_ser}<c:marker val="1"/>'
             '<c:axId val="5001"/><c:axId val="5002"/></c:lineChart>')
charts.append(chart_space("Hours logged per week (last 8 weeks)", line_plot + axes("b", "l", "0", cat_fmt="dd-mmm", line=True, auto_cat=False)))

# 5 Hours by product tag
tag_cat = f"{D}$A${TAG_FIRST}:$A${TAG_FIRST + TAG_N - 1}"
ser = [bar_series(0, f"{D}$E${TAG_HEAD}", tag_cat, f"{D}$E${TAG_FIRST}:$E${TAG_FIRST + TAG_N - 1}", BLUE),
       bar_series(1, f"{D}$F${TAG_HEAD}", tag_cat, f"{D}$F${TAG_FIRST}:$F${TAG_FIRST + TAG_N - 1}", ORANGE)]
charts.append(chart_space("Effort by product: estimated vs logged hours", bar_chart(ser, "bar") + axes("l", "b", "0", reverse_cat=True)))

# 6 Tasks by project
prj_cat = f"{D}$A${PRJ_FIRST}:$A${PRJ_FIRST + PRJ_N - 1}"
ser = [bar_series(0, f"{D}$E${PRJ_HEAD}", prj_cat, f"{D}$E${PRJ_FIRST}:$E${PRJ_FIRST + PRJ_N - 1}", AQUA),
       bar_series(1, f"{D}$D${PRJ_HEAD}", prj_cat, f"{D}$D${PRJ_FIRST}:$D${PRJ_FIRST + PRJ_N - 1}", BLUE)]
charts.append(chart_space("Tasks by project: completed and open", bar_chart(ser, "bar", "stacked") + axes("l", "b", "0", reverse_cat=True)))

# 7 Deliverables per week (next to its table)
dl_cat = f"{D}$A${DEL_FIRST}:$A${DEL_FIRST + WK_N - 1}"
ser = [bar_series(i, f"{D}${col_letter(2 + i)}${DEL_HEAD}", dl_cat, f"{D}${col_letter(2 + i)}${DEL_FIRST}:${col_letter(2 + i)}${DEL_FIRST + WK_N - 1}", col)
       for i, col in enumerate([BLUE, ORANGE, AQUA, YELLOW, MAGENTA])]
charts.append(chart_space("Deliverables completed per week", bar_chart(ser) + axes("b", "l", "0", cat_fmt="dd-mmm", auto_cat=False)))

# Drawing: two charts per band, three bands, plus the deliverables chart
anchors = [(0, 7, 8, 25), (8, 7, 16, 25), (0, 26, 8, 44), (8, 26, 16, 44), (0, 45, 8, 63), (8, 45, 16, 63),
           (8, DEL_HEAD - 3, 16, DEL_HEAD + 15)]
frames = []
for i, (c1, r1, c2, r2) in enumerate(anchors):
    frames.append(
        f'<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>{c1}</xdr:col><xdr:colOff>{0 if c1 == 0 else 76200}</xdr:colOff>'
        f'<xdr:row>{r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{c2}</xdr:col>'
        f'<xdr:colOff>0</xdr:colOff><xdr:row>{r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
        f'<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="{i + 2}" name="Chart {i + 1}"/>'
        '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
        f'<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId{i + 1}"/>'
        '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>')
drawing_xml = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
    f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{REL_NS}">'
    + "".join(frames) + "</xdr:wsDr>")
drawing_rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    f'<Relationships xmlns="{PKG_REL}">' + "".join(
        f'<Relationship Id="rId{i + 1}" Type="{REL_NS}/chart" Target="../charts/chart{i + 1}.xml"/>'
        for i in range(len(charts))) + "</Relationships>")
dash_rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    f'<Relationships xmlns="{PKG_REL}"><Relationship Id="rId1" Type="{REL_NS}/drawing" '
    'Target="../drawings/drawing1.xml"/></Relationships>')

# ---------------------------------------------------------------- assemble
zin = zipfile.ZipFile(SRC)
parts = {n: zin.read(n) for n in zin.namelist()}

# styles: one big KPI font and two KPI xfs (index 72 number, 73 percent)
styles = parts["xl/styles.xml"].decode()
fc = int(re.search(r'<fonts count="(\d+)"', styles).group(1))
styles = re.sub(r'<fonts count="\d+"', f'<fonts count="{fc + 1}"', styles)
styles = styles.replace("</fonts>", f'<font><b/><sz val="22"/><color rgb="FF{NAVY}"/><name val="Aptos Narrow"/>'
                                    '<family val="2"/><scheme val="minor"/></font></fonts>')
xc = int(re.search(r'<cellXfs count="(\d+)"', styles).group(1))
assert xc == 72, f"unexpected cellXfs count {xc}"
kpi = (f'<xf numFmtId="{{fmt}}" fontId="{fc}" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" '
       'applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>')
styles = re.sub(r'<cellXfs count="\d+"', f'<cellXfs count="{xc + 2}"', styles)
styles = styles.replace("</cellXfs>", kpi.format(fmt=1) + kpi.format(fmt=9) + "</cellXfs>")
parts["xl/styles.xml"] = styles.encode()

# workbook: new sheets, recalc on open, drop calcChain (Excel rebuilds it)
wb = parts["xl/workbook.xml"].decode()
wb = wb.replace("</sheets>", '<sheet name="Dashboard" sheetId="7" r:id="rId21"/>'
                             '<sheet name="Task Details" sheetId="8" r:id="rId22"/>'
                             '<sheet name="Daily Log" sheetId="9" r:id="rId23"/>'
                             '<sheet name="Task Funnel" sheetId="10" r:id="rId24"/>'
                             '<sheet name="Deliverables" sheetId="11" r:id="rId25"/></sheets>')
wb = wb.replace('<calcPr calcId="181029"/>', '<calcPr calcId="181029" fullCalcOnLoad="1"/>')
assert 'fullCalcOnLoad="1"' in wb
parts["xl/workbook.xml"] = wb.encode()

rels = parts["xl/_rels/workbook.xml.rels"].decode()
rels = re.sub(r'<Relationship Id="rId9"[^>]*calcChain[^>]*/>', "", rels)
ws_type = f"{REL_NS}/worksheet"
rels = rels.replace("</Relationships>",
                    f'<Relationship Id="rId21" Type="{ws_type}" Target="worksheets/sheet5.xml"/>'
                    f'<Relationship Id="rId22" Type="{ws_type}" Target="worksheets/sheet6.xml"/>'
                    f'<Relationship Id="rId23" Type="{ws_type}" Target="worksheets/sheet7.xml"/>'
                    f'<Relationship Id="rId24" Type="{ws_type}" Target="worksheets/sheet8.xml"/>'
                    f'<Relationship Id="rId25" Type="{ws_type}" Target="worksheets/sheet9.xml"/></Relationships>')
parts["xl/_rels/workbook.xml.rels"] = rels.encode()
parts.pop("xl/calcChain.xml", None)

ct = parts["[Content_Types].xml"].decode()
ct = ct.replace('<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>', "")
ws_ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
extra = "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="{ws_ct}"/>' for i in (5, 6, 7, 8, 9))
extra += '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
extra += "".join(f'<Override PartName="/xl/charts/chart{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>' for i in range(len(charts)))
ct = ct.replace("</Types>", extra + "</Types>")
parts["[Content_Types].xml"] = ct.encode()

app = parts["docProps/app.xml"].decode()
app = app.replace("<vt:i4>4</vt:i4>", "<vt:i4>9</vt:i4>").replace('<vt:vector size="4" baseType="lpstr">', '<vt:vector size="9" baseType="lpstr">')
app = app.replace("<vt:lpstr>Leave &amp; Holidays</vt:lpstr></vt:vector>",
                  "<vt:lpstr>Leave &amp; Holidays</vt:lpstr><vt:lpstr>Dashboard</vt:lpstr><vt:lpstr>Task Details</vt:lpstr><vt:lpstr>Daily Log</vt:lpstr><vt:lpstr>Task Funnel</vt:lpstr><vt:lpstr>Deliverables</vt:lpstr></vt:vector>")
parts["docProps/app.xml"] = app.encode()

parts["xl/worksheets/sheet5.xml"] = dash_xml.encode()
parts["xl/worksheets/sheet6.xml"] = td_xml.encode()
parts["xl/worksheets/sheet7.xml"] = dl_xml.encode()
parts["xl/worksheets/sheet8.xml"] = tf_xml.encode()
parts["xl/worksheets/sheet9.xml"] = dv_xml.encode()
parts["xl/worksheets/_rels/sheet5.xml.rels"] = dash_rels.encode()
parts["xl/drawings/drawing1.xml"] = drawing_xml.encode()
parts["xl/drawings/_rels/drawing1.xml.rels"] = drawing_rels.encode()
for i, cx in enumerate(charts):
    parts[f"xl/charts/chart{i + 1}.xml"] = cx.encode()

order = ["[Content_Types].xml"] + [n for n in parts if n != "[Content_Types].xml"]
with zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED) as z:
    for n in order:
        z.writestr(n, parts[n])
print(f"wrote {DST}")
