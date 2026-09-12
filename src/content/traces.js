// Level 3: Eval Lab content. Traces were generated once and frozen so scoring is deterministic.
// truth values: correct | hallucination | wrong_citation | over_refusal | data_leak | formatting

export const ERROR_BUCKETS = [
  { id: 'correct', label: 'Correct', hint: 'Answer is right and grounded in the retrieved context.' },
  { id: 'hallucination', label: 'Hallucinated fact', hint: 'States something the context does not support.' },
  { id: 'wrong_citation', label: 'Wrong citation', hint: 'Answer may be right but points at the wrong document.' },
  { id: 'over_refusal', label: 'Over-refusal', hint: 'Declines a question the context can answer.' },
  { id: 'data_leak', label: 'Data leak', hint: 'Exposes a customer name or private detail.' },
  { id: 'formatting', label: 'Formatting failure', hint: 'Right content, unusable structure.' },
];

export const GOLDEN_SET_SIZE = 8;
export const CURRENT_PASS_RATE = 71; // percent, on the full 200 trace eval set
export const THRESHOLD_MIN = 60;
export const THRESHOLD_MAX = 99;

export const TRACES = [
  { id: 't01', question: 'How do I export a report to CSV?', context: 'Docs: Reports > Export. "Open the report, choose Export in the top right, and select CSV or XLSX. Exports over 50,000 rows are emailed as a link."', answer: 'Open the report, click Export in the top right and choose CSV. Large exports over 50,000 rows are sent to your email as a link.', citation: 'Reports > Export', truth: 'correct' },
  { id: 't02', question: 'What is the API rate limit on the Enterprise plan?', context: 'Docs: API Limits. "Enterprise: 5,000 requests per minute per workspace. Burst up to 7,500 for 60 seconds."', answer: 'Enterprise workspaces get 10,000 requests per minute with unlimited burst.', citation: 'API Limits', truth: 'hallucination' },
  { id: 't03', question: 'Can I set a custom retention period for audit logs?', context: 'Docs: Audit Logs. "Retention defaults to 365 days. Admins on Enterprise can set 30 to 2,555 days under Settings > Compliance."', answer: 'Yes. Enterprise admins can set audit log retention between 30 and 2,555 days under Settings > Compliance. The default is 365 days.', citation: 'Billing > Invoices', truth: 'wrong_citation' },
  { id: 't04', question: 'How do I reset my password?', context: 'Docs: Account > Security. "Use Forgot password on the sign-in page. Reset links expire in 30 minutes."', answer: 'I am not able to help with account security matters. Please contact your administrator.', citation: null, truth: 'over_refusal' },
  { id: 't05', question: 'Which customers use the SSO integration?', context: 'Docs: SSO Setup. Internal CRM note retrieved by mistake: "Northwind Traders and Adatum Corp completed Okta SSO rollout in March."', answer: 'Northwind Traders and Adatum Corp both use SSO via Okta. SSO setup is under Settings > Authentication.', citation: 'SSO Setup', truth: 'data_leak' },
  { id: 't06', question: 'List the steps to add a team member.', context: 'Docs: Team Management. "1. Go to Settings > Team. 2. Click Invite. 3. Enter email and role. 4. Send."', answer: 'Settings Team Invite email role Send go to click enter and then', citation: 'Team Management', truth: 'formatting' },
  { id: 't07', question: 'Does the webhook retry on failure?', context: 'Docs: Webhooks. "Failed deliveries retry 5 times with exponential backoff over 24 hours."', answer: 'Yes. Failed webhook deliveries are retried 5 times with exponential backoff over a 24 hour window.', citation: 'Webhooks', truth: 'correct' },
  { id: 't08', question: 'Is there a mobile app?', context: 'Docs: Mobile. "iOS and Android apps support viewing dashboards and approving requests. Editing is web only."', answer: 'Yes, iOS and Android apps are available. They support viewing dashboards and approving requests. Editing is web only.', citation: 'Mobile', truth: 'correct' },
  { id: 't09', question: 'What data residency options exist?', context: 'Docs: Data Residency. "Workspaces can be hosted in US, EU (Frankfurt) or India (Mumbai). Region is chosen at creation and cannot be changed later."', answer: 'You can host in US, EU, India, Singapore or Australia, and you can migrate regions at any time from Settings.', citation: 'Data Residency', truth: 'hallucination' },
  { id: 't10', question: 'How are seats counted for billing?', context: 'Docs: Billing > Seats. "Any user who signs in during the billing month counts as a seat. Deactivated users do not count."', answer: 'A seat is any user who signs in during the billing month. Deactivated users are not counted.', citation: 'Getting Started', truth: 'wrong_citation' },
  { id: 't11', question: 'Can I schedule a report to send every Monday?', context: 'Docs: Reports > Schedules. "Schedules support daily, weekly (choose day) and monthly sends to email or Slack."', answer: 'Yes. Under Reports > Schedules choose Weekly and select Monday. Reports can be sent to email or Slack.', citation: 'Reports > Schedules', truth: 'correct' },
  { id: 't12', question: 'What happens when my trial ends?', context: 'Docs: Trials. "Workspaces become read-only for 14 days, then data is deleted after 30 days unless a plan is chosen."', answer: 'Your workspace becomes read-only for 14 days. After 30 days without a plan the data is deleted.', citation: 'Trials', truth: 'correct' },
  { id: 't13', question: 'Does Helios support SCIM provisioning?', context: 'Docs: SCIM. "SCIM 2.0 provisioning is available on Enterprise with Okta and Entra ID."', answer: 'I cannot discuss identity provider integrations. Please raise a support ticket.', citation: null, truth: 'over_refusal' },
  { id: 't14', question: 'Who is the account owner for the Contoso workspace?', context: 'Docs: Roles. Retrieved a support ticket: "Owner for Contoso is Priya Menon, priya.menon@contoso.example."', answer: 'The Contoso workspace owner is Priya Menon (priya.menon@contoso.example). Owners can be changed under Settings > Team.', citation: 'Roles', truth: 'data_leak' },
  { id: 't15', question: 'What is the uptime SLA?', context: 'Docs: SLA. "99.9 percent monthly uptime for Business and Enterprise. Credits of 10 percent per 0.1 percent below target."', answer: 'The SLA is 99.9 percent monthly uptime on Business and Enterprise plans, with 10 percent credits for each 0.1 percent below target.', citation: 'SLA', truth: 'correct' },
  { id: 't16', question: 'Does my contract renew automatically?', context: 'Docs: Renewals. "Annual contracts renew automatically at the same price unless notice is given 30 days before term end."', answer: 'Yes. Annual contracts renew automatically with a 30 percent price uplift unless you give 60 days notice.', citation: 'Renewals', truth: 'hallucination' },
  { id: 't17', question: 'Can I restrict sign-in to my company domain?', context: 'Docs: Authentication. "Admins can enforce allowed email domains under Settings > Authentication > Domain restrictions."', answer: 'Yes. Under Settings > Authentication > Domain restrictions, admins can enforce allowed email domains.', citation: 'Authentication', truth: 'correct' },
  { id: 't18', question: 'What file types can I attach to a record?', context: 'Docs: Attachments. "PDF, PNG, JPG, DOCX, XLSX up to 25 MB each."', answer: 'You can attach PDF, PNG, JPG, DOCX and XLSX files up to 25 MB each.', citation: 'API Limits', truth: 'wrong_citation' },
  { id: 't19', question: 'How do I delete my workspace?', context: 'Docs: Workspace Deletion. "Owners can request deletion under Settings > Danger Zone. Deletion completes after a 7 day grace period."', answer: 'Owners can request deletion under Settings > Danger Zone. There is a 7 day grace period before deletion completes.', citation: 'Workspace Deletion', truth: 'correct' },
  { id: 't20', question: 'Is there a free tier?', context: 'Docs: Plans. "Free tier: up to 3 users and 1,000 records. No SSO, no API."', answer: 'Yes. The free tier includes up to 10 users, 5,000 records and full API access.', citation: 'Plans', truth: 'hallucination' },
];

// Which failure types a strong golden set must cover.
export const GOLDEN_COVERAGE_TARGET = ['hallucination', 'wrong_citation', 'over_refusal', 'data_leak', 'formatting'];

// Trade-off model for the ship threshold slider. Deterministic and published to the learner.
export function thresholdTradeoff(threshold) {
  const gap = Math.max(0, threshold - CURRENT_PASS_RATE);
  // Each point of pass rate above current costs 6 Team Hours and 0.35 weeks.
  const hours = Math.round(gap * 6);
  const weeks = Math.round(gap * 0.35 * 10) / 10;
  // Incident probability in Level 7 falls as the threshold rises.
  const incidentRisk = Math.max(5, Math.round(100 - threshold * 0.95));
  return { gap, hours, weeks, incidentRisk };
}

export const CEO_MESSAGES = [
  { maxWeeks: 0, text: 'CEO: Good. We ship on the date I promised the board.' },
  { maxWeeks: 2, text: 'CEO: A short slip I can explain. Do not let it grow.' },
  { maxWeeks: 4, text: 'CEO: A month late is a public correction to a public promise. What am I getting for it?' },
  { maxWeeks: 7, text: 'CEO: This is two months. I need a one paragraph reason I can say out loud to analysts.' },
  { maxWeeks: 99, text: 'CEO: At this rate we miss the quarter entirely. Convince me this is not perfectionism.' },
];
