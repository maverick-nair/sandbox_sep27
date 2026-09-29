// The development content behind the learner's report: the proficiency scale, and for every
// competency and every level, what that level looks like, what to keep doing, what to work on,
// a 70-20-10 development plan, a reflection question and recommended next learning. It follows
// common practice in leadership development reporting: behavioural anchors for each level, a
// view of the next level, evidence from what the learner did, and an individual development plan.
// Authors review and edit all of it in Report > Development content. Genie personalises the
// narrative from the learner's results; this content is the standard it works from, and what
// the learner sees when Genie is not available.

export const LEVELS = ['Novice', 'Emerging', 'Competent', 'Proficient', 'Role Model'];
const TIER = [0, 0, 1, 2, 2]; // Novice and Emerging share developing content, Proficient and Role Model share strong content

const C = {
  upskill: {
    definition: "Identifying, developing and using each team member's skills to accomplish goals.",
    why: "Teams outgrow a leader who does the work for them. Leaders who build capability multiply their own impact and keep performance up when conditions change.",
    tiers: [
      { looksLike: 'Treats skill gaps as fixed, or as the person’s own problem. Development happens by accident and training is rare or badly timed, so capability stays where it started.', keep: 'Noticing when someone is struggling with the work in front of them.', workOn: 'Diagnosing each person’s skill for the specific task, and matching support to the gap: instruction for the new, practice for the developing, stretch for the capable.', on70: 'Pick one person whose skill limits the team’s results. Agree one skill to build over 30 days and give them real work that uses it, with a check-in each week.', social20: 'Ask a peer known for developing people how they decide who to train and when. Ask your own manager for feedback on how you teach and delegate.', formal10: 'Learn a simple skill-diagnosis and on-the-job coaching model, and practise it in short sessions.', reflect: 'Whose skill gap is costing the team most right now, and what have you done about it this month?' },
      { looksLike: 'Recognises skill gaps and acts on some of them. Support is often generic rather than matched to the person and the task, so gains are uneven across the team.', keep: 'Using training and coaching as regular tools rather than rescue measures.', workOn: 'Timing: developing people before the gap shows up in results, and following up so learning turns into changed performance.', on70: 'Build a simple skills map of your team against the stages of your work. Stretch two people into harder assignments this quarter, each with a clear success measure.', social20: 'Pair a strong performer with a developing colleague on live work, and review what both learned.', formal10: 'Deepen your coaching practice: questioning, observation and feedback on specific skills.', reflect: 'Which of your team’s skills will matter most in six months, and who is building them now?' },
      { looksLike: 'Knows each person’s capabilities in detail and develops and deploys them deliberately. Development is timely and continuous, and capability rises along with results.', keep: 'Reading skill task by task and investing ahead of need.', workOn: 'Scaling the practice: building the team’s ability to develop each other, and growing successors for key roles.', on70: 'Hand a development responsibility to one of your strongest people, such as onboarding a new joiner, and coach them on how they coach.', social20: 'Mentor a less experienced manager on how you diagnose and develop skill.', formal10: 'Explore talent review and succession practice so your approach works beyond your own team.', reflect: 'If you left tomorrow, who could lead this team, and what would they still need to learn?' },
    ],
    products: [{ line: 'Educate', product: 'AI Microlearn', text: 'Five-minute lessons on diagnosing skill and coaching on the job.' }, { line: 'Enable', product: 'AI Koach', text: 'Plan your next development conversation with each person, with a coach who asks the hard questions.' }],
  },
  motivate: {
    definition: 'Inspiring, energising and empowering team members to give their best.',
    why: 'Morale drives discretionary effort, retention and resilience. Leaders who understand what energises each person keep performance up when the work gets hard.',
    tiers: [
      { looksLike: 'Relies on targets, pressure or generic gestures. Recognition is rare or poorly timed, and signs of low morale are missed until people disengage or leave.', keep: 'Caring about how the team is doing, even when it does not yet show in your actions.', workOn: 'Learning what motivates each person, and responding to morale signals early.', on70: 'Hold a short one-to-one with each team member this month about them alone: what energises them, what drains them and what they want next. Act on one thing for each.', social20: 'Ask a trusted colleague how your mood and messages land with your team.', formal10: 'Learn the drivers of motivation (autonomy, mastery, purpose and recognition) and how to use them in everyday conversations.', reflect: 'Who on your team is quietly losing energy, and what would they say if you asked them directly?' },
      { looksLike: 'Understands the team’s needs reasonably well and uses recognition and support, but unevenly or at the wrong moments.', keep: 'Recognising good work and checking in on how people feel.', workOn: 'Timing and specificity: recognition soon after the work, about the specific behaviour, and support before morale drops.', on70: 'For four weeks, recognise one specific contribution each week in front of the team, and note the effect.', social20: 'Ask your team in a retrospective what helps them do their best work and what gets in the way.', formal10: 'Practise difficult motivational conversations, such as re-engaging a disengaged high performer, in role-play.', reflect: 'When did you last recognise someone for effort, not only for results?' },
      { looksLike: 'Reads what each person needs and chooses the right approach to energise them. The team is committed and resilient, and people stay.', keep: 'Individual recognition and genuine interest in each person’s goals.', workOn: 'Sustaining energy through setbacks, and building a climate that motivates without you in the room.', on70: 'Involve the team in shaping how a hard target will be met, so the plan is theirs.', social20: 'Share what works for you with other leaders, and learn how they sustain energy through change.', formal10: 'Explore how to measure team climate and engagement, and how to act on the results.', reflect: 'What would keep your team motivated through a quarter where everything goes wrong?' },
    ],
    products: [{ line: 'Experience', product: 'AI RolePlay', text: 'Rehearse re-engaging a disengaged team member with an AI colleague who reacts like a real person.' }, { line: 'Educate', product: 'AI Microlearn', text: 'Quick lessons on recognition and the drivers of motivation.' }],
  },
  enable: {
    definition: 'Creating the conditions (roles, resources, clarity and freedom from obstacles) in which people perform at their best.',
    why: 'Most performance problems are system problems. Leaders who fix roles, bottlenecks and priorities multiply the effort their people already give.',
    tiers: [
      { looksLike: 'Focuses on individual effort and misses what the environment is doing to performance. Bottlenecks, unclear roles and poor fit between people and roles persist.', keep: 'Wanting the team to perform.', workOn: 'Looking at the system: where work gets stuck, whether people are in the right roles and what gets in their way.', on70: 'Map how work flows through your team and find the stage where it piles up. Fix one cause this month: a skill gap, a capacity gap or a role mismatch.', social20: 'Ask each team member what slows them down most. Remove at least one obstacle and tell them you did.', formal10: 'Learn basic work-flow and bottleneck analysis, and how to set clear roles and priorities.', reflect: 'What in the way your team is organised makes good performance harder than it needs to be?' },
      { looksLike: 'Improves the environment in places, such as clarifying goals or adjusting roles, but not consistently, and sometimes only after the problem has cost results.', keep: 'Setting goals and clarifying expectations.', workOn: 'Anticipating: spotting the next bottleneck before it forms and matching people to the roles where they perform best.', on70: 'Review each role against the person in it every month. Reassign or reshape one role where the fit is poor.', social20: 'Invite a colleague from another team to review how your team’s work flows and suggest one change.', formal10: 'Learn goal-setting and prioritisation methods that connect individual goals to team results.', reflect: 'If you could redesign one role on your team from scratch, which would it be, and why?' },
      { looksLike: 'Creates an environment where people know what matters, have what they need and are in the right roles. Performance rises and stays high.', keep: 'Removing obstacles early and designing roles around strengths.', workOn: 'Building the team’s own ability to spot and fix problems in how work gets done.', on70: 'Give the team ownership of one process improvement each quarter, with you as sponsor rather than solver.', social20: 'Coach another manager through a team redesign or a bottleneck problem.', formal10: 'Explore operating model and organisation design practice.', reflect: 'What would your team change about how it works if you gave it full permission?' },
    ],
    products: [{ line: 'Enable', product: 'AI Koach', text: 'Work through your real team’s bottleneck and agree the one change that matters most.' }, { line: 'Educate', product: 'Interactive Learn', text: 'An interactive module on goals, roles and removing obstacles.' }],
  },
  adapt: {
    definition: "Reading each person's skill and morale for the task at hand, and adapting leadership style as they change.",
    why: 'No single style works for everyone, or for long. Leaders who diagnose and flex keep each person growing, and avoid both micromanaging experts and abandoning beginners.',
    tiers: [
      { looksLike: 'Uses one or two familiar styles with everyone. Style choices often miss what the person needs, so skill and morale move the wrong way.', keep: 'Having a style that works in some situations.', workOn: 'Diagnosing before acting: reading skill and morale separately, for the specific task, every time.', on70: 'Before each one-to-one this month, write down your read of the person’s skill and morale for their current task and the style it calls for. Afterwards, note whether it landed.', social20: 'Ask two team members how they prefer to be led on a new task and on a familiar one, and compare that with what you actually do.', formal10: 'Learn a situational leadership model and practise diagnosing with case examples.', reflect: 'Which person on your team would say you lead them the same way whatever they are working on?' },
      { looksLike: 'Adapts style to the person some of the time. Reads skill better than morale, or the other way round, and sometimes keeps a style after the person has moved on.', keep: 'Changing approach when something is clearly not working.', workOn: 'Noticing change: re-diagnosing as skill and morale move, and letting go of Directing and Guiding as people grow.', on70: 'For each team member, note the style you used this week and the style they needed. Review weekly for a month and close the biggest gap.', social20: 'Ask your manager to observe one of your team meetings and give feedback on how you flexed.', formal10: 'Practise switching style in simulated conversations with different kinds of team member.', reflect: 'Who on your team has grown this quarter, and have you changed how you lead them?' },
      { looksLike: 'Diagnoses accurately and moves fluidly between styles as people and situations change. People get what they need, when they need it.', keep: 'Accurate diagnosis and timely changes of style.', workOn: 'Making your intent visible: explaining why you lead each person as you do, so they can ask for what they need.', on70: 'Teach your team the skill and morale model and ask them to tell you which style they need on each task.', social20: 'Coach another manager on diagnosing and flexing style.', formal10: 'Extend your adaptability to stakeholders and peers, not only direct reports.', reflect: 'When did adapting your style most change someone’s performance, and what did you notice first?' },
    ],
    products: [{ line: 'Experience', product: 'Simulations', text: 'Replay this simulation on Challenging, where the wrong style lands harder.' }, { line: 'Experience', product: 'AI RolePlay', text: 'Practise switching style across different kinds of team member.' }],
  },
  results: {
    definition: "Ensuring goal achievement by managing the team's effort, time and spend effectively.",
    why: 'Leadership is judged on outcomes as well as on how people feel. Leaders who connect daily choices to business results deliver, quarter after quarter.',
    tiers: [
      { looksLike: 'Loses sight of the target in day-to-day activity. Effort is spread thin, the pace needed is unclear and results fall well short.', keep: 'Wanting to deliver for the business.', workOn: 'Knowing your numbers: the target, the pace needed each week and the few activities that drive it.', on70: 'Track the one number that matters most every week with your team, and agree the actions that will move it.', social20: 'Ask a high-performing peer how they plan a quarter and review progress.', formal10: 'Learn the basics of your team’s commercial model: revenue, margin, cost, and how your decisions affect them.', reflect: 'Which of your activities last week moved the result, and which only felt busy?' },
      { looksLike: 'Keeps the goal in view and makes progress, but reacts late when the pace slips and spends time and money where the return is uncertain.', keep: 'Focus on the target and regular progress reviews.', workOn: 'Acting early on leading indicators, and weighing the cost of actions against their return.', on70: 'Set a weekly pace check with a clear trigger: if the team is more than 10% behind, change one thing that week.', social20: 'Review your quarter’s decisions with your manager: which paid back, and which did not.', formal10: 'Learn simple business-case thinking for people decisions such as training, hiring and rewards.', reflect: 'What is the earliest signal that your quarter is going off track, and are you watching it?' },
      { looksLike: 'Delivers or beats the target by aligning people, time and spend with what drives results, and keeps the team healthy while doing it.', keep: 'Clear focus on the few things that drive results, with discipline about cost and pace.', workOn: 'Raising the ambition: stretching targets sustainably and sharing the playbook with others.', on70: 'Lead a cross-team initiative with a measurable business outcome.', social20: 'Mentor a colleague who struggles to connect people decisions with results.', formal10: 'Explore strategy and business planning beyond your own team.', reflect: 'How would you deliver 20% more next quarter without burning out the team?' },
    ],
    products: [{ line: 'Enable', product: 'AI Koach', text: 'Build your quarter plan and a weekly pace check with a coach who asks the hard questions.' }, { line: 'Evaluate', product: 'Nano AI', text: 'A short assessment of your commercial judgement to target your next step.' }],
  },
};

export function defaultDevelopment() {
  const competencies = Object.fromEntries(Object.entries(C).map(([id, c]) => [id, {
    definition: c.definition,
    why: c.why,
    levels: Object.fromEntries(LEVELS.map((l, i) => [l, { ...c.tiers[TIER[i]] }])),
    products: c.products.map((p) => ({ ...p })),
  }]));
  return {
    personalise: true,
    guidance: 'Write in the second person, warmly and directly, like an experienced leadership coach. Be specific about what the learner did, balance strengths with development, and never judge the person, only the behaviour in the simulation.',
    purpose: 'This report is for your development. It describes how you led in the simulation, not who you are, and it is most useful as the start of a conversation with your manager or coach.',
    method: 'Scores come from what you did: the style you chose for each person each week, the actions you took and how they landed, the decisions you made and the results your team achieved.',
    scale: [
      { label: 'Novice', min: 0, max: 2, definition: 'Beginning to show the competency. Behaviour is inconsistent and often misses what the situation needs.' },
      { label: 'Emerging', min: 2, max: 4, definition: 'Shows the competency in simple situations. Needs structure and support to apply it reliably.' },
      { label: 'Competent', min: 4, max: 6, definition: 'Applies the competency reliably in familiar situations. The next step is consistency under pressure and change.' },
      { label: 'Proficient', min: 6, max: 8, definition: 'Applies the competency skilfully across varied situations and achieves strong outcomes.' },
      { label: 'Role Model', min: 8, max: 10, definition: 'Demonstrates the competency at a level others learn from, consistently and in complex situations.' },
    ],
    competencies,
    coaching: [
      'What surprised you most about how your team responded to you?',
      'Which decision would you make differently, and what would you do instead?',
      'Where do you see the same patterns in how you lead your real team?',
      'Which development priority matters most for your role in the next 90 days, and why?',
      'What support do you need, and how will we both know it is working?',
    ],
    idp: {
      horizon: 90,
      intro: 'Turn your two development priorities into a plan. Keep each goal specific and measurable, and review it with your manager or coach at 30, 60 and 90 days.',
    },
  };
}

// Fills whatever an older definition is missing, keeping the author's text.
export function upgradeDevelopment(report) {
  const std = defaultDevelopment();
  const d = report.development;
  if (!d) { report.development = std; return report; }
  for (const k of ['personalise', 'guidance', 'purpose', 'method', 'scale', 'coaching', 'idp']) if (d[k] === undefined) d[k] = std[k];
  d.competencies ||= {};
  for (const [id, c] of Object.entries(std.competencies)) {
    const own = (d.competencies[id] ||= c);
    own.levels ||= c.levels;
    for (const l of LEVELS) own.levels[l] = { ...c.levels[l], ...(own.levels[l] || {}) };
    own.products ||= c.products;
    own.definition ??= c.definition;
    own.why ??= c.why;
  }
  return report;
}
