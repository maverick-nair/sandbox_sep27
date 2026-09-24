// iLead template: turns the migrated legacy content into a Simulation Definition.
// Mechanics come from the iLead Model Document; copy and numbers come from the
// Sales Elevator International workbook (see legacy-content.json).
// Anything the legacy documents do not specify is listed in ASSUMPTIONS and
// surfaced in the Studio so an author or the product team can confirm it.

import legacy from './legacy-content.json' with { type: 'json' };
import { fillMissingInsights, draftBio } from './insights.js';

export const STYLES = [
  { id: 'directing', name: 'Directing', legacy: 'Executor', skill: 'low', morale: 'low', color: 'var(--style-directing)' },
  { id: 'guiding', name: 'Guiding', legacy: 'Influencer', skill: 'low', morale: 'high', color: 'var(--style-guiding)' },
  { id: 'partnering', name: 'Partnering', legacy: 'Collaborator', skill: 'high', morale: 'low', color: 'var(--style-partnering)' },
  { id: 'entrusting', name: 'Entrusting', legacy: 'Delegator', skill: 'high', morale: 'high', color: 'var(--style-entrusting)' },
];
const STYLE_BY_NUMBER = { 1: 'directing', 2: 'guiding', 3: 'partnering', 4: 'entrusting' };

// Plain-language definitions from the briefing video script (more learner friendly than the sheet).
const STYLE_DEFINITIONS = {
  directing: 'Give in-depth instructions to the team member and hand-hold for execution.',
  guiding: 'Give guidance as and when needed and seek buy-in to complete the task.',
  partnering: 'Actively encourage and support the team member and take collaborative decisions.',
  entrusting: 'Delegate by providing the big picture and let the team member act independently.',
};

const STAGE_IDS = ['lead', 'qualify', 'proposal', 'negotiate', 'convert'];
const STAGE_NAMES = ['Sales lead', 'Qualify', 'Proposal', 'Negotiate', 'Conversion'];

// Pronouns inferred from the profile copy; the workbook has no gender column.
const PRONOUN = {
  'Beth Killiney': 'she', 'Rita Sandersky': 'she', 'Mandy Lobert': 'she', 'Ruth Ether': 'she', 'Sheila Frederick': 'she',
};

export const ASSUMPTIONS = [
  { id: 'inflow', section: 'funnel', text: 'Weekly lead inflow. The model document says it "changes every week based on the storyline" but the workbook has no values. Defaults ramp from 200 to 300 leads a week.' },
  { id: 'buffer', section: 'funnel', text: 'Performance buffer (the "performance threshold" in the conversion formula) is not in the workbook. Default is 20.' },
  { id: 'value', section: 'funnel', text: 'Value per conversion and the revenue target are not in the workbook. Defaults are USD 50,000 per conversion and a target calibrated with the balance check.' },
  { id: 'weekly', section: 'leadership', text: 'Impact of the weekly leadership style decision. The model document describes it but gives no numbers. Defaults are small (+1/+3/+3 when right, down to -1/-4/-4 when wrong).' },
  { id: 'reassign', section: 'actions', text: 'Reassign and swap responses. The workbook has positive and negative messages but no rule for which one fires. Default: positive when the new stage suits the person better.' },
  { id: 'scores', section: 'report', text: 'Competency score formulas (0 to 10) are not in the documents. Defaults derive them from style accuracy, team skill, morale and performance change, and target achievement.' },
  { id: 'events', section: 'events', text: 'General events hit harder when the week\'s style was wrong. The model document says so but gives no numbers. Defaults: half impact when the style was right, 1.5 times when it was fully wrong.' },
  { id: 'decline', section: 'events', text: '"Performance decreasing for N weeks" is read as a net drop of at least 5 points over that span.' },
];

// Differences between the two legacy sources, resolved in favour of the workbook unless noted.
export const LEGACY_FINDINGS = [
  { id: 'partnering', severity: 'fixed', text: 'The "Con - Leadership Style" sheet lists Partnering as High skill, High morale. The model document says High skill, Low morale. The template uses the model document.' },
  { id: 'nostring', severity: 'fixed', text: 'All four styles have "$$$$$-------NO STRING AVAILABLE--------$$$$$$" as the Low use, High accuracy report insight: the legacy team never wrote the case where a learner rarely used a style but was right each time. The template drafts it from what each style is for, marked Auto-drafted in the report for a quick review.' },
  { id: 'cooldowns', severity: 'open', text: 'Cooldowns differ: the model document says Team building 8 days and Hire 8 days; the workbook says 20 and 10. The template keeps the workbook values.' },
  { id: 'fire', severity: 'open', text: 'The model document says everyone reacts negatively when a member is fired, but every Fire member impact in the workbook is zero. Flagged as a warning.' },
  { id: 'unscheduled', severity: 'open', text: 'Three general events (New microprocessor, Tablet PC issue, Training Request) have period 0 and never fire. Kept in the library, switched off.' },
  { id: 'rolechange', severity: 'fixed', text: 'The generic document says a role change request comes after 2 months in a role; the workbook says 4 weeks. The template uses the workbook.' },
  { id: 'emails', severity: 'fixed', text: 'The model document defines only two outcomes for emails and reassignments, but the workbook stores their negative messages under outcome 2. The engine falls back to the nearest outcome that has messages.' },
  { id: 'names', severity: 'fixed', text: 'Desmond is "Desmond Marta" in the profiles sheet and "Desmond Mart" in the stats sheet. The template uses Desmond Mart.' },
  { id: 'gender', severity: 'fixed', text: 'Every string existed twice (male and female copies). They are merged into one string with pronoun tokens, which also allows they/them.' },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const stageId = (name) => STAGE_IDS[STAGE_NAMES.findIndex((n) => n.toLowerCase() === String(name).toLowerCase().trim())];

function outcomes(src) {
  const out = {};
  for (const k of ['0', '1', '2']) {
    const o = src[k];
    out[k] = o ? { impact: { ...o.impact }, messages: [...o.messages] } : { impact: { s: 0, m: 0, p: 0 }, messages: [] };
  }
  return out;
}

const ACTION_SETUP = {
  'Meet the team': { id: 'meet-team', mechanic: 'styleChoice', scope: 'team', category: 'team' },
  'Energise the team': { id: 'energise', name: 'Energise the team', mechanic: 'weeklyStyleCheck', scope: 'team', category: 'team' },
  'Send email': { id: 'email', mechanic: 'performanceTrend', scope: 'individual', maxTargets: 3, category: 'recognition' },
  'Swap / Reassign roles': { id: 'reassign', mechanic: 'roleChange', scope: 'individual', maxTargets: 2, category: 'structure' },
  'Send For Training': { id: 'training', name: 'Send for training', mechanic: 'training', scope: 'individual', maxTargets: 3, category: 'development' },
  'Hire member': { id: 'hire', mechanic: 'hire', scope: 'pool', maxTargets: 1, category: 'structure' },
  'Fire member': { id: 'fire', mechanic: 'fire', scope: 'individual', maxTargets: 1, category: 'structure' },
  'Meet Face to Face': { id: 'face-to-face', name: 'Meet face to face', mechanic: 'styleChoice', scope: 'individual', maxTargets: 1, category: 'one-to-one' },
  'Assess member': { id: 'assess', mechanic: 'assess', scope: 'individual', maxTargets: 1, category: 'insight' },
  'Reward member': { id: 'reward', mechanic: 'reward', scope: 'individual', maxTargets: 1, category: 'recognition' },
  'Set Goals': { id: 'set-goals', name: 'Set goals', mechanic: 'styleChoice', scope: 'individual', maxTargets: 1, category: 'one-to-one' },
  'Coach member': { id: 'coach', mechanic: 'styleChoice', scope: 'individual', maxTargets: 1, category: 'one-to-one' },
  'Give feedback': { id: 'feedback', mechanic: 'styleChoice', scope: 'individual', maxTargets: 1, category: 'one-to-one' },
};

const OPTION_EXTRA = {
  'Send warning mail': { id: 'warning', label: 'Warning mail', polarity: 'warning' },
  'Send congratulatory mail': { id: 'praise', label: 'Congratulatory mail', polarity: 'praise' },
  'Reassign role': { id: 'reassign', label: 'Reassign', mode: 'reassign' },
  'Swap role': { id: 'swap', label: 'Swap two members', mode: 'swap' },
  'Send for 3-day training': { id: 'short', label: '3-day training', unavailableDays: 3 },
  'Send for 1 week workshop': { id: 'workshop', label: '1-week workshop', unavailableDays: 5 },
  'Team Lunch': { id: 'lunch', label: 'Team lunch' },
  'Team building activity': { id: 'offsite', label: 'Team building activity' },
};

function buildActions() {
  return legacy.actions.map((a) => {
    const setup = ACTION_SETUP[a.name];
    const styled = setup.mechanic === 'styleChoice';
    const options = a.options.map((o, i) => {
      const extra = OPTION_EXTRA[o.text] || {};
      const opt = {
        id: extra.id || (styled ? STYLE_BY_NUMBER[o.style] : `option-${i + 1}`),
        label: extra.label || (styled ? STYLES.find((s) => s.id === STYLE_BY_NUMBER[o.style]).name : a.name),
        text: extra.label && !styled ? '' : o.text,
        style: styled ? STYLE_BY_NUMBER[o.style] : null,
        dayCost: o.dayCost,
        cooldownDays: o.cooldown,
        ...(extra.polarity ? { polarity: extra.polarity } : {}),
        ...(extra.mode ? { mode: extra.mode } : {}),
        ...(extra.unavailableDays ? { unavailableDays: extra.unavailableDays } : {}),
        outcomes: outcomes(o.outcomes),
      };
      // Assess, hire and fire use one outcome each; the workbook's other rows are unused duplicates.
      if (setup.mechanic === 'assess' || setup.mechanic === 'hire') { opt.outcomes['1'].messages = []; opt.outcomes['2'].messages = []; }
      return opt;
    });
    return {
      id: setup.id,
      name: setup.name || a.name,
      description: a.description,
      selectPrompt: a.options.find((o) => o.selectPrompt)?.selectPrompt || '',
      mechanic: setup.mechanic,
      scope: setup.scope,
      category: setup.category,
      maxTargets: setup.maxTargets || 0,
      enabled: true,
      options,
      ...(setup.mechanic === 'performanceTrend' ? { lookbackDays: 10 } : {}),
    };
  });
}

// Trigger rules. The legacy "Impact Condition" prose is kept as a note; the rule is structured.
const TRIGGER_RULES = {
  'Casual leave': { kind: 'perfAbove', threshold: 70, needsCover: true, maxOccurrences: 1, effect: { unavailableDays: 5 } },
  'Clueless team member': { kind: 'reassignedNotTrained', withinDays: 5, maxOccurrences: 1, effect: {} },
  'Demoralized member': { kind: 'perfBelow', threshold: 20, maxOccurrences: 1, effect: {} },
  'Lack of training': { kind: 'perfDeclining', weeks: 6, minDrop: 5, maxOccurrences: 2, effect: {} },
  'Medical leave': { kind: 'perfAbove', threshold: 70, needsCover: false, maxOccurrences: 1, effect: { unavailableDays: 2 } },
  'Morale drops': { kind: 'highPerfNoRecognition', threshold: 60, weeks: 3, maxOccurrences: 3, effect: {} },
  Resignation: { kind: 'perfBelow', threshold: 10, maxOccurrences: 2, effect: { leaves: true } },
  'Role change request': { kind: 'sameRole', weeks: 4, maxOccurrences: 3, effect: {} },
  'Team member complains': { kind: 'perfDeclining', weeks: 3, minDrop: 5, maxOccurrences: 2, effect: {} },
};

function reportSection(page, section) {
  return legacy.report.filter((r) => r.page === page && (section === undefined || r.section.trim() === section));
}

function buildReport() {
  const bandRe = /^(.*?)\s*\((\d+)-(\d+)\)$/;
  const comp = [
    { id: 'upskill', name: 'Ability to upskill', section: 'Ability to upskill', code: 'A1.1.4' },
    { id: 'motivate', name: 'Ability to motivate', section: 'Ability to Motivate', code: 'A1.1.3' },
    { id: 'enable', name: 'Enabling performance', section: 'Enabling Performance', code: 'A1.1.2' },
    { id: 'adapt', name: 'Adaptive leadership', section: 'Adaptive Leadership Score', code: 'A1.1.1' },
    { id: 'results', name: 'Drive for results', section: 'Drive for Results/Result Orientation', code: 'A1.1.5' },
  ];
  const competencies = comp.map((c) => {
    const rows = reportSection('Competencies', c.section);
    return {
      id: c.id,
      name: c.name,
      ontologyCode: c.code,
      description: rows.find((r) => r.kind === 'Section Description')?.text || '',
      enabled: true,
      bands: rows
        .filter((r) => r.band)
        .map((r) => {
          const m = r.band.match(bandRe) || [];
          return { label: (m[1] || r.band).trim(), min: Number(m[2]), max: Number(m[3]), text: r.text };
        }),
    };
  });
  const objective = Object.fromEntries(reportSection('Objectives').filter((r) => r.band).map((r) => [r.band, r.text]));
  const adaptability = Object.fromEntries(reportSection('Overall Leadership Adaptability').filter((r) => r.band).map((r) => [r.band.replace('Accuracy', ''), r.text]));
  const legacyStyleName = { directing: 'Directive', guiding: 'Guiding', partnering: 'Partnering', entrusting: 'Entrusting' };
  const styleInsights = {};
  const styleDescriptions = {};
  for (const s of STYLES) {
    const rows = reportSection('Leadership Styles Summary', legacyStyleName[s.id]);
    styleDescriptions[s.id] = rows.find((r) => r.kind === 'Section Description')?.text || '';
    styleInsights[s.id] = Object.fromEntries(
      rows.filter((r) => r.band).map((r) => [r.band.replace(/Magnitute/g, 'Use').replace(/Accuracy/g, 'Accuracy'), r.text]),
    );
  }
  const consistency = {};
  for (const key of ['Desired vs Actual', 'Intent vs Actual', 'Desired vs Intent']) {
    const rows = reportSection('Consistency in Styles', key);
    consistency[slug(key)] = {
      name: key,
      description: rows.find((r) => r.kind === 'Section Description')?.text || '',
      bands: Object.fromEntries(rows.filter((r) => r.band).map((r) => [r.band, r.text])),
    };
  }
  const actionKey = {
    'Meet the team': 'meet-team', 'Energize Team': 'energise', 'Send Email': 'email', 'Send for Training': 'training',
    'Meet Face to Face': 'face-to-face', 'Assess Member': 'assess', 'Reward Member': 'reward', 'Set Goals': 'set-goals',
    'Coach Member': 'coach', 'Give Feedback': 'feedback',
  };
  const actionInsights = {};
  for (const [section, id] of Object.entries(actionKey)) {
    const rows = reportSection('Summary of Actions', section);
    actionInsights[id] = {
      description: rows.find((r) => r.kind === 'Section Description')?.text || '',
      bands: Object.fromEntries(rows.filter((r) => r.band).map((r) => [r.band, r.text])),
    };
  }
  const food = reportSection('Food For Thought');
  const questions = [];
  food.forEach((r) => {
    if (r.kind === 'Section Question') questions.push({ q: r.text, a: '' });
    if (r.kind === 'Section Answer' && questions.length) questions[questions.length - 1].a = r.text;
  });
  const takeaways = reportSection('Key Takeaways').filter((r) => r.kind !== 'Section Insight').map((r) => r.text);
  return {
    about: reportSection('About iLead', 'About iLead')[0]?.text || '',
    scoreScale: 3,
    competencies,
    objective,
    adaptability,
    styleDescriptions,
    styleInsights,
    consistency,
    actionInsights,
    foodForThought: questions,
    takeaways,
    sections: { competencies: true, objective: true, adaptability: true, styles: true, consistency: true, actions: true, foodForThought: true, takeaways: true },
  };
}

function buildActors() {
  return legacy.actors.map((a) => {
    const stats = {};
    for (const [stageName, v] of Object.entries(a.stats)) stats[stageId(stageName)] = { ...v };
    return {
      id: slug(a.name),
      name: a.name,
      pronoun: PRONOUN[a.name] || 'he',
      joined: a.joined || '',
      experience: a.experience || '',
      domain: a.domain || '',
      bio: a.bio === 'None.' ? '' : a.bio,
      pool: a.active ? 'team' : 'hire',
      startStage: stageId(a.startStage),
      stats,
    };
  });
}

function buildEvents() {
  return legacy.events.map((e) => ({
    id: slug(e.name),
    name: e.name,
    text: e.text,
    week: e.week,
    day: e.day || 1,
    impact: { ...e.impact },
    target: e.text.includes('{{actor}}') ? 'actor' : 'team',
    enabled: e.week > 0,
  }));
}

function buildTriggers() {
  return legacy.triggers.map((t) => {
    const rule = TRIGGER_RULES[t.name];
    return {
      id: slug(t.name),
      name: t.name,
      text: t.text,
      impact: { ...t.impact },
      enabled: true,
      rule: { kind: rule.kind, ...Object.fromEntries(Object.entries(rule).filter(([k]) => !['kind', 'maxOccurrences', 'effect'].includes(k))) },
      maxOccurrences: rule.maxOccurrences,
      effect: { unavailableDays: 0, leaves: false, ...rule.effect },
      windows: [...t.windows].sort((a, b) => a.week - b.week || a.day - b.day),
      legacyNote: t.rule,
    };
  });
}

export function createIleadDefinition() {
  const def = buildDefinition();
  def.meta.drafted = fillMissingInsights(def.report, def.leadership.styles.map((st) => st.id));
  for (const a of def.actors) {
    if (!a.bio) {
      a.bio = draftBio(a, def.leadership.highThreshold);
      def.meta.drafted.push(`bio:${a.id}`);
    }
  }
  return def;
}

function buildDefinition() {
  const ratios = { lead: 0.62, qualify: 0.5, proposal: 0.3, negotiate: 0.5, convert: 0.5 };
  return {
    schema: 1,
    meta: {
      templateId: 'ilead',
      templateVersion: '2.0.0',
      storyline: legacy.story.name,
      name: 'iLead: Sales Elevator',
      language: 'en',
      difficulty: 'standard',
      baseTarget: 45,
      acknowledged: [],
      assumptions: ASSUMPTIONS,
      findings: LEGACY_FINDINGS,
    },
    context: {
      industry: 'Elevators',
      originalIndustry: 'Elevators',
      entities: [
        { key: 'company', label: 'Company', value: 'Innov8 Elevators', hint: 'The learner joins this company' },
        { key: 'product', label: 'Product the team sells', value: 'Levo B10', hint: 'The team is measured on this product' },
        { key: 'learner_role', label: "Learner's role", value: 'Sales Director', hint: 'Shown in events and the welcome letter' },
        { key: 'ceo', label: 'Letter signatory', value: 'Roger Kent', hint: 'Signs the welcome letter' },
        { key: 'competitor', label: 'Main competitor', value: 'Uplift', hint: 'Poaches staff, rumoured acquirer' },
        { key: 'rival', label: 'Previous employer of a team member', value: 'Beta Elevators', hint: 'Used in one profile' },
        { key: 'product_2', label: 'Other product 1', value: 'Lofty S10', hint: 'Portfolio mention in the welcome letter' },
        { key: 'product_3', label: 'Other product 2', value: 'ArmTech V60', hint: 'Portfolio mention in the welcome letter' },
        { key: 'board_member', label: 'Board member in the news', value: 'Aaron King', hint: 'Insider trading event' },
        { key: 'lunch_venue', label: 'Team lunch venue', value: 'Westernizza', hint: 'Team lunch responses' },
        { key: 'category', label: 'What the product is', value: 'elevator', hint: 'A common noun, e.g. home loan, cloud platform' },
        { key: 'city', label: 'Home city', value: 'New York', hint: 'Where the team works; used in events' },
        { key: 'destination', label: 'Dream conference destination', value: 'Hawaii', hint: 'Used in the sales conference event' },
      ],
      boundTerms: ['elevator', 'high-rise', 'microprocessor', 'tablet PC'],
      profile: {
        orgName: 'Innov8 Elevators',
        industry: 'elevators',
        customIndustry: '',
        offeringType: 'product',
        offeringName: 'Levo B10',
        offeringCategory: 'elevator',
        customerType: 'b2b',
        country: 'US',
        customCountry: '',
        customRegion: 'anglo',
        customCurrency: 'USD',
        city: 'New York',
        learnerRole: 'Sales Director',
        depth: 'standard',
      },
      generated: {},
    },
    story: {
      welcome: legacy.story.welcome,
      overview: legacy.story.overview,
      target: legacy.story.target,
      briefing: legacy.briefing.slice(1),
      walkthrough: legacy.walkthrough.map((w) => ({ title: w.title, text: w.text })),
    },
    timeline: { weeks: 12, daysPerWeek: 5 },
    leadership: {
      styles: STYLES.map((s) => ({ ...s, definition: STYLE_DEFINITIONS[s.id] })),
      highThreshold: 70,
      rag: { red: 50, green: 70 },
      weeklyImpact: { 0: { s: 1, m: 3, p: 3 }, 1: { s: 0, m: -2, p: -2 }, 2: { s: -1, m: -4, p: -4 } },
    },
    stages: STAGE_IDS.map((id, i) => ({
      id,
      name: STAGE_NAMES[i],
      description: legacy.stages[i].description,
      conversion: ratios[id],
    })),
    funnel: {
      weeklyInflow: [200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 300],
      buffer: 20,
      capEfficiency: true,
      valuePerConversion: 50000,
      currency: 'USD',
      target: 45,
    },
    team: { maxSize: 12 },
    actors: buildActors(),
    actions: buildActions(),
    events: buildEvents(),
    triggers: buildTriggers(),
    randomness: {
      mismatchChance: 0.6,
      impactMin: 0.8,
      impactMax: 1.2,
      statBuffer: 6,
      eventStyleFactor: { 0: 0.5, 1: 1, 2: 1.5 },
      training: {
        0: [{ mm: 0, p: 0.8 }, { mm: 1, p: 0.1 }, { mm: 2, p: 0.1 }],
        1: [{ mm: 1, p: 0.6 }, { mm: 2, p: 0.3 }, { mm: 0, p: 0.1 }],
        2: [{ mm: 2, p: 0.6 }, { mm: 1, p: 0.3 }, { mm: 0, p: 0.1 }],
      },
    },
    report: buildReport(),
    delivery: { individual: true, group: true, leaderboard: true, lti: false, scorm: true, languages: ['en'] },
  };
}

export const ILEAD_TEMPLATE = {
  id: 'ilead',
  name: 'iLead',
  family: 'People leadership',
  tagline: 'Lead an under-performing team to target by reading each person and adapting your style.',
  skills: ['Adaptive leadership', 'Ability to motivate', 'Ability to upskill', 'Enabling performance', 'Drive for results'],
  audiences: ['First-time managers', 'Team leads', 'Mid-level managers', 'Sales managers'],
  duration: '45 to 90 minutes',
  storylines: [
    { id: 'sales-elevator-intl', name: 'Sales Elevator (International)', status: 'ready', note: 'Migrated from the legacy workbook' },
    { id: 'sales-elevator-india', name: 'Sales Elevator (India)', status: 'migrate', note: 'Content workbook needed' },
    { id: 'hr', name: 'HR team (India)', status: 'migrate', note: 'Content workbook needed' },
    { id: 'it-sales', name: 'IT Sales (India)', status: 'migrate', note: 'Content workbook needed' },
    { id: 'isecure', name: 'iSecure security solutions', status: 'migrate', note: 'Content workbook needed' },
    { id: 'banking-app', name: 'Banking mobile app (iLead PM)', status: 'migrate', note: 'Content workbook needed' },
  ],
  create: createIleadDefinition,
};

// Brings a definition saved by an earlier Studio version up to date without touching authored content.
export function migrateDefinition(def) {
  const fresh = createIleadDefinition();
  const d = def;
  for (const e of fresh.context.entities) if (!d.context.entities.some((x) => x.key === e.key)) d.context.entities.push({ ...e });
  if (!d.context.profile) {
    const val = (k) => d.context.entities.find((e) => e.key === k)?.value;
    d.context.profile = { ...fresh.context.profile, orgName: val('company'), offeringName: val('product'), learnerRole: val('learner_role') };
  }
  d.context.generated ||= {};
  d.meta.drafted = [...new Set([...(d.meta.drafted || []), ...fillMissingInsights(d.report, d.leadership.styles.map((st) => st.id))])];
  for (const a of d.actors) if (!a.bio) { a.bio = draftBio(a, d.leadership.highThreshold); d.meta.drafted.push(`bio:${a.id}`); }
  return d;
}
