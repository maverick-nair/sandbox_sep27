// Context packs for iLead hyper-contextualization.
// An author describes their organization (industry, what they sell, who buys, where they are);
// these packs turn that into concrete proposals: names, money, stages, story, events and people.
// Only words change. Timing, impacts and pass-on rates stay put, so the balance is untouched.
// Texts use {{tokens}} so later edits to a name still flow everywhere.

// ---------- stages: by who buys and what is sold ----------

export const STAGE_SETS = {
  'b2b-product': [
    ['Lead generation', 'Team members in this role make first contact with companies and build a list of prospects who may need {{product}}.'],
    ['Qualify', 'Team members in this role check whether a prospect has a real need, budget and authority to buy.'],
    ['Proposal', 'Team members in this role send proposals with pricing and service levels.'],
    ['Negotiate', 'Team members in this role negotiate price and terms with the client.'],
    ['Close', 'Team members in this role close the deal with {{company}} and hand the order over for delivery.'],
  ],
  'b2b-service': [
    ['Prospecting', 'Team members in this role find organizations that could benefit from {{product}} and open conversations.'],
    ['Discovery', 'Team members in this role run discovery meetings to understand the client\'s problem and decision process.'],
    ['Solution design', 'Team members in this role shape the scope and design how {{product}} will solve the problem.'],
    ['Proposal and pricing', 'Team members in this role write the proposal, price the engagement and handle commercial questions.'],
    ['Contract and onboarding', 'Team members in this role sign the contract and hand the client over to delivery with a clean start.'],
  ],
  'b2c-product': [
    ['Lead capture', 'Team members in this role respond to enquiries from customers interested in {{product}}.'],
    ['Needs check', 'Team members in this role understand what the customer needs and whether {{product}} fits.'],
    ['Offer', 'Team members in this role present the right offer and explain the terms clearly.'],
    ['Objections', 'Team members in this role handle doubts about price, terms and alternatives.'],
    ['Purchase', 'Team members in this role complete the purchase and make sure the customer is set up.'],
  ],
  'b2c-service': [
    ['Enquiry', 'Team members in this role respond to people who ask about {{product}}.'],
    ['Consultation', 'Team members in this role hold a first consultation to understand the customer\'s goals.'],
    ['Recommendation', 'Team members in this role recommend the right plan and explain what it includes.'],
    ['Enrolment', 'Team members in this role complete the paperwork and enrol the customer.'],
    ['Activation', 'Team members in this role make sure the customer starts using {{product}} in the first weeks.'],
  ],
};

// ---------- generic event texts for any industry ----------
// Keys are event archetypes; `LEGACY_EVENT_ARCHETYPE` maps the iLead events to them.

export const GENERIC_EVENTS = {
  crisis: { name: 'Public incident', text: 'A serious incident involving {{product}} at a customer site in {{city}} makes the news. It damages the brand and makes it hard for the team to close deals.' },
  newFeature: { name: 'New feature, no training', text: '{{company}} has launched a new feature for {{product}}, but the team has not been trained on it. They fumble when customers ask about the much-advertised feature.' },
  supplyDelay: { name: 'Delivery delays', text: 'A disruption at a key partner delays delivery of {{product}}. The team finds it hard to answer customers whose orders are late.' },
  publicCriticism: { name: 'Critical review', text: 'An influential industry review criticizes {{product}}, claiming its features already exist in competitors\' offerings and are not innovative.' },
  regulation: { name: 'New compliance rules', text: 'New compliance rules introduce several approvals before a sale can close. The team is buried in paperwork and slows down.' },
  resourceGap: { name: 'Tools request refused', text: 'Senior management has refused to fund new demo devices for the team. Competitors dazzle prospects with slick presentations while the team makes do.' },
  acquisition: { name: 'Rumours of being acquired', text: 'There are serious rumours that {{company}} might be acquired by {{competitor}}. The team finds it hard to convince customers that {{product}} will not be abandoned.' },
  scandal: { name: 'Board scandal', text: '{{company}}\'s long-time board member, {{board_member}}, is embroiled in an insider trading scandal. {{actor}} tells you that {{he}} is embarrassed to meet clients who keep asking about it.' },
};

export const LEGACY_EVENT_ARCHETYPE = {
  'tragic-accident': 'crisis',
  'new-microprocessor-in-the-market': 'newFeature',
  'strike-at-supplier-s-factories': 'supplyDelay',
  'elevator-review-website-criticizes': 'publicCriticism',
  'business-process-change': 'regulation',
  'tablet-pc-issue': 'resourceGap',
  'rumors-of-being-acquired': 'acquisition',
  'insider-trading-scandal': 'scandal',
};

// ---------- industries ----------

export const INDUSTRIES = {
  elevators: {
    label: 'Elevators',
    legacy: true,
    noun: 'elevator',
    orgPhrase: 'a relatively small elevator company',
    vision: 'revolutionize the elevator industry through state-of-the-art innovations',
    sampleOrg: 'Innov8 Elevators',
    competitor: 'Uplift',
    rival: 'Beta Elevators',
    product: { name: 'Levo B10', category: 'elevator', customer: 'b2b', portfolio: ['Lofty S10', 'ArmTech V60'] },
    service: {
      name: 'Innov8 CarePlus', category: 'elevator maintenance contract', customer: 'b2b', portfolio: ['Innov8 Modernise', 'Innov8 Rapid Response'],
      brief: '{{product}} is our newest maintenance contract. It combines predictive monitoring with guaranteed response times, and building managers who have tried it say they have never had fewer breakdowns.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}\'s service business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Sales Director', service: 'Head of Service Sales' },
    valueUSD: { product: 50000, service: 18000 },
    terms: ['elevator', 'high-rise', 'microprocessor'],
  },
  banking: {
    label: 'Banking and financial services',
    noun: 'banking',
    orgPhrase: 'a young, fast-growing bank',
    vision: 'make banking simple, fair and fast for every customer',
    sampleOrg: 'Meridian Bank',
    competitor: 'Crestline Bank',
    rival: 'Harbor Trust Bank',
    product: {
      name: 'FlexiHome Loan', category: 'home loan', customer: 'b2c', portfolio: ['Meridian Gold Card', 'SmartSave Account'],
      brief: '{{product}} is the newest addition to our lending portfolio and one of our star products. It offers same-week approval, flexible prepayment and a fully digital application, and early customers rate it highly.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the flagship of {{company}}\'s retail business. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Meridian Wealth Advisory', category: 'wealth advisory service', customer: 'b2c', portfolio: ['Meridian Private', 'Retirement Planner'],
      brief: '{{product}} gives customers a dedicated advisor and a plan built around their goals. Clients who have tried it trust us with more of their savings.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the heart of {{company}}\'s relationship business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Regional Sales Head', service: 'Head of Relationship Management' },
    valueUSD: { product: 6000, service: 9000 },
    stages: {
      'b2c-product': [
        ['Leads', 'Team members in this role follow up on enquiries and referrals from people interested in {{product}}.'],
        ['Eligibility check', 'Team members in this role check income, credit history and eligibility for {{product}}.'],
        ['Offer', 'Team members in this role present the rate, tenure and terms and answer questions.'],
        ['Documents and KYC', 'Team members in this role collect documents and complete know-your-customer checks.'],
        ['Disbursal', 'Team members in this role get final approval and disburse the loan.'],
      ],
    },
    events: {
      crisis: { name: 'Fraud scare', text: 'A phishing scam using {{company}}\'s name hits customers across {{city}}. It damages trust in the brand and makes it hard for the team to sign up new customers.' },
      newFeature: { name: 'New app, no training', text: '{{company}} has launched a new mobile app feature for {{product}}, but the team has not been trained on it. They fumble when customers ask how it works.' },
      supplyDelay: { name: 'Core banking outage', text: 'A core banking system upgrade goes wrong and applications are stuck for days. The team struggles to explain the delays to customers.' },
      publicCriticism: { name: 'Critical comparison site review', text: 'A popular comparison website ranks {{product}} below {{competitor}}\'s offer and calls its features ordinary.' },
      regulation: { name: 'Stricter KYC rules', text: 'The regulator tightens know-your-customer rules, adding checks before any account can be opened. The team is buried in paperwork.' },
    },
    terms: ['loan', 'branch', 'KYC', 'credit'],
  },
  insurance: {
    label: 'Insurance',
    noun: 'insurance',
    orgPhrase: 'a growing insurer',
    vision: 'make protection easy to understand and quick to claim',
    sampleOrg: 'Evergreen Assurance',
    competitor: 'Sentinel Life',
    rival: 'Harbor Mutual',
    product: {
      name: 'SecureFamily Plus', category: 'life insurance plan', customer: 'b2c', portfolio: ['HealthFirst Cover', 'MotorSafe'],
      brief: '{{product}} is our newest protection plan. It combines life cover with critical illness benefits and a promise to settle claims in seven days.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the flagship of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Evergreen Corporate Care', category: 'group health plan', customer: 'b2b', portfolio: ['Evergreen Travel Cover', 'Evergreen Key Person'],
      brief: '{{product}} covers employees and their families with one simple plan and a dedicated claims desk. HR teams who use it say it is the easiest benefit they manage.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can lead {{company}}\'s corporate business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Head of Agency Sales', service: 'Head of Corporate Sales' },
    valueUSD: { product: 2500, service: 40000 },
    stages: {
      'b2c-product': [
        ['Leads', 'Team members in this role reach people who may need {{product}}.'],
        ['Needs analysis', 'Team members in this role understand the family\'s protection needs and budget.'],
        ['Quote', 'Team members in this role prepare and explain the quote.'],
        ['Underwriting', 'Team members in this role collect medical and financial details for underwriting.'],
        ['Policy issued', 'Team members in this role complete payment and issue the policy.'],
      ],
    },
    events: {
      crisis: { name: 'Claims backlash', text: 'A widely shared story about a rejected claim in {{city}} goes viral. Prospects now doubt that {{company}} pays out, and the team struggles to close.' },
      newFeature: { name: 'New rider, no training', text: 'A new rider has been added to {{product}}, but the team has not been trained on it. They fumble when customers ask what it covers.' },
      supplyDelay: { name: 'Underwriting backlog', text: 'The underwriting team is short-staffed and approvals are taking weeks. The team finds it hard to answer customers waiting for their policies.' },
      publicCriticism: { name: 'Critical ratings report', text: 'An independent ratings agency calls {{product}} expensive for what it covers and ranks it below {{competitor}}.' },
      regulation: { name: 'New disclosure rules', text: 'New regulations require detailed disclosures and a cooling-off call before any policy is issued. The team is slowed down by paperwork.' },
    },
    terms: ['policy', 'claim', 'premium'],
  },
  medtech: {
    label: 'Healthcare and medical devices',
    noun: 'medical technology',
    orgPhrase: 'a growing medical technology company',
    vision: 'bring hospital-grade monitoring to every patient who needs it',
    sampleOrg: 'Northwind Medical',
    competitor: 'Vitalis',
    rival: 'Beacon Health',
    product: {
      name: 'CardioSense X2', category: 'cardiac monitor', customer: 'b2b', portfolio: ['PulseTrack', 'OxyWatch'],
      brief: '{{product}} is our newest cardiac monitor and one of our star products. It is accurate, easy for nurses to use and its modular design keeps maintenance simple for hospitals.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Northwind RemoteCare', category: 'remote patient monitoring service', customer: 'b2b', portfolio: ['Northwind Analytics', 'Northwind Training Academy'],
      brief: '{{product}} lets hospitals monitor discharged patients at home, with alerts reviewed by our clinical team. Early partners have cut readmissions noticeably.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the core of {{company}}\'s service business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Regional Sales Director', service: 'Head of Hospital Partnerships' },
    valueUSD: { product: 45000, service: 60000 },
    events: {
      crisis: { name: 'Device recall rumour', text: 'A report of a faulty {{category}} at a hospital in {{city}} spreads quickly. Even though it was not {{product}}, buyers are nervous and the team finds it hard to close.' },
      newFeature: { name: 'New software, no training', text: 'A software update adds remote alerts to {{product}}, but the team has not been trained on it. They fumble when clinicians ask how it works.' },
      supplyDelay: { name: 'Component shortage', text: 'A shortage of a key sensor delays shipments of {{product}}. The team struggles to answer hospitals whose orders are late.' },
      publicCriticism: { name: 'Critical journal letter', text: 'A letter in a clinical journal claims {{product}} offers nothing that {{competitor}} does not already provide.' },
      regulation: { name: 'Procurement rule change', text: 'Hospitals introduce a new procurement committee that must approve every purchase. Deals now need extra paperwork and slow down.' },
    },
    terms: ['hospital', 'patient', 'clinical'],
  },
  pharma: {
    label: 'Pharmaceuticals',
    noun: 'pharmaceutical',
    orgPhrase: 'a growing pharmaceutical company',
    vision: 'bring affordable, trusted medicines to every clinic',
    sampleOrg: 'Aurelia Pharma',
    competitor: 'Novaris Labs',
    rival: 'Crescent Healthcare',
    product: {
      name: 'Glucora XR', category: 'diabetes medicine', customer: 'b2b', portfolio: ['Cardiva', 'Respira'],
      brief: '{{product}} is our newest once-a-day diabetes medicine and one of our star launches. Doctors like its safety profile and patients find it easy to stay on.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Aurelia CareConnect', category: 'patient support programme', customer: 'b2b', portfolio: ['Aurelia Diagnostics', 'Aurelia Academy'],
      brief: '{{product}} helps clinics support patients between visits with reminders, education and nurse calls. Doctors who use it see better adherence.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become a signature of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Zonal Sales Manager', service: 'Head of Institutional Partnerships' },
    valueUSD: { product: 8000, service: 20000 },
    stages: {
      'b2b-product': [
        ['Territory mapping', 'Team members in this role map doctors and clinics in the territory who treat patients who may benefit from {{product}}.'],
        ['Doctor engagement', 'Team members in this role secure first meetings with doctors and understand their prescribing needs.'],
        ['Detailing', 'Team members in this role present the clinical evidence for {{product}} and answer questions.'],
        ['Access and listing', 'Team members in this role work with hospitals and pharmacies to list {{product}}.'],
        ['Prescription uptake', 'Team members in this role follow up so doctors start and keep prescribing {{product}}.'],
      ],
    },
    events: {
      crisis: { name: 'Safety scare', text: 'A news story in {{city}} links a competitor\'s {{category}} to side effects. Doctors grow cautious about the whole class, and the team finds it hard to win new prescribers.' },
      newFeature: { name: 'New dosage, no training', text: 'A new dosage of {{product}} has been approved, but the team has not been trained on it. They fumble when doctors ask about switching patients.' },
      supplyDelay: { name: 'Stock shortage', text: 'A manufacturing delay leaves pharmacies short of {{product}}. The team struggles to answer doctors whose patients cannot find it.' },
      publicCriticism: { name: 'Critical medical review', text: 'A respected medical review says {{product}} offers little over {{competitor}}\'s older, cheaper alternative.' },
      regulation: { name: 'Stricter marketing code', text: 'A stricter marketing code now requires approvals for every doctor meeting and sample. The team is buried in compliance paperwork.' },
    },
    terms: ['doctor', 'prescription', 'clinic'],
  },
  it: {
    label: 'IT services and software',
    noun: 'technology',
    orgPhrase: 'a fast-growing technology company',
    vision: 'help businesses run on software that just works',
    sampleOrg: 'Brightpath Technologies',
    competitor: 'Stackline',
    rival: 'Nimbus Systems',
    product: {
      name: 'CloudOps Suite', category: 'cloud management platform', customer: 'b2b', portfolio: ['SecureDesk', 'DataBridge'],
      brief: '{{product}} is our newest platform and one of our star products. It gives IT teams one view of every cloud, cuts costs and is quick to roll out.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Brightpath Managed Services', category: 'managed IT service', customer: 'b2b', portfolio: ['Brightpath Consulting', 'Brightpath Security Operations'],
      brief: '{{product}} runs clients\' infrastructure around the clock with guaranteed service levels. Clients who switch to us rarely go back.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the backbone of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Head of Enterprise Sales', service: 'Director of Client Partnerships' },
    valueUSD: { product: 35000, service: 120000 },
    events: {
      crisis: { name: 'Security breach headline', text: 'A data breach at a client in {{city}} is wrongly linked to {{product}} in the press. Prospects pause their decisions and the team finds it hard to close.' },
      newFeature: { name: 'New release, no training', text: 'A major release of {{product}} has shipped, but the team has not been trained on it. They fumble when clients ask about the new AI features.' },
      supplyDelay: { name: 'Delivery bench shortage', text: 'The delivery team is fully booked, so new projects cannot start for weeks. The team struggles to answer clients who want to begin.' },
      publicCriticism: { name: 'Critical analyst report', text: 'An analyst report places {{product}} behind {{competitor}}, calling its features catch-up rather than innovation.' },
      regulation: { name: 'Data protection review', text: 'New data protection rules mean every contract needs a legal and security review before signature. Deals slow down.' },
    },
    terms: ['software', 'cloud', 'client'],
  },
  manufacturing: {
    label: 'Manufacturing and industrial equipment',
    noun: 'industrial equipment',
    orgPhrase: 'a mid-sized manufacturer',
    vision: 'make factories safer and more productive',
    sampleOrg: 'Ironclad Industries',
    competitor: 'Torque Systems',
    rival: 'Anvil Machinery',
    product: {
      name: 'FlexLine 500', category: 'automated assembly line', customer: 'b2b', portfolio: ['PressMaster', 'RoboWeld'],
      brief: '{{product}} is our newest line and one of our star products. It is reliable, flexible and its modular design makes it easy for plants to maintain.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Ironclad Uptime', category: 'predictive maintenance service', customer: 'b2b', portfolio: ['Ironclad Retrofit', 'Ironclad Parts Express'],
      brief: '{{product}} keeps plants running with sensors, predictive alerts and engineers on call. Plants that use it report far fewer stoppages.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can lead {{company}}\'s service business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Sales Director', service: 'Head of Aftermarket Sales' },
    valueUSD: { product: 250000, service: 30000 },
    events: {
      crisis: { name: 'Plant accident', text: 'An accident at a factory in {{city}} involving equipment like {{product}} makes the news. Buyers grow cautious and the team finds it hard to close.' },
      newFeature: { name: 'New controller, no training', text: 'A new smart controller has been added to {{product}}, but the team has not been trained on it. They fumble when plant heads ask about it.' },
      supplyDelay: { name: 'Strike at supplier', text: 'A strike at a key supplier delays shipments of {{product}}. The team struggles to answer customers whose orders are late.' },
      publicCriticism: { name: 'Critical trade review', text: 'A trade magazine claims the features of {{product}} already exist in {{competitor}}\'s machines and are not innovative.' },
      regulation: { name: 'Export compliance change', text: 'New export compliance rules add several approvals before a sale can close. The team is buried in paperwork.' },
    },
    terms: ['factory', 'plant', 'machine'],
  },
  telecom: {
    label: 'Telecom',
    noun: 'telecom',
    orgPhrase: 'a challenger telecom operator',
    vision: 'connect every business with fast, reliable networks',
    sampleOrg: 'Skyline Telecom',
    competitor: 'Nexa Networks',
    rival: 'Orbit Mobile',
    product: {
      name: 'Skyline Fibre Pro', category: 'business broadband plan', customer: 'b2b', portfolio: ['Skyline Mobile Fleet', 'Skyline Cloud Voice'],
      brief: '{{product}} is our newest plan and one of our star products. It offers guaranteed speeds, fast installation and a dedicated support line.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.',
    },
    service: {
      name: 'Skyline Managed Network', category: 'managed network service', customer: 'b2b', portfolio: ['Skyline Security', 'Skyline IoT Connect'],
      brief: '{{product}} designs, runs and monitors a company\'s whole network for one monthly fee. Clients who use it spend less time on outages and more on their business.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can lead {{company}}\'s enterprise business. We are counting on it to reach our end-of-year targets.',
    },
    learnerRole: { product: 'Head of SME Sales', service: 'Head of Enterprise Sales' },
    valueUSD: { product: 3000, service: 45000 },
    events: {
      crisis: { name: 'Network outage', text: 'A major outage leaves thousands of businesses in {{city}} offline for a day. The brand takes a hit and the team finds it hard to sign new customers.' },
      newFeature: { name: 'New bundle, no training', text: 'A new security bundle has been added to {{product}}, but the team has not been trained on it. They fumble when customers ask about it.' },
      supplyDelay: { name: 'Installation backlog', text: 'Field engineers are overbooked and installations are delayed by weeks. The team struggles to answer customers waiting to go live.' },
      publicCriticism: { name: 'Critical speed test report', text: 'A widely read speed test report ranks {{product}} behind {{competitor}} and calls the plan overpriced.' },
      regulation: { name: 'New number porting rules', text: 'New regulations add identity checks and a waiting period before a business can switch provider. Sales slow down.' },
    },
    terms: ['network', 'broadband', 'installation'],
  },
};

export const OTHER_INDUSTRY = {
  label: 'Other',
  noun: 'growing',
  vision: 'set a new standard for customers in our market',
  competitor: 'a larger competitor',
  rival: 'a competitor',
  product: { name: '', category: 'product', customer: 'b2b', portfolio: ['our established range', 'our entry range'], brief: '{{product}} is the newest addition to our portfolio and one of our star offerings. Early customer feedback has been encouraging.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.' },
  service: { name: '', category: 'service', customer: 'b2b', portfolio: ['our advisory services', 'our support plans'], brief: '{{product}} is the newest addition to our services and one clients already value. Early feedback has been encouraging.\n\nIf you can motivate and inspire the team to perform at their best, {{product}} can become the star of {{company}}. We are counting on it to reach our end-of-year targets.' },
  learnerRole: { product: 'Sales Director', service: 'Head of Client Services' },
  valueUSD: { product: 20000, service: 30000 },
  terms: [],
};

// ---------- locations ----------

export const LOCATIONS = {
  US: {
    label: 'United States', currency: 'USD', fx: 1, dealFactor: 1,
    cities: ['New York', 'Chicago', 'Austin', 'San Francisco', 'Atlanta'],
    destination: 'Hawaii', ceo: 'Roger Kent', board: 'Aaron King', lunch: 'Westernizza',
    institutions: { 'China Bank': 'Liberty National Bank', 'Manchester Business School': 'Midwest School of Business' },
    names: {
      she: ['Emily Carter', 'Grace Mitchell', 'Olivia Brooks', 'Hannah Reed', 'Sofia Ramirez', 'Chloe Bennett'],
      he: ['Jacob Turner', 'Ethan Walsh', 'Marcus Hill', 'Daniel Price', 'Tyler Morgan', 'Andre Coleman', 'Nathan Hayes', 'Caleb Foster', 'Logan Pierce', 'Isaac Grant', 'Owen Parker', 'Victor Lane', 'Ryan Cooper', 'Mason Ellis', 'Luis Ortega'],
    },
  },
  IN: {
    label: 'India', currency: 'INR', fx: 83, dealFactor: 0.4,
    cities: ['Mumbai', 'Bengaluru', 'Delhi', 'Pune', 'Chennai', 'Hyderabad'],
    destination: 'the Maldives', ceo: 'Anjali Mehra', board: 'Suresh Iyer', lunch: 'Saffron Court',
    institutions: { 'China Bank': 'Bharat Mercantile Bank', 'Manchester Business School': 'Western India Institute of Management' },
    names: {
      she: ['Priya Nair', 'Kavya Reddy', 'Sneha Kulkarni', 'Aditi Sharma', 'Meera Pillai', 'Ritu Bansal'],
      he: ['Rohan Verma', 'Arjun Menon', 'Vikram Joshi', 'Karan Malhotra', 'Siddharth Rao', 'Amit Deshpande', 'Nikhil Gupta', 'Rahul Chawla', 'Varun Iyer', 'Manish Patel', 'Sameer Khan', 'Deepak Singh', 'Aakash Mehta', 'Harish Kumar', 'Imran Qureshi'],
    },
  },
  AE: {
    label: 'United Arab Emirates', currency: 'AED', fx: 3.67, dealFactor: 0.9,
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah'],
    destination: 'the Seychelles', ceo: 'Khalid Al Mansoori', board: 'Omar Al Suwaidi', lunch: 'Al Fanar Terrace',
    institutions: { 'China Bank': 'Gulf Crescent Bank', 'Manchester Business School': 'Emirates School of Business' },
    names: {
      she: ['Fatima Al Hashimi', 'Layla Haddad', 'Noor Rahman', 'Aisha Karim', 'Sara Mathew', 'Mariam Yousef'],
      he: ['Ahmed Al Falasi', 'Yousef Nasser', 'Rashid Al Ketbi', 'Omar Farouk', 'Tariq Aziz', 'Hamza Saleh', 'Karim Boutros', 'Faisal Qasim', 'Ravi Menon', 'Daniel Brooks', 'Salem Al Nuaimi', 'Ali Hassan', 'Imran Sheikh', 'Joseph Thomas', 'Ziad Khoury'],
    },
  },
  GB: {
    label: 'United Kingdom', currency: 'GBP', fx: 0.79, dealFactor: 0.9,
    cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Edinburgh'],
    destination: 'Barbados', ceo: 'Charlotte Hughes', board: 'Edward Whitfield', lunch: 'The Crown and Anchor',
    institutions: { 'China Bank': 'Albion Commercial Bank', 'Manchester Business School': 'Northern School of Management' },
    names: {
      she: ['Amelia Clarke', 'Isla Thompson', 'Poppy Evans', 'Freya Wilson', 'Priya Shah', 'Hannah Lewis'],
      he: ['Oliver Wright', 'George Harris', 'Harry Walker', 'Jack Robinson', 'Thomas Green', 'Samuel Hall', 'William Turner', 'Callum Reid', 'Arjun Patel', 'Liam Murphy', 'Joseph King', 'Daniel Scott', 'Ben Ashworth', 'Kwame Mensah', 'Rhys Morgan'],
    },
  },
  SG: {
    label: 'Singapore', currency: 'SGD', fx: 1.35, dealFactor: 0.95,
    cities: ['Singapore'],
    destination: 'Bali', ceo: 'Wong Mei Ling', board: 'Tan Boon Huat', lunch: 'Lau Pa Sat Kitchen',
    institutions: { 'China Bank': 'Straits Merchant Bank', 'Manchester Business School': 'Marina Business School' },
    names: {
      she: ['Chloe Tan', 'Rachel Lim', 'Nurul Aisyah', 'Priya Raman', 'Grace Ong', 'Jasmine Lee'],
      he: ['Marcus Goh', 'Daniel Ng', 'Ryan Teo', 'Aaron Chua', 'Farhan Ismail', 'Kumar Selvam', 'Jonathan Koh', 'Benjamin Lau', 'Wei Jie Chen', 'Hafiz Rahman', 'Kelvin Toh', 'Sean Yeo', 'Arun Pillai', 'Joel Sim', 'Brandon Loh'],
    },
  },
  DE: {
    label: 'Germany', currency: 'EUR', fx: 0.92, dealFactor: 0.95,
    cities: ['Munich', 'Berlin', 'Frankfurt', 'Hamburg', 'Stuttgart'],
    destination: 'the Canary Islands', ceo: 'Katrin Vogel', board: 'Dieter Hartmann', lunch: 'Zum Goldenen Hirsch',
    institutions: { 'China Bank': 'Rheinland Handelsbank', 'Manchester Business School': 'Bavarian School of Management' },
    names: {
      she: ['Anna Schneider', 'Lena Fischer', 'Julia Weber', 'Sophie Wagner', 'Elif Yilmaz', 'Laura Becker'],
      he: ['Lukas Meyer', 'Jonas Hoffmann', 'Felix Schulz', 'Tobias Koch', 'Maximilian Richter', 'Leon Klein', 'Paul Wolf', 'David Neumann', 'Can Demir', 'Niklas Braun', 'Florian Zimmermann', 'Stefan Krüger', 'Moritz Lange', 'Jan Hartung', 'Tim Schröder'],
    },
  },
  AU: {
    label: 'Australia', currency: 'AUD', fx: 1.52, dealFactor: 1,
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
    destination: 'Fiji', ceo: 'Rebecca Nguyen', board: 'Graham Fletcher', lunch: 'The Harbour Grill',
    institutions: { 'China Bank': 'Southern Cross Bank', 'Manchester Business School': 'Pacific School of Business' },
    names: {
      she: ['Charlotte Kelly', 'Mia Thompson', 'Zoe Nguyen', 'Ruby Walsh', 'Ella Martin', 'Aria Singh'],
      he: ['Jack Mitchell', 'Lachlan Ryan', 'Cooper Hughes', 'Noah Campbell', 'Liam O\'Brien', 'Harrison Lee', 'Oscar Bennett', 'Kai Tran', 'Riley Stewart', 'Hamish Grant', 'Ethan Park', 'Declan Moore', 'Sam Patel', 'Brodie Clarke', 'Mitchell Evans'],
    },
  },
  JP: {
    label: 'Japan', currency: 'JPY', fx: 150, dealFactor: 0.9,
    cities: ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka'],
    destination: 'Okinawa', ceo: 'Haruka Sato', board: 'Kenji Morimoto', lunch: 'Sakura Dining',
    institutions: { 'China Bank': 'Kanto Commercial Bank', 'Manchester Business School': 'Kansai School of Management' },
    names: {
      she: ['Yui Tanaka', 'Aoi Suzuki', 'Mei Takahashi', 'Rina Watanabe', 'Sakura Ito', 'Hana Kobayashi'],
      he: ['Haruto Yamamoto', 'Ren Nakamura', 'Sota Kato', 'Yuto Yoshida', 'Daiki Yamada', 'Kaito Sasaki', 'Riku Matsumoto', 'Takumi Inoue', 'Shota Kimura', 'Kenta Hayashi', 'Hiroshi Shimizu', 'Naoki Mori', 'Ryo Ikeda', 'Yuki Hashimoto', 'Taro Ishikawa'],
    },
  },
};

export const OFFERING = {
  product: { label: 'A product', plural: 'products', team: 'sales' },
  service: { label: 'A service', plural: 'services', team: 'sales' },
};

export const DEPTHS = {
  light: { label: 'Light', note: 'Organization names, roles, city and money.' },
  standard: { label: 'Standard', note: 'Plus stages, welcome letter, product brief and industry events.' },
  deep: { label: 'Deep', note: 'Plus local names for every team member and local institutions in their profiles.' },
};
