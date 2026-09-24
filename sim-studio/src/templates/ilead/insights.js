// Drafts report insights the legacy content never wrote.
// The legacy workbook has "NO STRING AVAILABLE" for Low use / High accuracy under every style:
// the case where a learner rarely used a style but was right each time. It is a real outcome
// (two correct uses of Guiding in a whole run lands there), so the report needs words for it.
// Drafts are built from what each style is for, in the same voice as the neighbouring cells.

const NEED = {
  directing: { need: 'detailed instructions and hand-holding', act: 'give clear, step-by-step direction' },
  guiding: { need: 'guidance and encouragement to buy in', act: 'offer active guidance and seek their buy-in' },
  partnering: { need: 'to be involved and supported in decisions', act: 'involve and encourage them' },
  entrusting: { need: 'room to take responsibility on their own', act: 'hand over responsibility and step back' },
};

const USE_TEXT = {
  Low: (s, n) => `You used the '{{style}}' style far less often than your team members needed it.`,
  Moderate: (s, n) => `You used the '{{style}}' style, but not as often as your team members needed it.`,
  High: (s, n) => `You used the '{{style}}' style as often as, or more often than, your team members needed it.`,
};
const ACC_TEXT = {
  Low: (n) => `When you did use it, it often did not fit what the person needed. Read skill and morale more carefully before you ${n.act}.`,
  Moderate: (n) => `When you did use it, it fitted some of the time. Check whether the person really needs ${n.need} before you ${n.act}.`,
  High: (n) => `Every time you used it, it was the right call, which shows you can spot when someone needs ${n.need}. Look for more of those moments: several team members needed you to ${n.act} and did not get it.`,
};

export function draftStyleInsight(styleId, use, accuracy) {
  const n = NEED[styleId] || { need: 'this approach', act: 'use it' };
  if (use === 'High' && accuracy === 'High') return `You used the '{{style}}' style to a sufficient extent and it fitted your team members' needs almost every time. Keep reading each person before you ${n.act}.`;
  const tail = use === 'High' && accuracy === 'High' ? '' : ACC_TEXT[accuracy](n);
  return `${USE_TEXT[use](styleId, n)} ${tail}`.trim();
}

const MISSING = /NO STRING AVAILABLE/i;
export const isMissing = (text) => !text || !String(text).trim() || MISSING.test(text);

// Fills every empty style insight cell; returns the cells it drafted, e.g. "guiding:LowUseHighAccuracy".
export function fillMissingInsights(report, styleIds) {
  const drafted = [];
  for (const id of styleIds) {
    report.styleInsights[id] ||= {};
    for (const use of ['Low', 'Moderate', 'High']) {
      for (const acc of ['Low', 'Moderate', 'High']) {
        const key = `${use}Use${acc}Accuracy`;
        if (isMissing(report.styleInsights[id][key])) {
          report.styleInsights[id][key] = draftStyleInsight(id, use, acc);
          drafted.push(`${id}:${key}`);
        }
      }
    }
  }
  return drafted;
}

// Drafts a background for a team member the legacy content left blank ("None."),
// from what the data already says: experience, domain skills, and skill and morale in their stage.
export function draftBio(actor, high = 70) {
  const first = actor.name.split(' ')[0];
  const st = actor.stats[actor.startStage] || { s: 50, m: 50 };
  const domains = String(actor.domain || '').split(',').map((d) => d.trim()).filter(Boolean);
  const exp = actor.experience && !/^none/i.test(actor.experience) ? `${actor.experience} of experience` : 'some experience';
  const where = domains.length ? ` in ${domains.slice(0, 2).join(' and ')}` : '';
  const skill = st.s >= high ? `${first} knows the work thoroughly and is often the person colleagues ask for help.` : `${first} is still building confidence in the role and sometimes needs a steer on the details.`;
  const morale = st.m >= high ? 'Keen, energetic and ready to take on more.' : 'Lately seems flat and less engaged than before.';
  return `${first} has ${exp}${where}. ${skill} ${morale}`;
}
