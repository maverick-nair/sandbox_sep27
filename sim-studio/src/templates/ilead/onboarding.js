// The learner's prologue: chapters that set the scene before any decision. Each chapter kind
// draws on content the author already has (the product brief, the CEO letter, the stages, the
// team, the leadership model); the author sets titles, lead lines, fact cards and extra chapters.
// Text uses context fields, so it follows every tailoring and is translatable.

export const CHAPTER_KINDS = {
  company: { label: 'The organization', note: 'The product brief and fact cards about the business.' },
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
      {
        id: 'company', kind: 'company', enabled: true, title: 'Welcome to {{company}}',
        lead: 'Before you meet anyone, here is the business you are joining.',
        facts: [
          { label: 'What we sell', value: '{{product}}, our newest {{category}}, alongside {{product_2}} and {{product_3}}' },
          { label: 'Who we are up against', value: '{{competitor}} in the market and {{rival}} for talent' },
          { label: 'Where you are based', value: '{{city}}' },
        ],
      },
      { id: 'mission', kind: 'mission', enabled: true, title: 'Your mission', lead: 'A letter from {{ceo}}, arrived this morning.' },
      { id: 'flow', kind: 'flow', enabled: true, title: 'How the work flows', lead: 'Every sale passes through your team, stage by stage. Conversions come out of the last stage, so a stage that gets stuck starves every stage after it.' },
      { id: 'team', kind: 'team', enabled: true, title: 'Meet your team', lead: 'Turn over each card to learn who they are. Read closely: how you lead each person decides how they perform.' },
      { id: 'model', kind: 'model', enabled: true, title: 'How to lead them', lead: 'There is no single right way to lead. It depends on each person’s skill and morale for the work in front of them, and both change over time.' },
      { id: 'howto', kind: 'howto', enabled: true, title: 'How the simulation works', lead: 'Your quarter runs week by week. Here is the rhythm, and how you will be judged.' },
    ],
  };
}

export function newChapter(id) {
  return { id, kind: 'custom', enabled: true, title: 'A new chapter', lead: '', body: '' };
}
