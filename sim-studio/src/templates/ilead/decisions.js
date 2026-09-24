// iLead decision moments: situations the learner meets inside the quarter, written with context
// tokens so they follow every tailoring ({{company}}, {{ceo}}, {{product}}, {{competitor}} and the
// team member the moment is about). Default mix: 7 structured to 3 open (70:30).
import { DEFAULT_KPIS, mixOf, slotsOf, INTERACTION_TYPES } from '../../engine/decisions.js';
import { suggestCriteria, draftKeyIdeas } from '../../engine/nlp.js';

export const CONCEPTS = {
  diagnose: { label: 'Reading people before acting', competency: 'adapt' },
  'match-style': { label: 'Matching your style to skill and morale', competency: 'adapt' },
  feedback: { label: 'Giving specific, supportive feedback', competency: 'upskill' },
  prioritise: { label: 'Fixing the real bottleneck', competency: 'enable' },
  recognise: { label: 'Recognising good work at the right time', competency: 'motivate' },
  stakeholder: { label: 'Managing up with a clear plan', competency: 'results' },
  conflict: { label: 'Handling conflict fairly', competency: 'enable' },
  delegate: { label: 'Giving experienced people ownership', competency: 'motivate' },
};

const S = (id, text, extra = {}) => ({ id, text, style: id, ...extra });

export const DEFAULT_POINTS = [
  {
    id: 'first-priority', title: 'Your first week', week: 1, day: 1, channel: 'email', from: { entity: 'ceo' }, type: 'scenario', level: 1, concept: 'diagnose', concepts: ['adapt'],
    situation: 'Welcome aboard. The board wants to see momentum on {{product}} this quarter. Before you change anything, tell me: what will you focus on in your first week?',
    prompt: 'How do you reply to {{ceo}}?',
    options: [
      { id: 'one-to-ones', text: "Spend the week in one-to-ones to understand each person's skills, motivation and pipeline.", quality: 90, reaction: 'Sensible. Understand the team first, but I will want a plan by the end of week two.', feedback: 'Diagnosis comes first: you cannot choose a style for someone you have not read.', consequences: { kpis: { trust: 6, ceo: 1 }, flags: ['listened-first'] } },
      { id: 'new-targets', text: 'Announce stretch targets and a daily stand-up so everyone knows the bar has moved.', quality: 40, reaction: "Bold. Let's see whether the team comes with you.", feedback: 'Setting the bar before you know the team treats everyone the same. Some will need direction; others will resent it.', consequences: { kpis: { ceo: 4, trust: -5 }, team: { m: -3 }, flags: ['pushed-targets'], delayed: [{ weeks: 2, title: 'Stand-up fatigue', text: 'The daily stand-up has become a box-ticking exercise. Two people quietly stopped preparing for it.', team: { m: -2 }, kpis: { trust: -2 } }] } },
      { id: 'star-players', text: 'Focus on the top performers, since they will deliver most of the numbers.', quality: 50, reaction: "Our stars matter. Don't lose the rest of the team though.", feedback: 'Top performers need the least from you. The biggest gains usually sit with the people who are struggling.', consequences: { kpis: { ceo: 2, trust: -2 } } },
      { id: 'observe', text: 'Stay in the background for two weeks and observe before deciding anything.', quality: 30, reaction: 'Two weeks is a long time in this market. I expected more urgency.', feedback: 'Observing is part of diagnosis, but leaving the team without direction lets problems grow.', consequences: { kpis: { ceo: -6 } } },
    ],
    recall: [{ q: 'Before choosing how to lead someone, what do you need to know about them?', options: [{ id: 'a', text: 'Their skill and their morale for the task' }, { id: 'b', text: 'How long they have been with the company' }, { id: 'c', text: 'Whether they are a top performer' }], answer: 'a', explain: 'The style that fits depends on skill and morale for the task in front of them.' }],
  },
  {
    id: 'kent-checkin', title: '{{actor}} is frustrated', week: 1, day: 3, channel: 'chat', from: { actor: 'kent-goldberg' }, about: 'kent-goldberg', type: 'single', level: 1, concept: 'match-style', concepts: ['adapt'],
    situation: "Honestly? I'm not sure why I bother. I made forty calls last week and got nowhere. Nobody ever showed me how the new lead lists work.",
    prompt: 'How will you respond to {{actor}}?',
    options: [
      S('directing', 'Sit with {{him}} tomorrow morning, go through the lead list step by step, and check in at the end of each day.'),
      S('guiding', 'Explain why the lead lists matter, give a few pointers and ask {{him}} to come back if {{he}} gets stuck.'),
      S('partnering', 'Ask {{him}} how {{he}} would like to approach it and agree a plan together.'),
      S('entrusting', 'Tell {{him}} {{he}} knows the job and leave {{him}} to work it out.'),
    ],
    outcomes: {
      strong: { reaction: 'OK. That would actually help. Nine o\'clock?', feedback: '{{actor}} needed {{style}}: clear steps and close support. As skill builds, you can loosen your grip.', consequences: { actor: { s: 4, m: 6, p: 3 }, kpis: { trust: 2 } } },
      mixed: { reaction: "I suppose. I'll give it a go.", feedback: 'Closer, but {{actor}} needed {{style}}. {{He}} is missing know-how as well as motivation.', consequences: { actor: { m: 1 } } },
      weak: { reaction: 'Right. Thanks, I guess.', feedback: '{{actor}} needed {{style}}. Leaving {{him}} to work it out assumes skill {{he}} does not have yet.', consequences: { actor: { m: -4, p: -2 }, kpis: { trust: -2 } } },
    },
  },
  {
    id: 'beth-first-1to1', title: 'First one-to-one with {{actor}}', week: 2, day: 2, channel: 'meeting', from: { actor: 'beth-killiney' }, about: 'beth-killiney', type: 'open', level: 1, concept: 'match-style', concepts: ['adapt', 'motivate'],
    situation: '{{actor}} joined from {{rival}} three months ago. {{He}} is enthusiastic and full of ideas, but {{his}} pipeline is thin and {{he}} is still learning how {{company}} sells {{product}}. This is your first one-to-one with {{him}}.',
    prompt: 'Write what you will say to open the conversation, and what you will agree with {{him}} by the end.',
    open: {
      minWords: 25,
      criteria: suggestCriteria({ concept: 'match-style' }),
      keyIdeas: [
        { label: 'Recognise {{his}} energy and ideas', terms: ['energy', 'enthusias', 'ideas', 'great start', 'appreciate', 'glad', 'welcome'] },
        { label: 'Explain how {{company}} sells and why', terms: ['explain', 'show you', 'why', 'how we', 'process', 'approach', 'walk you through'] },
        { label: 'Ask about {{his}} goals or the support {{he}} needs', terms: ['goal', 'what do you', 'support', 'help you', 'need from me', 'unsure', 'how can i'] },
        { label: 'Agree concrete next steps and a check-in', terms: ['next step', 'agree', 'plan', 'check in', 'check-in', 'friday', 'this week', 'follow up', 'meet again'] },
      ],
      modelAnswer: "It's great to have your energy on the team, and your ideas from your last role are welcome. I want to help you turn them into results here, so let me explain how we qualify leads for {{product}} and why we do it that way. What goals do you have for this quarter, and where do you feel least sure? Let's agree two things to focus on this week, and we'll check in on Friday to see how it went.",
    },
    outcomes: {
      strong: { reaction: "This is really helpful. I didn't know half of that. See you Friday!", feedback: 'High morale with low skill calls for Guiding: explain and encourage, and keep the energy.', consequences: { actor: { s: 5, m: 3, p: 3 }, kpis: { trust: 3 } } },
      mixed: { reaction: 'Thanks. I think I know what to do... mostly.', feedback: '{{actor}} has the energy; what {{he}} needs is explanation and a clear next step.', consequences: { actor: { s: 2 } } },
      weak: { reaction: "OK. I'll keep doing what I did at {{rival}} then.", feedback: 'Enthusiasm without know-how fades if nobody explains the way things work here.', consequences: { actor: { m: -3, p: -2 }, kpis: { trust: -1 } } },
    },
    alt: { type: 'scenario', options: [
      { id: 'guide', text: 'Recognise {{his}} energy, explain how {{company}} sells {{product}} and why, and agree two things to focus on this week.', quality: 90 },
      { id: 'targets', text: 'Give {{him}} a call target for the week and ask for a daily report.', quality: 40 },
      { id: 'freedom', text: 'Tell {{him}} to keep using the approach from {{rival}}; it clearly works for {{him}}.', quality: 20 },
    ] },
  },
  {
    id: 'pipeline-stuck', title: 'Work is piling up in Qualify', week: 3, day: 1, channel: 'dashboard', from: { name: 'Sales dashboard', role: 'Weekly numbers' }, type: 'multi', maxSelect: 3, level: 2, concept: 'prioritise', concepts: ['enable', 'results'],
    situation: 'The weekly dashboard shows work piling up in Qualify: plenty of leads are coming in, but few move on to Proposal. {{ceo}} has flagged it in the leadership meeting.',
    prompt: 'Which of these will you do this week? Choose up to three.',
    options: [
      { id: 'coach-qualifiers', text: 'Coach the people in Qualify on what a good lead looks like', correct: true, consequences: { team: { s: 1 } } },
      { id: 'move-strong', text: 'Move a strong performer into Qualify for a few weeks', correct: true },
      { id: 'lead-quality', text: 'Review lead quality with marketing so fewer poor leads arrive', correct: true },
      { id: 'more-calls', text: 'Tell everyone to make more calls', correct: false, consequences: { team: { m: -2 } } },
      { id: 'name-shame', text: "Share each person's numbers in the team meeting to create pressure", correct: false, consequences: { team: { m: -4 }, kpis: { trust: -4 } } },
      { id: 'lower-target', text: 'Ask {{ceo}} to lower the target', correct: false, consequences: { kpis: { ceo: -5 } } },
    ],
    outcomes: {
      strong: { reaction: "Good. Let's see Qualify move by next week.", feedback: 'A bottleneck is fixed where it forms: build skill in the stage, add capacity and improve what flows into it.', consequences: { team: { p: 2 }, kpis: { ceo: 3 }, flags: ['fixed-bottleneck'] } },
      mixed: { reaction: 'Some of that will help.', feedback: 'Part of the answer. Pressure and targets do not unblock a stage; skill, capacity and input quality do.', consequences: { team: { p: 1 } } },
      weak: { reaction: 'That is not going to unblock Qualify.', feedback: 'More effort everywhere does not fix one stuck stage. Look at skill, capacity and the quality of what comes in.', consequences: { kpis: { ceo: -3 } } },
    },
  },
  {
    id: 'meeting-agenda', title: 'Your first team meeting', week: 4, day: 2, channel: 'meeting', from: { name: 'Team meeting', role: 'Whole team, 30 minutes' }, type: 'rank', level: 2, concept: 'recognise', concepts: ['motivate'],
    situation: 'You have 30 minutes with the whole team. Morale is mixed and there are a few wins nobody has celebrated yet.',
    prompt: 'Put your agenda in order, from first to last.',
    options: [
      { id: 'wins', text: "Recognise this week's wins by name", rank: 0 },
      { id: 'blockers', text: 'Ask what is getting in the way and agree fixes', rank: 1 },
      { id: 'training', text: 'Walk through the new {{product}} features', rank: 2 },
      { id: 'board', text: "Pass on the board's pressure about the numbers", rank: 3 },
    ],
    outcomes: {
      strong: { reaction: 'The room lifts when you start with the wins. People stay after to keep talking.', feedback: 'Recognition first, problems second, information third, pressure last: people hear hard news better once they feel seen.', consequences: { team: { m: 3 }, kpis: { trust: 3 } } },
      mixed: { reaction: 'A useful meeting, if a little flat.', feedback: 'Open with recognition. It sets the tone for everything that follows.', consequences: { team: { m: 1 } } },
      weak: { reaction: "Starting with the board's pressure sets the tone. The rest of the meeting is quiet.", feedback: 'Leading with pressure makes people defensive. Start with what went well.', consequences: { team: { m: -3 }, kpis: { trust: -2 } } },
    },
  },
  {
    id: 'lead-dispute', title: 'Two people want the same lead', week: 5, day: 1, channel: 'chat', from: { name: 'Team chat', role: '{{company}} sales' }, about: 'justin-keel', about2: 'derick-kaynes', type: 'scenario', level: 2, concept: 'conflict', concepts: ['enable'],
    situation: '{{actor}} and {{actor2}} both claim the same large lead. {{actor}} found it first, but {{actor2}} has the relationship with the buyer. The argument has spilled into the team chat.',
    prompt: 'What do you decide?',
    options: [
      { id: 'share', text: 'Ask them to work it together, with {{actor2}} leading and {{actor}} learning alongside', quality: 85, reaction: '{{actor2}}: Fine by me. {{actor}} can join the next call.', feedback: 'Pairing solves the conflict and turns it into development for the less experienced person.', consequences: { actor: { s: 3 }, kpis: { trust: 3 }, flags: ['shared-lead'] } },
      { id: 'first', text: 'Give it to {{actor}}: {{he}} found it first', quality: 45, reaction: "{{actor2}}: Understood. I'll stay out of it.", feedback: 'A clear rule, but it ignores who can actually win the deal, and the person who lost out may carry it with them.', consequences: { actor: { m: 3 }, kpis: { trust: -1 }, flags: ['backed-first'], delayed: [{ weeks: 3, title: '{{actor2}} is looking around', text: '{{actor2}} has been taking calls from a recruiter. Losing the lead still stings.', actor2: { m: -5 }, kpis: { trust: -3 } }] } },
      { id: 'relationship', text: 'Give it to {{actor2}}: the relationship matters more', quality: 55, reaction: '{{actor}}: So finding leads counts for nothing here?', feedback: 'Right for the deal, but without recognising who found it, you teach people not to prospect.', consequences: { actor: { m: -5 }, flags: ['backed-relationship'] } },
      { id: 'take-over', text: 'Take the lead yourself so nobody argues', quality: 15, reaction: 'The chat goes quiet. Nobody argues, but nobody is happy either.', feedback: 'Taking work away from the team removes the conflict and the trust at the same time.', consequences: { team: { m: -3 }, kpis: { trust: -5 }, flags: ['took-over'] } },
    ],
  },
  {
    id: 'ceo-update', title: 'Halfway update for the board', week: 6, day: 3, channel: 'email', from: { entity: 'ceo' }, type: 'open', level: 2, concept: 'stakeholder', concepts: ['results'],
    situation: 'We are halfway through the quarter at {{conversions}} of {{target}} conversions. The board meets on Monday. Send me a short update: where are we, why, and what are you doing about it?',
    variants: [{ when: { flag: 'fixed-bottleneck' }, text: 'Qualify is moving better since your changes, but we are halfway through the quarter at {{conversions}} of {{target}} conversions. The board meets on Monday. Send me a short update: where are we, why, and what are you doing about it?' }],
    prompt: 'Write your reply to {{ceo}}.',
    open: {
      minWords: 35,
      criteria: suggestCriteria({ concept: 'stakeholder' }),
      keyIdeas: [
        { label: 'Say where things stand, with numbers', terms: ['conversion', 'target', 'behind', 'ahead', 'numbers', '%', 'percent', 'of {{target}}'] },
        { label: 'Explain the cause', terms: ['because', 'cause', 'reason', 'due to', 'bottleneck', 'stuck', 'morale', 'skill'] },
        { label: 'Set out a clear plan', terms: ['plan', 'i will', "i'll", 'next', 'focus', 'coach', 'move', 'priorit'] },
        { label: 'Ask for the support you need', terms: ['need', 'support', 'ask', 'help', 'resource', 'approve'] },
        { label: 'Give a timeline', terms: ['week', 'friday', 'monday', 'end of', 'month', 'by '] },
      ],
      modelAnswer: "We are at {{conversions}} of {{target}} conversions, about two weeks behind plan. The main cause is a bottleneck in Qualify: leads come in, but too few become proposals because two people there are still building skill. Over the next two weeks I will coach them daily, move a strong performer across to add capacity, and review lead quality with marketing. I need your support to protect time for coaching. I expect proposals to rise by the end of next week and will update you on Friday.",
    },
    outcomes: {
      strong: { reaction: 'Clear and honest. I can take that to the board.', feedback: 'A good upward update says where you are, why, what you will do, what you need and by when.', consequences: { kpis: { ceo: 8 }, flags: ['ceo-confident'] } },
      mixed: { reaction: 'I need more specifics before Monday.', feedback: 'Close. Make the cause and the timeline explicit, with numbers.', consequences: { kpis: { ceo: 1 } } },
      weak: { reaction: "This doesn't give me anything to tell the board. Let's talk.", feedback: 'Without numbers, a cause and a plan, your manager has to guess, and usually guesses the worst.', consequences: { kpis: { ceo: -8 }, flags: ['ceo-worried'], delayed: [{ weeks: 1, title: 'Board scrutiny', text: "After Monday's board meeting, {{ceo}} asks for a daily numbers report. It eats into your week.", kpis: { ceo: -2 }, team: { m: -1 } }] } },
    },
    alt: { type: 'scenario', options: [
      { id: 'full', text: 'Give the numbers, the cause (the Qualify bottleneck), your plan, the support you need and a date for the next update.', quality: 90 },
      { id: 'reassure', text: "Reassure {{ceo}} that the team is working hard and it will come right.", quality: 30 },
      { id: 'blame', text: 'Explain that the previous manager left the team in a poor state.', quality: 15 },
    ] },
  },
  {
    id: 'jack-bored', title: '{{actor}} is getting restless', week: 7, day: 2, channel: 'chat', from: { actor: 'jack-holt' }, about: 'jack-holt', type: 'single', level: 2, concept: 'delegate', concepts: ['adapt', 'motivate'],
    situation: "I've closed everything I was given this month. To be honest I'm getting a bit bored. {{competitor}} called me last week.",
    prompt: 'How do you respond to {{actor}}?',
    options: [
      S('directing', 'Set {{him}} daily targets and review {{his}} deals with {{him}} each evening.'),
      S('guiding', 'Share a few ideas for new accounts and ask {{him}} to pick one.'),
      S('partnering', 'Brainstorm together what would make the work interesting again.'),
      S('entrusting', 'Give {{him}} ownership of a key account and the freedom to run it {{his}} way.'),
    ],
    outcomes: {
      strong: { reaction: "Now that's interesting. Leave it with me.", feedback: '{{actor}} needed {{style}}. High skill and high morale want ownership, not supervision.', consequences: { actor: { m: 6, p: 2 }, kpis: { trust: 2 }, flags: ['kept-jack'] } },
      mixed: { reaction: "Maybe. I'll think about it.", feedback: 'Supportive, but {{actor}} needed {{style}}: the freedom to run with something.', consequences: { actor: { m: 1 } } },
      weak: { reaction: "I've been doing this for years. I don't need hand-holding.", feedback: 'Close supervision tells an expert you do not trust them. {{actor}} needed {{style}}.', consequences: { actor: { m: -6 }, kpis: { trust: -2 }, flags: ['jack-at-risk'], delayed: [{ weeks: 2, title: '{{actor}} has an offer', text: '{{actor}} tells you {{competitor}} has made {{him}} an offer.', actor: { m: -4 } }] } },
    },
  },
  {
    id: 'derick-offer', slot: 'week-8', title: '{{actor}} has an offer', week: 8, day: 1, channel: 'call', from: { actor: 'derick-kaynes' }, about: 'derick-kaynes', type: 'scenario', level: 3, concept: 'conflict', concepts: ['motivate'], requires: { flag: 'backed-first' },
    situation: "I'll be straight with you. I've had an offer. After the way the lead situation went, I'm not sure I'm valued here.",
    prompt: 'What do you say to {{actor}}?',
    options: [
      { id: 'listen', text: 'Thank {{him}} for telling you, ask what would make {{him}} want to stay, and give {{him}} ownership of the next big account.', quality: 85, reaction: "I didn't expect that. Let me think about it over the weekend.", feedback: 'Listening first, then offering ownership, answers what an expert actually wants: to be valued and trusted.', consequences: { actor: { m: 8 }, kpis: { trust: 3 } } },
      { id: 'counter', text: 'Offer a bonus to match the other offer.', quality: 45, reaction: 'OK... it was never really about the money.', feedback: 'Money can buy time, but it does not fix feeling undervalued.', consequences: { actor: { m: 2 }, kpis: { ceo: -3 } } },
      { id: 'bluff', text: 'Tell {{him}} everyone is replaceable.', quality: 10, reaction: "Right. Then I'll make my decision.", feedback: 'Calling the bluff of a strong performer usually ends with them leaving.', consequences: { actor: { m: -10, p: -5 }, kpis: { trust: -6 } } },
    ],
  },
  {
    id: 'team-momentum', slot: 'week-8', title: 'Keeping the momentum', week: 8, day: 1, channel: 'chat', from: { actor: 'green-bell' }, about: 'green-bell', type: 'scenario', level: 2, concept: 'recognise', concepts: ['motivate'], requires: { notFlag: 'backed-first' },
    situation: 'The team has had a good fortnight. {{actor}} suggests a friendly competition to close the quarter strongly.',
    prompt: 'What do you do?',
    options: [
      { id: 'team-goal', text: 'Set a shared team goal, with a celebration if the team reaches it together.', quality: 85, reaction: "Love it. I'll tell the others.", feedback: 'A shared goal builds momentum without turning colleagues into rivals.', consequences: { team: { m: 3 }, kpis: { trust: 2 } } },
      { id: 'league', text: 'Run a league table of individual results, with a prize for the winner.', quality: 45, reaction: 'Some are excited, some are already worried about finishing last.', feedback: 'Individual leagues motivate the leaders and discourage the rest.', consequences: { team: { m: -1 } } },
      { id: 'no', text: 'Keep the focus on the plan; no distractions.', quality: 40, reaction: 'Fair enough.', feedback: 'Momentum is worth using. Recognition helps people keep going in the final weeks.', consequences: { actor: { m: -2 } } },
    ],
  },
  {
    id: 'peter-feedback', title: 'A difficult conversation with {{actor}}', week: 9, day: 3, channel: 'meeting', from: { actor: 'peter-higgins' }, about: 'peter-higgins', type: 'open', level: 3, concept: 'feedback', concepts: ['upskill', 'adapt'],
    situation: "{{actor}}'s numbers are the lowest on the team for the third week running. Two deals slipped because follow-ups were not sent. {{He}} seems withdrawn in meetings. You have booked a one-to-one.",
    prompt: 'Write what you will say to {{actor}}: the problem, how you will help, and what happens next.',
    open: {
      minWords: 35,
      criteria: suggestCriteria({ concept: 'feedback' }),
      keyIdeas: [
        { label: 'Name the specific problem', terms: ['follow-up', 'follow up', 'deals', 'slipped', 'numbers', 'two deals', 'three weeks'] },
        { label: 'Explain the impact', terms: ['impact', 'means', 'affect', 'customer', 'team', 'target'] },
        { label: 'Ask and listen', terms: ['how are you', 'what is', "what's", 'understand', 'listen', 'tell me', 'feel', 'getting in the way'] },
        { label: 'Offer hands-on support', terms: ['show', 'step', 'daily', 'together', 'each morning', 'each day', 'checklist', 'sit with'] },
        { label: 'Agree when you will review progress', terms: ['review', 'friday', 'next week', 'check', 'again', 'follow up on'] },
      ],
      modelAnswer: "I want to talk about the last three weeks. Two deals slipped because follow-ups weren't sent, and that affects the whole team's target. Before anything else, how are things for you? I'd like to understand what's getting in the way. Here is how I will help: each morning this week we will spend fifteen minutes going through your follow-ups together, and I'll share the checklist I use. Let's review progress on Friday and agree the next step then.",
    },
    outcomes: {
      strong: { reaction: "Thank you for being straight with me. I've been struggling and didn't know how to say it.", feedback: 'Specific, caring and hands-on: exactly what low skill and low morale need.', consequences: { actor: { s: 6, m: 6, p: 4 }, kpis: { trust: 3 }, flags: ['peter-supported'] } },
      mixed: { reaction: "OK. I'll try harder.", feedback: '"Try harder" is not a plan. Be specific and offer step-by-step help.', consequences: { actor: { m: 1, p: 1 } } },
      weak: { reaction: 'Fine.', feedback: 'Vague or harsh feedback makes a struggling person withdraw further.', consequences: { actor: { m: -6, p: -3 }, kpis: { trust: -3 }, flags: ['peter-lost'] } },
    },
    alt: { type: 'scenario', options: [
      { id: 'sbi', text: 'Name the two slipped deals and their impact, ask what is getting in the way, offer daily follow-up sessions and review on Friday.', quality: 90 },
      { id: 'warn', text: 'Tell {{him}} {{his}} numbers must improve by the end of the month or there will be consequences.', quality: 25 },
      { id: 'soften', text: "Reassure {{him}} that everyone has bad weeks and not to worry.", quality: 35 },
    ] },
  },
  {
    id: 'competitor-price', title: '{{competitor}} cuts its price', week: 10, day: 2, channel: 'email', from: { entity: 'ceo' }, type: 'multi', maxSelect: 2, level: 3, concept: 'prioritise', concepts: ['results', 'enable'],
    situation: '{{competitor}} has launched a cheaper alternative to {{product}}, and two of your prospects have asked for a discount. I want your recommendation today.',
    prompt: 'Which responses do you recommend? Choose up to two.',
    options: [
      { id: 'value', text: 'Coach the team to sell on value and total cost, not price', correct: true, consequences: { team: { s: 1 } } },
      { id: 'targeted', text: 'Offer a time-limited incentive only to the two prospects at risk', correct: true },
      { id: 'blanket', text: 'Cut the price for everyone to match {{competitor}}', correct: false, consequences: { kpis: { ceo: -4 } } },
      { id: 'ignore', text: 'Ignore it: {{product}} sells itself', correct: false },
      { id: 'pressure', text: 'Tell the team to push harder or targets will go up', correct: false, consequences: { team: { m: -3 } } },
    ],
    outcomes: {
      strong: { reaction: 'Agreed. Protect the price, protect the two deals.', feedback: 'Compete on value and act narrowly where the risk is real.', consequences: { team: { p: 2 }, kpis: { ceo: 4 } } },
      mixed: { reaction: "Partly. I'm not sure about all of it.", feedback: 'Match your response to the real risk: two prospects, not the whole market.', consequences: { kpis: { ceo: 1 } } },
      weak: { reaction: "That worries me. Let's discuss before you do anything.", feedback: 'Blanket discounts and pressure are reactions, not a strategy.', consequences: { kpis: { ceo: -4 } } },
    },
  },
];

export const DEFAULT_LEARNING = {
  recall: true,
  reflection: true,
  rewinds: 2,
  hints: true,
  reflections: [
    { id: 'r1', week: 4, prompt: 'Which person on your team are you reading least well so far, and what would help you read them better?' },
    { id: 'r2', week: 8, prompt: 'Think of a decision from the last few weeks that did not go as planned. What would you do differently?' },
  ],
  transfer: [
    'Think of someone in your real team who has low morale right now. What do they need from you this week?',
    'Which of your people could you give more ownership to, and what would you hand over first?',
    'What update would your own manager want from you on Friday? Draft the first line now.',
  ],
};

export function defaultDecisions() {
  return {
    mix: { open: 30 },
    nlp: { evaluator: 'auto' },
    kpis: DEFAULT_KPIS.map((k) => ({ ...k })),
    concepts: JSON.parse(JSON.stringify(CONCEPTS)),
    points: JSON.parse(JSON.stringify(DEFAULT_POINTS)),
  };
}

// ---------- switching interaction types ----------

const bestOption = (dp) => [...(dp.options || [])].sort((a, b) => (b.quality ?? (b.correct ? 80 : 30)) - (a.quality ?? (a.correct ? 80 : 30)))[0];

// Converts a moment to another interaction type, keeping everything a learner would see.
export function convertType(dp, type) {
  if (dp.type === type) return dp;
  const x = JSON.parse(JSON.stringify(dp));
  const wasOpen = x.type === 'open';
  if (type === 'open') {
    const best = bestOption(x);
    x.alt = { type: x.type, options: x.options, maxSelect: x.maxSelect };
    const answer = x.open?.modelAnswer || [best?.text, best?.feedback].filter(Boolean).join('. ').replace(/\.\./g, '.');
    x.open = x.open?.keyIdeas?.length ? x.open : { minWords: 25, criteria: suggestCriteria(x), keyIdeas: draftKeyIdeas(answer), modelAnswer: answer };
    if (!x.outcomes) x.outcomes = bandsFromOptions(x.options);
    x.prompt = /own words/i.test(x.prompt) ? x.prompt : `${x.prompt.replace(/\s*Choose up to \w+\.?$/i, '')} Answer in your own words.`.trim();
    x.type = 'open';
    delete x.options;
    delete x.maxSelect;
    return x;
  }
  if (wasOpen) {
    const alt = x.alt || { type: 'scenario', options: [
      { id: 'model', text: (x.open?.modelAnswer || 'Do the right thing').split(/(?<=[.!?])\s+/).slice(0, 2).join(' '), quality: 85 },
      { id: 'partial', text: 'Acknowledge the issue and promise to look into it later.', quality: 45 },
      { id: 'avoid', text: 'Leave it for now; it will probably sort itself out.', quality: 20 },
    ] };
    x.options = alt.options;
    if (alt.maxSelect) x.maxSelect = alt.maxSelect;
    x.alt = { type: 'open', open: x.open };
    x.prompt = x.prompt.replace(/\s*Answer in your own words\.?$/i, '').replace(/^Write /, 'Choose ');
    x.type = alt.type && alt.type !== 'open' ? alt.type : 'scenario';
    if (type === x.type) return x;
  }
  // Between structured types.
  const opts = x.options || [];
  if (type === 'multi') {
    x.options = opts.map((o) => ({ ...o, correct: o.correct ?? (o.style ? false : (o.quality ?? 0) >= 70) }));
    if (!x.options.some((o) => o.correct) && x.options[0]) x.options[0].correct = true;
    x.maxSelect = x.maxSelect || Math.max(1, x.options.filter((o) => o.correct).length);
    if (!x.outcomes) x.outcomes = bandsFromOptions(opts);
  }
  if (type === 'rank') {
    const sorted = [...opts].sort((a, b) => (b.quality ?? (b.correct ? 80 : 30)) - (a.quality ?? (a.correct ? 80 : 30)));
    x.options = opts.map((o) => ({ ...o, rank: sorted.indexOf(o) }));
    if (!x.outcomes) x.outcomes = bandsFromOptions(opts);
  }
  if (type === 'single' || type === 'scenario') {
    x.options = opts.map((o) => ({ ...o, quality: o.quality ?? (o.style ? undefined : o.correct ? 85 : o.rank !== undefined ? Math.max(10, 90 - o.rank * 25) : 40) }));
  }
  x.type = type;
  return x;
}

function bandsFromOptions(options = []) {
  const q = (o) => o.quality ?? (o.correct ? 80 : 30);
  const sorted = [...options].sort((a, b) => q(b) - q(a));
  const pick = (o) => (o ? { reaction: o.reaction, feedback: o.feedback, consequences: o.consequences } : {});
  return { strong: pick(sorted[0]), mixed: pick(sorted[Math.floor(sorted.length / 2)]), weak: pick(sorted.at(-1)) };
}

// Changes interaction types so the open share is as close as possible to the target (0 to 100).
// Moments the author fixed (lockType) are never changed.
export function applyMix(points, openPct) {
  const list = JSON.parse(JSON.stringify(points || []));
  const slots = slotsOf(list);
  const want = Math.round((slots.length * openPct) / 100);
  let have = mixOf(list).open;
  const convertSlot = (slot, type) => {
    for (let i = 0; i < list.length; i++) if ((list[i].slot || list[i].id) === slot) list[i] = convertType(list[i], type);
  };
  // Prefer turning rich, higher-level moments into open ones; turn back the lowest-level first.
  const toOpen = slots.filter((p) => p.type !== 'open' && !p.lockType).sort((a, b) => (b.alt?.type === 'open' ? 2 : 0) + (b.level || 1) - ((a.alt?.type === 'open' ? 2 : 0) + (a.level || 1)));
  const toClosed = slots.filter((p) => p.type === 'open' && !p.lockType).sort((a, b) => (a.level || 1) - (b.level || 1));
  while (have < want && toOpen.length) { const p = toOpen.shift(); convertSlot(p.slot || p.id, 'open'); have = mixOf(list).open; }
  while (have > want && toClosed.length) { const p = toClosed.shift(); convertSlot(p.slot || p.id, p.alt?.type && p.alt.type !== 'open' ? p.alt.type : 'scenario'); have = mixOf(list).open; }
  return list;
}

export { INTERACTION_TYPES };
