// The learner's prologue: chapters that set the scene before any decision. Each chapter kind
// draws on content the author already has (the product brief, the CEO letter, the stages, the
// team, the leadership model); the author sets titles, lead lines, fact cards and extra chapters.
// Text uses context fields, so it follows every tailoring and is translatable.

export const CHAPTER_KINDS = {
  welcome: { label: 'Welcome', note: "The CEO's portrait and welcome letter." },
  company: { label: 'The organization', note: 'Logo, scene and fact cards about the business.' },
  product: { label: 'The product', note: 'The product image and its story.' },
  targets: { label: 'Your targets', note: 'Revenue, conversions and their value, team goals, duration and time limit.' },
  mission: { label: 'Your mission', note: "The CEO's letter, the target, the weeks and the team size." },
  flow: { label: 'How the work flows', note: 'The stages work passes through, with what each one does.' },
  team: { label: 'Meet your team', note: 'Face-down profile cards the learner turns over.' },
  model: { label: 'How to lead them', note: 'The skill and morale grid, the four styles and a practice round.' },
  howto: { label: 'How the simulation works', note: 'The weekly rhythm, how time and actions work, and how the score is made.' },
  custom: { label: 'Your own chapter', note: 'Any text you want learners to read, such as the client’s values or a word from a sponsor.' },
};

export function defaultOnboarding() {
  return {
    enabled: true,
    teamToMeet: 3,
    practice: true,
    tour: true,
    chapters: [
      { id: 'welcome', kind: 'welcome', enabled: true, title: 'Welcome', lead: 'A letter from {{ceo}}, your CEO, arrived this morning.' },
      {
        id: 'company', kind: 'company', enabled: true, title: 'Welcome to {{company}}',
        lead: 'Before you meet anyone, here is the business you are joining.',
        body: 'We are {{company}}, based in {{city}}. We compete with {{competitor}} for customers and with {{rival}} for talent, and this year depends on how well we sell {{product}}.',
        facts: [
          { label: 'What we sell', value: '{{product}}, alongside {{product_2}} and {{product_3}}' },
          { label: 'Who we are up against', value: '{{competitor}} in the market and {{rival}} for talent' },
          { label: 'Where you are based', value: '{{city}}' },
        ],
      },
      { id: 'product', kind: 'product', enabled: true, title: 'About {{product}}', lead: 'The product your team sells, and why it matters this year.' },
      { id: 'targets', kind: 'targets', enabled: true, title: 'Your targets', lead: 'This is what the board expects from you by the end of the quarter.' },
      { id: 'team', kind: 'team', enabled: true, title: 'Meet your team', lead: 'Turn over each card to learn who they are. Read closely: how you lead each person decides how they perform.' },
      { id: 'model', kind: 'model', enabled: true, title: 'How to lead them', lead: 'There is no single right way to lead. It depends on each person’s skill and morale for the work in front of them, and both change over time.' },
      { id: 'howto', kind: 'howto', enabled: true, title: 'How the simulation works', lead: 'Your quarter runs week by week. Here is the rhythm, and how you will be judged.' },
    ],
  };
}

// Brings a briefing saved before the welcome, product and targets chapters up to date,
// keeping the author's own chapters, order and text.
export function upgradeOnboarding(ob) {
  if (!ob?.chapters) return ob;
  const have = new Set(ob.chapters.map((c) => c.kind));
  const std = defaultOnboarding().chapters;
  const add = (kind, afterKinds) => {
    if (have.has(kind) || (kind === 'welcome' && have.has('mission'))) return;
    const c = std.find((x) => x.kind === kind);
    let at = -1;
    for (const k of afterKinds) { const i = ob.chapters.findIndex((x) => x.kind === k); if (i >= 0) at = Math.max(at, i); }
    ob.chapters.splice(at + 1, 0, JSON.parse(JSON.stringify(c)));
    have.add(kind);
  };
  add('welcome', []);
  add('product', ['welcome', 'mission', 'company']);
  add('targets', ['product', 'welcome', 'mission', 'company']);
  return ob;
}

export function newChapter(id) {
  return { id, kind: 'custom', enabled: true, title: 'A new chapter', lead: '', body: '' };
}
