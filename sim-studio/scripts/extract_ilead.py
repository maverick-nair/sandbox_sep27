"""Convert the legacy iLead content workbook into a tokenized template file.

Usage:
  python3 scripts/extract_ilead.py "<path to iLead International Sales Elevator - Full content.xlsx>"

Writes src/templates/ilead/legacy-content.json. The Studio never reads the
workbook directly; this script is the one-time migration step for a storyline.

What it normalizes:
  * PLACEHOLDER_* markers become {{tokens}} the Studio renders as chips.
  * Male and female copies of the same text collapse into one string with
    pronoun tokens ({{he}}, {{his}}, {{him}}, {{himself}} and capitalized forms).
  * Named entities (company, product, competitor, CEO...) become context tokens
    so the storyline can be re-contextualized without editing every string.
"""
import json, re, sys, pathlib
import openpyxl

SRC = sys.argv[1]
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src/templates/ilead/legacy-content.json'
wb = openpyxl.load_workbook(SRC, data_only=True)

def rows(sheet):
    ws = wb[sheet]
    out = []
    for r in ws.iter_rows(values_only=True):
        r = ['' if c is None else (str(c).strip() if not isinstance(c, (int, float)) else c) for c in r]
        if any(str(c).strip() for c in r):
            out.append(r)
    return out

# Entity dictionary: longest strings first so "Innov8 Elevators Inc" wins over "Innov8".
ENTITIES = [
    ('Innov8 Elevators Inc', '{{company}}'),
    ('Innov8 Elevators', '{{company}}'),
    ('Innov8 Inc', '{{company}}'),
    ('Sales Director', '{{learner_role}}'),
    ("Innov8's", "{{company}}'s"),
    ('Innov8', '{{company}}'),
    ('Levo B10', '{{product}}'),
    ('Lofty S10', '{{product_2}}'),
    ('ArmTech V60', '{{product_3}}'),
    ('Levo', '{{product}}'),
    ('Roger Kent', '{{ceo}}'),
    ('Uplift', '{{competitor}}'),
    ('Beta Elevators', '{{rival}}'),
    ('Aaron king', '{{board_member}}'),
    ('Westernizza', '{{lunch_venue}}'),
    ('New York', '{{city}}'),
    ('Hawaii', '{{destination}}'),
]
PLACEHOLDERS = [
    ('PLACEHOLDER_ANGRY_ACTOR_NAME', '{{top_performer}}'),
    ('PLACEHOLDER_ACTOR_NAME', '{{actor}}'),
    ('PLACEHOLDER_CURRENT_ROLE', '{{stage}}'),
    ('PLACEHOLDER_ACTOR_SKILL', '{{skill}}'),
    ('PLACEHOLDER_ACTOR_MOTIVATION', '{{morale}}'),
    ('PLACEHOLDER_ACTOR_PERFORMANCE', '{{performance}}'),
    ('LEADERSHIPSTYLE_REPLACEMENT', '{{style}}'),
    ('STYLENAME_REPLACEMENT', '{{style}}'),
    ('DOMINANT_STYLE_REPLACEMENT', '{{dominant_style}}'),
    ('NUM_WEEKS', '{{weeks}}'),
]
PRONOUNS = {('he', 'she'): 'he', ('him', 'her'): 'him', ('his', 'her'): 'his', ('himself', 'herself'): 'himself'}

def tokenize(text):
    if not text:
        return ''
    t = str(text).replace("\\'", "'")
    for a, b in PLACEHOLDERS:
        t = t.replace(a, b)
    for a, b in ENTITIES:
        t = re.sub(r'(?<![\w{])' + re.escape(a) + r'(?![\w}])', b, t)
    return re.sub(r'[ \t]+', ' ', t).strip()

def merge_gendered(male, female):
    """Collapse male/female variants into one string with pronoun tokens."""
    m, f = tokenize(male), tokenize(female)
    if not f or m == f:
        return m
    mw, fw = re.split(r'(\W+)', m), re.split(r'(\W+)', f)
    if len(mw) != len(fw):
        return m  # structure differs; keep the male copy and let the validator flag it
    out = []
    for a, b in zip(mw, fw):
        if a == b:
            out.append(a)
            continue
        key = PRONOUNS.get((a.lower(), b.lower()))
        if key is None:
            return m
        out.append('{{' + (key.capitalize() if a[0].isupper() else key) + '}}')
    return ''.join(out)

def num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

content = {'source': pathlib.Path(SRC).name}

# Storyline
r = rows('Storyline')[1]
content['story'] = {'name': r[0], 'welcome': tokenize(r[1]), 'overview': tokenize(r[2]), 'target': tokenize(r[3])}
content['briefing'] = [tokenize(x[0]) for x in rows('Video Transcript')[1:]]
content['walkthrough'] = [{'title': x[1], 'text': tokenize(x[2]), 'group': x[3] if len(x) > 3 else ''} for x in rows('Walkthrough')[1:]]
content['stages'] = [{'name': x[0], 'description': tokenize(x[1]), 'conversion': x[2]} for x in rows('Phases Description')[1:]]
content['styleSheet'] = [{'skill': x[0], 'morale': x[1], 'name': x[2], 'definition': x[3]} for x in rows('Con - Leadership Style')[1:]]
content['gameMath'] = [list(x[:3]) for x in rows('Game Math')]

# Actors
profiles = {}
for x in rows('Actor Profiles')[1:]:
    profiles[x[1].strip()] = {'name': x[1].strip(), 'joined': x[2], 'experience': x[3], 'domain': x[4], 'bio': tokenize(x[5])}
stats, group, origin = {}, None, None
for x in rows('Actor Phase SMP'):
    if x[0] in ('Active Actors', 'Not Active Actors'):
        group = x[0]
    if x[2] in ('Actor', ''):
        continue
    if x[1]:
        origin = x[1].strip()
    name = x[2].strip()
    a = stats.setdefault(name, {'name': name, 'active': group == 'Active Actors', 'startStage': origin, 'stats': {}})
    a['stats'][x[3].strip()] = {'s': num(x[4]), 'm': num(x[5]), 'p': num(x[6])}
content['actors'] = []
for name, a in stats.items():
    prof = profiles.get(name) or next((p for n, p in profiles.items() if n.split()[0] == name.split()[0]), {})
    a.update({k: v for k, v in prof.items() if k != 'name'})
    a['profileName'] = prof.get('name', '')
    content['actors'].append(a)

# Actions: action row, option rows, outcome rows, message rows
actions, cur, opt, outcome = [], None, None, None
for x in rows('Actions')[2:]:
    x = list(x) + [''] * 15
    if x[0]:
        cur = {'name': x[0], 'description': tokenize(x[1]), 'condition': tokenize(x[13]), 'options': []}
        actions.append(cur)
    if x[4] != '':  # a new option starts where Day Cost is filled
        opt = {'text': '' if x[2] in ('NULL', '') else tokenize(x[2]),
               'selectPrompt': '' if x[3] in ('NULL', '') else tokenize(x[3]),
               'dayCost': num(x[4]), 'cooldown': num(x[5]), 'style': int(num(x[6], 1)), 'outcomes': {}}
        cur['options'].append(opt)
    if x[7] != '':
        outcome = str(int(num(x[7])))
        opt['outcomes'][outcome] = {'impact': {'s': num(x[8]), 'm': num(x[9]), 'p': num(x[10])}, 'messages': []}
    msg = merge_gendered(x[11], x[12])
    if msg:
        # "{{actor}} I love the way..." is a signed message; the sender is shown separately.
        msg = re.sub(r'^\{\{(actor|top_performer)\}\}\s+(?=[A-Z])', '', msg)
        opt['outcomes'][outcome]['messages'].append(msg)
content['actions'] = actions

# General events
content['events'] = [{'name': x[0], 'text': merge_gendered(x[1], x[2]), 'week': int(num(x[3])), 'day': int(num(x[4])),
                      'impact': {'s': num(x[5]), 'm': num(x[6]), 'p': num(x[7])}} for x in rows('General Events')[1:]]

# Trigger events grouped by name with their check windows
trig = {}
for x in rows('Trigger Events')[1:]:
    t = trig.setdefault(x[0], {'name': x[0], 'text': merge_gendered(x[1], x[2]),
                               'impact': {'s': num(x[3]), 'm': num(x[4]), 'p': num(x[5])}, 'rule': x[8], 'windows': []})
    t['windows'].append({'week': int(num(x[6])), 'day': int(num(x[7]))})
content['triggers'] = list(trig.values())

# Report copy (individual report, new format)
report, page, section = [], '', ''
for x in rows('Report New')[1:]:
    x = list(x) + [''] * 5
    page = x[0] or page
    if x[0]:
        section = ''
    section = x[1] or section
    report.append({'page': page, 'section': section, 'kind': x[2], 'band': x[3], 'text': tokenize(x[4])})
content['report'] = report

OUT.write_text(json.dumps(content, indent=1, ensure_ascii=False))
print('wrote', OUT, 'actors', len(content['actors']), 'actions', len(actions), 'events', len(content['events']), 'triggers', len(trig))
