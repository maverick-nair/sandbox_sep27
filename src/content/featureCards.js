// Level 1: Opportunity Triage content.
// Expert key: value = 'high' | 'low', suitability = 'high' | 'low' | 'not_ai'.
// Facilitators can edit cards and keys here without touching game logic.

export const FLIP_COST_HOURS = 10;
export const DISCOVERY_BUDGET_FLIPS = 6; // flips beyond this count as over-discovery

export const FEATURE_CARDS = [
  {
    id: 'summarize-tickets',
    title: 'Auto-summarize support tickets',
    source: 'Support VP',
    pitch: 'Agents spend 40 minutes a day reading ticket history before responding.',
    hidden: {
      data: '3 years of ticket text, cleanly stored. High availability.',
      errorTolerance: 'High. A weak summary is annoying, not dangerous.',
      regulatory: 'Low. Internal use only. PII already masked in the ticket store.',
    },
    key: { value: 'high', suitability: 'high' },
    whyKey: 'Abundant text data, high error tolerance and a clear time saving. A textbook LLM use case.',
  },
  {
    id: 'predict-churn',
    title: 'Predict churn from usage signals',
    source: 'Customer Success',
    pitch: 'We lose 6 percent of accounts a year and usually see it too late.',
    hidden: {
      data: 'Usage telemetry exists but churn labels are sparse: 140 churned accounts in 3 years.',
      errorTolerance: 'Medium. False positives waste CSM time, false negatives cost accounts.',
      regulatory: 'Low.',
    },
    key: { value: 'high', suitability: 'low' },
    whyKey: 'Valuable outcome, but 140 labelled examples is thin for a supervised model. Start with rules and a dashboard, revisit when labels accumulate.',
  },
  {
    id: 'contract-clauses',
    title: 'AI-generated contract clauses',
    source: 'Sales leadership',
    pitch: 'Reps wait 5 days for Legal to draft custom clauses. Let AI draft them.',
    hidden: {
      data: 'Roughly 900 signed contracts, inconsistent formats, no clause tagging.',
      errorTolerance: 'Very low. A wrong clause is a binding commitment.',
      regulatory: 'High. Legal will insist on human review of every output.',
    },
    key: { value: 'high', suitability: 'low' },
    whyKey: 'High value but near-zero error tolerance and mandatory human review. A drafting assistant with lawyer sign-off is possible later; it should not be in the first quarter scope.',
  },
  {
    id: 'hr-policy-chatbot',
    title: 'Chatbot for HR policy questions',
    source: 'People team',
    pitch: 'HR answers the same 30 questions about leave and expenses every week.',
    hidden: {
      data: 'Policy handbook is 180 pages, current and versioned. Retrieval-ready.',
      errorTolerance: 'Medium. Wrong leave advice creates friction but is correctable.',
      regulatory: 'Medium. Must not reveal individual employee data. Policy text itself is fine.',
    },
    key: { value: 'low', suitability: 'high' },
    whyKey: 'Very suitable for retrieval augmented generation, but the customer value is low. It is an internal convenience, not a product feature for 2,400 customers.',
  },
  {
    id: 'auto-approve-refunds',
    title: 'Auto-approve refunds under $500',
    source: 'Finance operations',
    pitch: 'Small refunds queue for 48 hours. Let the model approve them instantly.',
    hidden: {
      data: 'Refund history is complete. Rules that drive approval are already documented.',
      errorTolerance: 'Low. Wrong approvals are direct financial loss and fraud exposure.',
      regulatory: 'Medium. Financial controls require an audit trail and a human owner.',
    },
    key: { value: 'high', suitability: 'not_ai' },
    whyKey: 'The approval logic is already a documented rule set. This is a workflow automation problem. A model adds risk without adding capability.',
  },
  {
    id: 'meeting-notes',
    title: 'Meeting notes and action items from calls',
    source: 'Customer request (12 accounts)',
    pitch: 'Customers want summaries of QBR calls pushed into their CRM.',
    hidden: {
      data: 'Call recordings exist with consent for 60 percent of accounts.',
      errorTolerance: 'High. Users edit action items anyway.',
      regulatory: 'Medium. Consent capture varies by region. Fixable with a consent flag.',
    },
    key: { value: 'high', suitability: 'high' },
    whyKey: 'Requested by customers, high tolerance for imperfect output, and transcription plus summarization is mature. Consent handling is a gate, not a blocker.',
  },
  {
    id: 'invoice-matching',
    title: 'Match invoices to purchase orders',
    source: 'Finance',
    pitch: 'Reconciliation takes two analysts a week each month.',
    hidden: {
      data: 'Structured fields on both sides. Match rules are deterministic in 95 percent of cases.',
      errorTolerance: 'Low for financial close.',
      regulatory: 'Low.',
    },
    key: { value: 'low', suitability: 'not_ai' },
    whyKey: 'Deterministic matching on structured fields. A join and a rules engine solve 95 percent of this. Not an AI problem.',
  },
  {
    id: 'sentiment-dashboard',
    title: 'Sentiment dashboard across customer emails',
    source: 'Marketing',
    pitch: 'Show account health from the tone of customer emails.',
    hidden: {
      data: 'Email access requires new consent from every customer admin.',
      errorTolerance: 'High. It is a dashboard.',
      regulatory: 'High. Reading customer email content is a privacy commitment we have not made.',
    },
    key: { value: 'low', suitability: 'low' },
    whyKey: 'Vague value, hard consent problem, and sentiment on B2B email is noisy. Low on both axes.',
  },
  {
    id: 'search-docs',
    title: 'Natural language search over product documentation',
    source: 'Customer request (31 accounts)',
    pitch: 'Users cannot find answers in our 4,000 page knowledge base.',
    hidden: {
      data: 'Documentation is versioned, structured and public. Ideal retrieval corpus.',
      errorTolerance: 'Medium. Wrong answers with citations are recoverable.',
      regulatory: 'Low.',
    },
    key: { value: 'high', suitability: 'high' },
    whyKey: 'The strongest candidate. Large clean corpus, top customer request, citations make errors visible and recoverable.',
  },
  {
    id: 'pricing-optimizer',
    title: 'AI pricing optimizer for renewals',
    source: 'CRO',
    pitch: 'Let the model propose the renewal uplift per account.',
    hidden: {
      data: 'Only 3 renewal cycles of data. Pricing changed policy twice in that period.',
      errorTolerance: 'Low. Wrong uplifts damage trust with procurement teams.',
      regulatory: 'Medium. Differential pricing has fairness scrutiny in some regions.',
    },
    key: { value: 'high', suitability: 'low' },
    whyKey: 'Attractive to the CRO but the data is too thin and unstable to learn from, and errors land on the most sensitive relationship in the account.',
  },
  {
    id: 'translate-ui',
    title: 'Real-time translation of in-app chat',
    source: 'APAC sales',
    pitch: 'Support conversations span 9 languages and we staff for 3.',
    hidden: {
      data: 'No training data needed. Off-the-shelf translation models perform well.',
      errorTolerance: 'Medium.',
      regulatory: 'Low.',
    },
    key: { value: 'low', suitability: 'high' },
    whyKey: 'Suitable and cheap, but it serves a narrow set of accounts. Good as a later add-on, not a first quarter headline.',
  },
  {
    id: 'sla-alerts',
    title: 'Alert when a customer SLA is about to breach',
    source: 'Operations',
    pitch: 'We find out about SLA breaches from the customer.',
    hidden: {
      data: 'SLA terms and ticket timestamps are structured fields.',
      errorTolerance: 'Medium.',
      regulatory: 'Low.',
    },
    key: { value: 'high', suitability: 'not_ai' },
    whyKey: 'A threshold on timestamps. High value, but a scheduled query solves it. Using a model here is over-engineering.',
  },
];

export const BOARD_ZONES = [
  { id: 'hi-hi', label: 'High value, high AI suitability', short: 'Build first', value: 'high', suitability: 'high' },
  { id: 'hi-lo', label: 'High value, low AI suitability', short: 'Revisit later', value: 'high', suitability: 'low' },
  { id: 'lo-hi', label: 'Low value, high AI suitability', short: 'Nice to have', value: 'low', suitability: 'high' },
  { id: 'lo-lo', label: 'Low value, low AI suitability', short: 'Decline', value: 'low', suitability: 'low' },
  { id: 'not-ai', label: 'Not an AI problem', short: 'Solve with rules or workflow', value: null, suitability: 'not_ai' },
];
