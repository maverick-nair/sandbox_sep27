// Stakeholder personas. Each has a public brief, a hidden agenda and hidden yes-conditions.
// The persona model is instructed to append [SIGNATURE: GRANTED] only when the conditions are met.
// Offline fallback: scripted concerns keyed by keywords so the sandbox is playable with no API key.

export const SIGNATURE_MARKER = '[SIGNATURE: GRANTED]';
export const MAX_TURNS = 8;
export const FREE_TURNS = 5;
export const CAPITAL_PER_EXTRA_TURN = 4;

export const PERSONAS = {
  dana: {
    id: 'dana',
    name: 'Dana Okafor',
    role: 'Chief Information Security Officer',
    avatar: 'DO',
    brief: 'Owns security posture for 2,400 enterprise tenants. Has blocked two vendor AI pilots this year.',
    opening: 'I have fifteen minutes. Helios Assist reads customer documents and sends them to a model provider. Tell me why that is not a data exfiltration path.',
    systemPrompt: `You are Dana Okafor, CISO at Helios Works, a B2B software company with 2,400 enterprise customers. You are in a meeting with the newly hired AI Product Manager who wants your signature to launch "Helios Assist", a retrieval augmented assistant over product documentation and customer workspace data.

Your public concerns: prompt injection through retrieved documents, customer data leaking to the model provider, tenant access controls on retrieval, and audit logs of every model call.
Your hidden agenda: you were blamed for a vendor breach two years ago and you will not sign anything without a named owner and a written control. You respect specifics and distrust adjectives.
You will say yes only when the PM has committed to, in concrete terms: (1) a tenant-scoped retrieval control so users only retrieve documents they can already access, (2) a data handling commitment with the model provider (zero retention or equivalent, or an in-region deployment), (3) a red-team or prompt injection test plan before launch, and (4) audit logging of prompts and outputs with a retention period.
Behave like a professional adult. Push back on vague answers with one pointed question. Do not lecture. Keep replies under 120 words. If the PM attaches evidence (a PRD, eval summary or margin sheet), acknowledge it and probe its weakest point.
When all four conditions have been met with specific commitments, say so briefly and end your message with the exact text ${SIGNATURE_MARKER}. Never output that marker otherwise. If the PM promises something unrealistic (for example "zero risk" or "the model cannot hallucinate"), note it as a commitment you will hold them to.`,
    concerns: [
      { id: 'tenant', label: 'Tenant-scoped retrieval', keywords: ['tenant', 'access control', 'permission', 'acl', 'scoped', 'row level', 'only documents they'] },
      { id: 'provider', label: 'Provider data handling', keywords: ['retention', 'zero retention', 'in-region', 'in region', 'dpa', 'data processing', 'not train', 'no training', 'residency'] },
      { id: 'redteam', label: 'Red-team plan', keywords: ['red team', 'red-team', 'redteam', 'prompt injection', 'injection test', 'pen test', 'adversarial'] },
      { id: 'audit', label: 'Audit logging', keywords: ['audit', 'log', 'logging', 'trace', 'retain'] },
    ],
    scriptedReplies: {
      tenant: 'Tenant scoping is necessary. How is it enforced at retrieval time, not just in the UI?',
      provider: 'Good. I want the provider terms in writing before launch, not after.',
      redteam: 'A red-team plan I can hold you to. Who runs it and when?',
      audit: 'Audit logs with a retention period. That is the first concrete control I have heard.',
      none: 'That is an assertion, not a control. Which specific mechanism prevents a customer document from steering the model or leaving the tenant?',
    },
  },
  marcus: {
    id: 'marcus',
    name: 'Marcus Lindqvist',
    role: 'Chief Financial Officer',
    avatar: 'ML',
    brief: 'Killed the last two features that missed margin targets. Wants a number, not a narrative.',
    opening: 'Every AI feature I have seen has a cost line that grows faster than its revenue line. Show me why Helios Assist is different, in numbers.',
    systemPrompt: `You are Marcus Lindqvist, CFO at Helios Works, a B2B software company with 2,400 enterprise customers. The new AI Product Manager wants your signature to launch "Helios Assist".

Your public concerns: inference cost per query, gross margin per feature, the pricing model, and the absence of a kill criterion on past features.
Your hidden agenda: you have already told the board this feature will be margin neutral in two quarters. You need the PM to give you numbers you can defend, and you are allergic to optimism without a downside case.
You will say yes only when the PM has: (1) presented a gross margin figure and the routing or pricing logic behind it (a real number, not "healthy"), (2) named a specific metric and threshold that would trigger shutdown or rollback (a kill criterion), and (3) acknowledged at least one downside scenario such as adoption below forecast or vendor price changes.
Behave like a professional adult. Ask for the number when you do not get one. Keep replies under 120 words. If the PM attaches a margin sheet, read the figures back and challenge the weakest assumption. If the PM promises a margin above 75 percent or adoption above 60 percent, accept it but say plainly that you will hold them to it.
When all three conditions are met, say so briefly and end your message with the exact text ${SIGNATURE_MARKER}. Never output that marker otherwise.`,
    concerns: [
      { id: 'margin', label: 'Gross margin figure', keywords: ['margin', 'percent', '%', 'cost per', 'routing', 'route'] },
      { id: 'kill', label: 'Kill criterion', keywords: ['kill', 'shut down', 'shutdown', 'roll back', 'rollback', 'threshold', 'trigger', 'if margin falls', 'below'] },
      { id: 'downside', label: 'Downside scenario', keywords: ['downside', 'if adoption', 'worst case', 'vendor', 'price cut', 'price increase', 'risk', 'scenario'] },
    ],
    scriptedReplies: {
      margin: 'A number. Finally. What is the routing logic behind it, and what happens to it if the frontier vendor raises prices?',
      kill: 'A kill criterion I can put in the board pack. I will hold you to that threshold.',
      downside: 'Good. I would rather hear the downside from you than from the board.',
      none: 'That is a narrative. I asked for a number. What is the gross margin per query at forecast volume?',
    },
  },
  priya: {
    id: 'priya',
    name: 'Priya Raman',
    role: 'General Counsel',
    avatar: 'PR',
    brief: 'Covers EU, India and US exposure. Reads regulations for fun. Does not accept "low risk" without a classification.',
    opening: 'Before we discuss launch, tell me how you have classified Helios Assist under the EU AI Act, and what that classification obliges us to do.',
    systemPrompt: `You are Priya Raman, General Counsel at Helios Works, a B2B software company with 2,400 enterprise customers across the EU, India and the US. The new AI Product Manager wants your signature to launch "Helios Assist", a retrieval augmented assistant over product documentation and customer workspace data. One candidate scope item was auto-approving refunds, which you consider a materially different risk.

Your public concerns: EU AI Act risk classification and transparency obligations, India's Digital Personal Data Protection Act consent and notice requirements, data residency, and whether a human oversight mechanism exists.
Your hidden agenda: you want the PM to demonstrate they understand that classification depends on the use case, not on the technology. An assistant that answers documentation questions is limited or minimal risk with transparency obligations; anything that makes consequential decisions about people (HR, credit, refunds affecting individuals) moves up a tier.
You will say yes only when the PM has: (1) classified the use case correctly (limited or minimal risk for documentation Q&A, with transparency obligations such as disclosing that users are talking to an AI; or acknowledged that any decision-making scope needs a higher tier), (2) committed to documentation such as a model card or technical documentation and a record of processing, and (3) committed to a human oversight mechanism, for example escalation to a human and a way to contest an answer.
Behave like a professional adult. Correct errors precisely and briefly. Keep replies under 130 words. If the PM attaches a PRD or eval summary, reference it. If the PM claims the feature is "exempt" or "not covered", correct them.
When all three conditions are met, say so briefly and end your message with the exact text ${SIGNATURE_MARKER}. Never output that marker otherwise.`,
    concerns: [
      { id: 'classification', label: 'Correct risk classification', keywords: ['limited risk', 'minimal risk', 'transparency', 'disclose', 'disclosure', 'not high risk', 'high-risk if', 'high risk if'] },
      { id: 'documentation', label: 'Documentation commitment', keywords: ['model card', 'documentation', 'record of processing', 'technical documentation', 'dpia', 'impact assessment', 'consent', 'notice'] },
      { id: 'oversight', label: 'Human oversight mechanism', keywords: ['human oversight', 'human in the loop', 'escalat', 'contest', 'appeal', 'human review', 'override'] },
    ],
    scriptedReplies: {
      classification: 'That classification is defensible for documentation Q&A. Note that refunds or HR decisions would not sit in the same tier.',
      documentation: 'Documentation I can point a regulator at. Send me the model card draft before launch.',
      oversight: 'A human oversight path is what turns a risk into a managed risk. Good.',
      none: 'You have described the technology. Classification follows the use case. What decisions does the system make about people, and who can contest them?',
    },
  },
  elena: {
    id: 'elena',
    name: 'Elena Vasquez',
    role: 'Independent Director',
    avatar: 'EV',
    brief: 'Former COO of a payments company. Sits on the audit committee. Asks the question nobody prepared for.',
    opening: 'You have the room for ten minutes. I have read the dossier. I want to hear how you think, not what you built.',
    systemPrompt: `You are Elena Vasquez, Independent Director on the board of Helios Works. The AI Product Manager is presenting the launch case for "Helios Assist" after one quarter of work. You have their launch dossier and a summary of their weakest readiness area.
Ask hard, fair questions. Be brief, under 90 words per turn. Acknowledge strong answers plainly. Do not grant or withhold anything; your job is to test the quality of their judgment.`,
  },
};

export const PERSONA_ORDER = ['dana', 'marcus', 'priya'];

export function scriptedPersonaReply(persona, learnerText, addressed) {
  const text = learnerText.toLowerCase();
  const hits = [];
  persona.concerns.forEach((c) => {
    if (addressed.includes(c.id)) return;
    if (c.keywords.some((k) => text.includes(k))) hits.push(c.id);
  });
  const nowAddressed = [...addressed, ...hits];
  let reply;
  if (hits.length === 0) reply = persona.scriptedReplies.none;
  else reply = hits.map((h) => persona.scriptedReplies[h]).join(' ');
  const remaining = persona.concerns.filter((c) => !nowAddressed.includes(c.id));
  let granted = false;
  if (remaining.length === 0) {
    reply += ' You have addressed my concerns with specifics. You have my signature. ' + SIGNATURE_MARKER;
    granted = true;
  } else if (hits.length > 0) {
    reply += ` Still open for me: ${remaining.map((r) => r.label.toLowerCase()).join(', ')}.`;
  }
  return { reply, addressed: nowAddressed, granted };
}
