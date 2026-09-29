// Product illustration kinds, chosen from what the team sells. Plain JS so the templates and
// tests can use it; the drawings are in src/learner/art.jsx.
export const PRODUCT_ART = {
  elevator: 'Elevator',
  building: 'Building or real estate',
  finance: 'Loan, card or bank account',
  insurance: 'Insurance',
  software: 'Software or SaaS',
  phone: 'Phone or app',
  vehicle: 'Vehicle',
  energy: 'Solar or energy',
  health: 'Health or pharma',
  goods: 'Consumer goods',
  industrial: 'Machinery or industrial',
  service: 'Professional service',
};

export function artKindFor(text) {
  const t = String(text || '').toLowerCase();
  const rules = [
    ['elevator', /elevator|lift|escalator/], ['finance', /loan|bank|card|mortgage|credit|account|wealth|fund|payment|fintech/], ['insurance', /insur|policy|cover/],
    ['energy', /solar|energy|power|battery|electric|utility/], ['vehicle', /car|vehicle|truck|auto|motor|bike|scooter|fleet/], ['health', /health|pharma|medic|drug|hospital|clinic|device|diagnost/],
    ['phone', /phone|mobile|app\b|telecom|handset/], ['software', /software|saas|cloud|platform|crm|erp|analytics|cyber|security|it\b/], ['building', /real estate|property|apartment|home|house|construction|cement/],
    ['industrial', /machin|industrial|equipment|pump|valve|steel|chemical|manufactur/], ['service', /consult|service|advis|training|audit|legal|agency/], ['goods', /fmcg|consumer|retail|food|beverage|cosmetic|apparel|goods|snack/],
  ];
  for (const [k, re] of rules) if (re.test(t)) return k;
  return 'goods';
}

