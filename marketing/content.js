/* ============================================================
   MonkFlow marketing site — all copy and data.

   RULES FOR EDITING THIS FILE (see CLAUDE.md §0):
   - Never fabricate social proof. Team Financial Strategies (TFS) is the
     only named client, and the only client results on the site are the
     ones Jody Team confirmed: 45 min -> under 5 min onboarding, funding in
     2 business days vs 5-7, audit trail in under 30 seconds, 2-week build.
   - Demos are labelled as demos. No client names on them.
   - No prices and no "fixed-fee" language anywhere. Engagements are scoped
     individually.
   - Security claims are limited to what is true today: AES-256 at rest,
     TLS in transit, no client PII persisted on MonkFlow infrastructure,
     private deployment and zero-retention model options. Do NOT claim
     cyber liability insurance, a DPA on file, or any certification.
   - Listing a vendor system means "we build around it". Only mark a system
     `live: true` when it is running in production for a real client.

   Loaded in the browser as a classic script and in Node by
   scripts/prerender.mjs, so keep it free of DOM access.
   ============================================================ */
var MK = globalThis.MK || (globalThis.MK = {});

MK.site = {
  name: 'MonkFlow',
  url: 'https://monkflow.io',
  tagline: 'Custom software, workflow automation and practical AI for commercial real estate firms, banks and investment firms.',
  demos: {
    lending: 'https://lending.monkflow.io',
    land: 'https://demo.monkflow.io',
  },
};

// The four things MonkFlow builds. Used on the homepage and /capabilities.
MK.capabilities = [
  {
    key: 'tools',
    title: 'Custom internal tools and portals',
    body: 'Borrower, investor and client portals. Deal and loan pipelines. Review queues your team works from every morning. Built around your process instead of a template.',
    detail: 'Most firms run their real process in email, spreadsheets and a shared drive, next to systems that were never set up to match it. We build the missing screen: the portal a borrower or LP logs into, the queue an analyst works, the dashboard a partner checks before committee.',
    examples: 'Borrower document portals, LP onboarding portals, deal pipelines, exception queues',
  },
  {
    key: 'integrations',
    title: 'System and core integrations',
    body: 'Data moves between the CRM, core, property-management and fund-admin systems you already pay for. Nobody re-keys it, and there is no new platform to adopt.',
    detail: 'We connect through vendor APIs where your license allows it, and through scheduled exports and reports where it does not. Either way the record lands in your system of record, with a log of what moved and when.',
    examples: 'CRM sync, core and LOS extracts, property-management reports, fund-admin exports',
  },
  {
    key: 'documents',
    title: 'Document and underwriting automation',
    body: 'Offering memoranda, rent rolls, T-12s, tax returns and financial statements become structured data, then your model, memo or signed PDF.',
    detail: 'Extraction is the easy part. The work is in the checks: totals that must reconcile, values that must agree across documents, and a reviewer who sees exactly which page each number came from before anything is accepted.',
    examples: 'Rent roll and T-12 extraction, financial spreading, credit and IC memo drafts, pre-filled signed PDFs',
  },
  {
    key: 'ai',
    title: 'Practical AI workflows',
    body: 'Extraction, drafting and triage with a person reviewing the output, every figure linked to its source page, and a full audit log.',
    detail: 'We use AI where reading and drafting are the bottleneck, and plain deterministic code everywhere else. Anything a model produces goes through validation rules and a human reviewer before it reaches a system of record or a client.',
    examples: 'Lease abstraction, memo first drafts, deal-flow triage, quarterly letter drafts',
  },
];

MK.principles = [
  { title: 'A person reviews every output', body: 'AI drafts and extracts. Your analyst, credit officer or operations lead approves. Nothing reaches a system of record on its own.' },
  { title: 'Every figure traces to its source', body: 'Each extracted value links back to the document and page it came from, so a reviewer can check it in seconds.' },
  { title: 'Private and zero-retention options', body: 'Run models in your own cloud, or through configurations where the provider does not retain your documents.' },
];

MK.flowSteps = [
  { title: 'Documents in', body: 'Uploads, email attachments, system exports.' },
  { title: 'Extract', body: 'Fields pulled into a fixed structure, with the source page recorded.' },
  { title: 'Review', body: 'Validation rules run. A person confirms or corrects what is flagged.' },
  { title: 'System of record', body: 'Approved data lands in your model, CRM, core or fund-admin system.' },
  { title: 'Report', body: 'Memos, statements and audit trails generated from approved data.' },
];

// How an engagement runs. Deliberately has no prices: every engagement is
// scoped to the workflow.
MK.process = [
  { title: 'Discover', body: 'We map the workflow as it actually runs: who touches it, which systems, where the re-keying and waiting happen.' },
  { title: 'Design', body: 'We decide where automation and AI pay for themselves and where they do not. You get a written scope before any build starts.' },
  { title: 'Build and deploy', body: 'You see working software early, on your own documents and data, and your team tests it before it goes live.' },
  { title: 'Operate and iterate', body: 'After launch you keep a direct line to the engineer who built it, for fixes, changes and the next workflow.' },
];

MK.engagements = [
  { title: 'Workflow audit', body: 'A short, contained first step. We map one workflow and its systems, rank the automation opportunities, and write up scope and data handling so your team can decide with facts.', note: 'Where most firms start' },
  { title: 'Targeted build', body: 'One workflow, automated end to end. For example: rent roll to model, a borrower document portal, or LP onboarding.', note: 'Typically live in weeks' },
  { title: 'Operating system', body: 'Several connected workflows, the integrations between your systems, a portal and a review queue, delivered in stages.', note: 'Staged delivery' },
  { title: 'Operate and iterate', body: 'Ongoing support for what we built: fixes, changes, monitoring of extraction quality, and new workflows as you find them.', note: 'After launch' },
];

// Team Financial Strategies: the one real, named client. Numbers confirmed
// by Jody Team. Do not add or change figures without confirmation.
MK.tfs = {
  path: '/case-studies/team-financial-strategies',
  name: 'Team Financial Strategies',
  descriptor: '4-advisor wealth management firm, Abilene, Texas',
  headline: 'New-client onboarding cut from 45 minutes to under 5',
  summary: 'A custom intake form, Redtail sync and signed-PDF generation replaced a paper, PDF and re-typing workflow. Built and live in two weeks.',
  metrics: [
    { value: '45 → under 5 min', label: 'Staff time per new-client onboarding' },
    { value: '2 weeks', label: 'From kickoff to live' },
    { value: '2 days', label: 'For new accounts to fund, down from 5 to 7' },
    { value: 'Under 30 sec', label: 'To pull a complete audit trail for any client' },
  ],
};

// Working demos built by MonkFlow. Synthetic data, no client names.
MK.demoList = [
  {
    key: 'lending',
    vertical: 'banks',
    label: 'Working demo · Banking',
    title: 'Commercial loan document portal',
    body: 'Each borrower gets one link to a live checklist of what has arrived and what is missing. The personal financial statement and debt schedule are completed online and come back as clean PDFs. The banker accepts or returns each document and sends reminders listing exactly what is outstanding. Uploads are encrypted at rest.',
    url: 'https://lending.monkflow.io',
    cta: 'Open the demo',
  },
  {
    key: 'land',
    vertical: 'cre',
    label: 'Working demo · Commercial real estate',
    title: 'Land search for brokers',
    body: 'Type a client\'s land request the way they wrote it. The tool sets the filters, checks every parcel in the search area against public county records, and sorts each one as a match, needs a look, or not available, with the owner, zoning and reason. One click produces a client-ready PDF with a numbered map and a page per parcel.',
    url: 'https://demo.monkflow.io',
    cta: 'Watch the walkthrough',
  },
];

/* ------------------------------------------------------------
   Verticals
   ------------------------------------------------------------ */
MK.verticals = {
  cre: {
    key: 'cre',
    path: '/solutions/commercial-real-estate',
    name: 'Commercial real estate',
    nav: 'Commercial real estate',
    navNote: 'Acquisitions, asset management, development, brokerage',
    bookAs: 'Commercial real estate',
    selector: {
      workflows: 'OM, rent roll and T-12 extraction · IC memos · LP onboarding and capital calls',
      systems: 'Yardi · MRI · Juniper Square · Dealpath · Excel',
    },
    hero: {
      eyebrow: 'For commercial real estate firms',
      h1: 'Underwrite more deals without hiring more analysts.',
      sub: 'Offering memoranda, rent rolls and T-12s go straight into your model. IC memos are drafted in your template from approved numbers. Investor onboarding and capital calls run without the spreadsheet relay.',
    },
    audience: 'Acquisitions, asset management, development, brokerage and syndication teams.',
    pains: [
      { title: 'Analysts re-key before they analyze', body: 'Every new deal starts with hours of typing rent rolls and T-12s from PDFs and broker spreadsheets into the model.' },
      { title: 'IC memos are assembled by hand', body: 'The same figures get copied from the model, the OM and the comps into a document, and re-copied whenever an assumption changes.' },
      { title: 'Lease abstracts are always behind', body: 'Options, escalations and recoveries sit in scanned leases until someone has a free week.' },
      { title: 'Investor operations live in email', body: 'Subscription documents, capital call notices and distribution statements move through inboxes and tracking spreadsheets.' },
    ],
    workflows: [
      { title: 'OM, rent roll and T-12 extraction', today: 'An analyst types unit mixes, in-place rents and trailing financials into the model before any real underwriting starts.', build: 'Upload the deal package. Unit mix, rents, T-12 line items and key OM terms land in your model\'s input tabs, each value linked to its source page, with totals reconciled before anything is accepted.', systems: 'Excel models · CoStar and CREXi exports · Dealpath' },
      { title: 'Underwriting and IC memo drafts', today: 'Memos are built by copying from the model, the OM and market comps, then rebuilt when numbers move.', build: 'A first draft in your own template, generated from approved model outputs and source documents. The analyst edits and signs off, and every figure ties back to the model.', systems: 'Excel · Word and PDF templates · Dealpath' },
      { title: 'Lease abstraction', today: 'Critical dates and clauses are read out of scanned leases one at a time.', build: 'Abstracts with clause-level citations for term, options, escalations, co-tenancy and expense recoveries. Flagged items go to a reviewer queue, and approved abstracts export in the format your property system takes.', systems: 'Yardi · MRI Software · AppFolio' },
      { title: 'LP onboarding, capital calls and distributions', today: 'Subscription documents, tax forms and notices are chased by email and tracked in a spreadsheet.', build: 'An investor portal for subscription documents, accreditation, tax forms and e-signature, with capital call and distribution notices generated from your records.', systems: 'Juniper Square · Salesforce · DocuSign' },
      { title: 'Asset management reporting', today: 'Monthly property reports are downloaded, re-formatted and rolled up by hand.', build: 'Property-level reports pulled on a schedule and rolled into a portfolio view, with variances against budget flagged for the asset manager.', systems: 'Yardi · MRI Software · AppFolio · Excel' },
    ],
    panel: {
      doc: 'Deal package: rent roll, T-12, offering memorandum',
      rows: [
        { field: 'Units', value: '142', source: 'Rent roll, p. 2', ok: true },
        { field: 'Average in-place rent', value: '$1,418', source: 'Rent roll, pp. 2–6', ok: true },
        { field: 'T-12 net operating income', value: '$1,284,300', source: 'T-12, p. 1', ok: true },
        { field: 'Occupancy', value: '93.7%', source: 'Rent roll, p. 6', ok: false, note: 'OM states 95%. Confirm which to use.' },
      ],
    },
    integrations: [
      { name: 'Yardi', role: 'Property management and accounting', how: 'Scheduled reports and exports; API where licensed' },
      { name: 'MRI Software', role: 'Property management and accounting', how: 'API and exports' },
      { name: 'AppFolio', role: 'Property management', how: 'Exports; partner API where available' },
      { name: 'Juniper Square', role: 'Investor management', how: 'Exports and API' },
      { name: 'Dealpath', role: 'Deal pipeline', how: 'API' },
      { name: 'CoStar / CREXi', role: 'Market and listing data', how: 'Your exports' },
      { name: 'Salesforce', role: 'CRM', how: 'API' },
      { name: 'DocuSign', role: 'E-signature', how: 'API' },
      { name: 'Excel models', role: 'Underwriting', how: 'Reads and writes your workbook directly' },
    ],
    roi: { unit: 'Deals screened per month', volume: 20, minutes: 180, minutesLabel: 'Minutes of data entry and assembly per deal', rate: 85 },
    proof: { demo: 'land', note: 'Our named client work is in wealth management. For commercial real estate, here is working software you can look at, and the same intake-to-system-of-record pattern running in production at a financial firm.' },
    security: [
      'Deal documents and investor records stay in your systems. We do not keep a copy of investor PII on MonkFlow infrastructure.',
      'Role-based access, so a broker, an analyst and an LP each see only what they should.',
      'Every extraction, edit and approval is logged with who and when.',
    ],
    faq: [
      { q: 'Will this work with our existing Excel model?', a: 'Yes. We build to your workbook as it is: your tabs, your input cells, your naming. You do not have to move to a new modeling tool.' },
      { q: 'How do you keep extracted numbers accurate?', a: 'Three ways. Validation rules catch what should reconcile and does not, such as rent roll totals or T-12 subtotals. Every value links to its source page. And a person reviews flagged items before anything is accepted into the model.' },
      { q: 'Have you worked with commercial real estate firms before?', a: 'Our named client work so far is in wealth management, with Team Financial Strategies. For commercial real estate we have built a working land search tool for brokers, which you can see today. We would rather show you working software on your own documents than a wall of logos.' },
      { q: 'What does an engagement cost?', a: 'It depends on the workflow, the systems involved and how much review tooling your team needs. Every engagement is scoped individually, and you see a written scope and quote before any build work starts.' },
    ],
    meta: {
      title: 'Custom Software & AI for Commercial Real Estate Firms | MonkFlow',
      description: 'Rent roll, T-12 and OM extraction into your model, IC memo drafts, lease abstraction and LP onboarding portals. Custom-built for CRE firms by a founder-led engineering shop.',
      serviceType: 'Custom software and workflow automation for commercial real estate firms',
      audience: 'Commercial real estate firms',
      og: '/assets/og/commercial-real-estate.png',
    },
  },

  banks: {
    key: 'banks',
    path: '/solutions/banks',
    name: 'Banks',
    nav: 'Banks',
    navNote: 'Community, regional and commercial banks',
    bookAs: 'Bank',
    selector: {
      workflows: 'Loan intake portals · Financial spreading and credit memos · KYC and BSA document trails',
      systems: 'nCino · Jack Henry · Fiserv · FIS · Baker Hill',
    },
    hero: {
      eyebrow: 'For community, regional and commercial banks',
      h1: 'Close commercial loans faster, without replacing your core.',
      sub: 'Borrower document portals, financial spreading and credit memo assembly, and KYC document trails that sit alongside the core and loan origination system you already run.',
    },
    audience: 'Commercial lending, credit, treasury management and deposit operations teams.',
    pains: [
      { title: 'Document collection runs on email', body: 'Lenders chase tax returns, financial statements and entity documents one reminder at a time, and nobody has one view of what is still missing.' },
      { title: 'Spreading is manual', body: 'Analysts key tax returns and financial statements into a spreading template line by line.' },
      { title: 'Credit memos are copy and paste', body: 'The same borrower facts are pulled from five systems into one document, for every request and every renewal.' },
      { title: 'Exam prep is a scramble', body: 'KYC and beneficial ownership evidence exists, but assembling it for a specific customer takes hours.' },
    ],
    workflows: [
      { title: 'Commercial loan intake and document portal', today: 'Checklists live in a spreadsheet and documents arrive as email attachments.', build: 'Each borrower gets one secure link to a live checklist. They upload documents and complete the personal financial statement and debt schedule online. The banker accepts or returns each item and sends reminders listing exactly what is outstanding.', systems: 'nCino · Baker Hill · your document imaging system' },
      { title: 'Financial spreading and credit memo assembly', today: 'Tax returns are keyed by hand, then the memo is assembled from scratch.', build: 'Returns and statements are extracted into your spreading template with each line linked to its source page. A memo draft is generated in your format from the approved spread. The analyst reviews, corrects and owns the result.', systems: 'Your spreading template · nCino · Baker Hill' },
      { title: 'KYC, AML and BSA document collection', today: 'Beneficial ownership certifications and identification are collected ad hoc and filed inconsistently.', build: 'A guided collection flow for entity documents, beneficial ownership and identification, time-stamped at every step, with a per-customer evidence file you can export for an examiner.', systems: 'Core customer records · Salesforce Financial Services Cloud' },
      { title: 'Treasury management onboarding', today: 'Service setup forms, signer authority and entitlements are gathered on paper and re-typed.', build: 'One online onboarding package per client: services, accounts, signers and user entitlements collected once, routed for approval, and handed to operations in the format they key from.', systems: 'Core and treasury platforms · e-signature' },
      { title: 'Covenant and tickler tracking', today: 'Reporting requirements are tracked in calendars and spreadsheets.', build: 'Covenants and reporting requirements tracked per loan, borrower reminders sent automatically, and exceptions surfaced to the relationship manager before they age.', systems: 'Loan system extracts · your tickler process' },
    ],
    panel: {
      doc: 'Loan file: business tax return, financial statements, personal financial statement',
      rows: [
        { field: 'Revenue, fiscal year', value: '$4,812,000', source: 'Tax return, p. 1', ok: true },
        { field: 'EBITDA', value: '$612,400', source: 'Computed from spread', ok: true },
        { field: 'Global debt service coverage', value: '1.31x', source: 'Computed from spread', ok: true },
        { field: 'Personal financial statement', value: 'Received', source: 'Signed PDF', ok: false, note: 'Schedule total differs from summary by $2,500.' },
      ],
    },
    integrations: [
      { name: 'nCino', role: 'Loan origination', how: 'Salesforce platform APIs' },
      { name: 'Jack Henry', role: 'Core banking', how: 'jXchange APIs and core extracts, through your access' },
      { name: 'Fiserv', role: 'Core banking', how: 'APIs and core extracts, through your access' },
      { name: 'FIS', role: 'Core banking', how: 'APIs and core extracts, through your access' },
      { name: 'Baker Hill', role: 'Loan origination and credit', how: 'Exports; API where licensed' },
      { name: 'Salesforce Financial Services Cloud', role: 'CRM', how: 'API' },
      { name: 'Internal core APIs', role: 'Your own services', how: 'API' },
    ],
    roi: { unit: 'Commercial loan files per month', volume: 30, minutes: 240, minutesLabel: 'Minutes of document chasing, spreading and memo assembly per file', rate: 95 },
    proof: { demo: 'lending', note: 'Our named client work is in wealth management. For banking, we built a working commercial loan document portal you can open right now.' },
    security: [
      'Borrower and customer data stays in your systems. We do not keep a copy of customer PII on MonkFlow infrastructure.',
      'Deployment inside your own cloud environment is available, so data never leaves your perimeter.',
      'AES-256 encryption at rest and TLS in transit, role-based access for lenders, credit and operations, and an event log of every upload, download and decision.',
      'We complete your vendor due-diligence questionnaire and walk your information security team through the architecture before any data moves.',
    ],
    faq: [
      { q: 'Do you replace our core or loan origination system?', a: 'No. We build the layer around them: the borrower-facing portal, the extraction and review step, and the integration that puts approved data where it belongs.' },
      { q: 'Where does borrower data live?', a: 'In your systems. What we build can be deployed inside your own cloud environment. Files are encrypted at rest with AES-256, and we do not keep a copy of customer PII on MonkFlow infrastructure.' },
      { q: 'How is AI used in credit work?', a: 'For reading and drafting only: pulling figures out of returns and statements, and producing a first draft of a memo in your format. Calculations are deterministic, every figure links to its source page, and a credit analyst reviews and approves the result. Models can run in your own cloud or under zero-retention configurations.' },
      { q: 'Have you worked with banks before?', a: 'Our named client work so far is in wealth management, with Team Financial Strategies. For banking we have built a working commercial loan document portal with encrypted uploads, online financial forms and a banker dashboard, which you can try today.' },
      { q: 'What does an engagement cost?', a: 'It depends on the workflow, the systems involved and your deployment requirements. Every engagement is scoped individually, and you see a written scope and quote before any build work starts.' },
    ],
    meta: {
      title: 'Loan Intake, Spreading & KYC Automation for Banks | MonkFlow',
      description: 'Borrower document portals, financial spreading, credit memo assembly and KYC document trails for community, regional and commercial banks. Works alongside your core and LOS.',
      serviceType: 'Custom software and workflow automation for banks',
      audience: 'Community, regional and commercial banks',
      og: '/assets/og/banks.png',
    },
  },

  funds: {
    key: 'funds',
    path: '/solutions/investment-firms',
    name: 'Investment firms',
    nav: 'Investment firms',
    navNote: 'Private equity, venture, family offices, asset managers',
    bookAs: 'Investment firm',
    selector: {
      workflows: 'LP onboarding · Portfolio KPI reporting · Quarterly letters and capital statements',
      systems: 'DealCloud · Juniper Square · Carta · Addepar · Redtail',
    },
    hero: {
      eyebrow: 'For private equity, venture capital, family offices, asset managers and RIAs',
      h1: 'Investor operations that run without the re-typing.',
      sub: 'From subscription documents to quarterly letters: investor onboarding, portfolio reporting and mandate compliance, connected to the systems your firm already uses.',
    },
    audience: 'Investor relations, fund operations, finance and compliance teams.',
    pains: [
      { title: 'Onboarding an investor takes weeks', body: 'Subscription agreements, accreditation, tax forms and KYC arrive in pieces, and someone re-types all of it.' },
      { title: 'Portfolio data arrives by email', body: 'Every company reports KPIs in its own format, on its own schedule, and associates stitch them together.' },
      { title: 'Quarterly reporting eats the quarter', body: 'Letters and capital account statements are rebuilt by hand from the same sources every period.' },
      { title: 'Mandate compliance is checked after the fact', body: 'Policy limits are reviewed manually, usually once something already looks wrong.' },
    ],
    workflows: [
      { title: 'LP and investor onboarding', today: 'Subscription documents come back as scanned PDFs, incomplete, and are keyed into fund admin by hand.', build: 'One guided flow for subscription agreements, accreditation, W-9 or W-8BEN and KYC, with e-signature. Completed data goes to your fund administrator and CRM in the format they need.', systems: 'Juniper Square · Carta · Allvue · Salesforce' },
      { title: 'Deal-flow triage and portfolio KPI collection', today: 'Inbound decks pile up, and portfolio metrics are chased by email each month.', build: 'Inbound opportunities summarized against your investment criteria, with sources shown. Portfolio companies submit KPIs through a structured form, and the results flow to your pipeline and reporting.', systems: 'DealCloud · Salesforce · Excel' },
      { title: 'Quarterly LP letters and capital account statements', today: 'The same figures are copied into letters and statements every quarter.', build: 'Drafts generated from approved numbers in your template and voice. Your team reviews and releases, and investors receive them through the portal.', systems: 'Allvue · Carta · Addepar · Juniper Square' },
      { title: 'IPS and mandate compliance checks', today: 'Limits are checked by hand against statements.', build: 'Holdings and activity checked against each policy\'s limits on a schedule. Exceptions go to a review queue, and every decision is recorded.', systems: 'Addepar · Orion · custodial data' },
      { title: 'Client intake and CRM sync for advisory firms', today: 'New-client paperwork is re-typed into the CRM field by field.', build: 'The system we built for Team Financial Strategies: digital intake, CRM sync and signed PDFs, which took onboarding from 45 minutes to under 5.', systems: 'Redtail · Wealthbox · Salesforce Financial Services Cloud', link: { href: '/for-advisors', label: 'More for advisory firms' } },
    ],
    panel: {
      doc: 'Investor file: subscription agreement, tax form, accreditation letter',
      rows: [
        { field: 'Investor type', value: 'Trust', source: 'Subscription agreement, p. 3', ok: true },
        { field: 'Commitment', value: '$500,000', source: 'Subscription agreement, p. 1', ok: true },
        { field: 'Tax form', value: 'W-9', source: 'Uploaded PDF', ok: true },
        { field: 'Accreditation', value: 'Letter on file', source: 'Uploaded PDF', ok: false, note: 'Letter is dated 14 months ago. Request a current one.' },
      ],
    },
    integrations: [
      { name: 'DealCloud', role: 'Deal and relationship management', how: 'API' },
      { name: 'Juniper Square', role: 'Investor management', how: 'Exports and API' },
      { name: 'Carta', role: 'Cap table and fund administration', how: 'API and exports' },
      { name: 'Allvue', role: 'Fund accounting', how: 'API and exports' },
      { name: 'Addepar', role: 'Portfolio reporting', how: 'API' },
      { name: 'Orion', role: 'Portfolio accounting', how: 'API' },
      { name: 'Redtail', role: 'Advisor CRM', how: 'API', live: true },
      { name: 'Wealthbox', role: 'Advisor CRM', how: 'API' },
      { name: 'Salesforce Financial Services Cloud', role: 'CRM', how: 'API' },
    ],
    roi: { unit: 'Investor onboardings and reports per month', volume: 15, minutes: 120, minutesLabel: 'Minutes of collection, re-typing and assembly for each', rate: 90 },
    proof: { demo: null, note: 'This is the vertical where our named client work sits.' },
    security: [
      'Investor and client records stay in your systems. We do not keep a copy of investor PII on MonkFlow infrastructure.',
      'Role-based access for investor relations, finance, compliance and outside investors.',
      'A complete audit trail of every submission, sync, signature and approval.',
      'Private deployment and zero-retention model configurations for anything that touches AI.',
    ],
    faq: [
      { q: 'Do we have to change fund administrators or CRMs?', a: 'No. We build around what you run today and hand data to your administrator in the format they already accept.' },
      { q: 'Who reviews AI-drafted letters and summaries?', a: 'Your team. Drafts are generated from approved numbers and go through your normal review before anything is released to an investor.' },
      { q: 'Do you work with RIAs as well as funds?', a: 'Yes. Our named client, Team Financial Strategies, is a four-advisor wealth management firm. There is a separate page for advisory firms with more detail.' },
      { q: 'What does an engagement cost?', a: 'It depends on the workflow, the systems involved and how much review tooling your team needs. Every engagement is scoped individually, and you see a written scope and quote before any build work starts.' },
    ],
    meta: {
      title: 'LP Onboarding & Investor Reporting Automation | MonkFlow',
      description: 'Investor onboarding, portfolio KPI collection, quarterly LP letters and mandate compliance checks for private equity, venture, family offices, asset managers and RIAs.',
      serviceType: 'Custom software and workflow automation for investment firms',
      audience: 'Private equity firms, venture capital firms, family offices, asset managers and registered investment advisors',
      og: '/assets/og/investment-firms.png',
    },
  },
};

MK.verticalOrder = ['cre', 'banks', 'funds'];

// Advisory-firm (RIA) page content. Kept because /for-advisors is linked
// from existing outreach.
MK.advisors = {
  buckets: [
    { label: 'Forms', title: 'Digital intake and signed PDFs', body: 'New-client intake forms with conditional logic, document upload and e-signature. Custodian paperwork is pre-filled and signed in one flow. Forms write directly to your CRM, so nothing is re-typed and fewer applications come back not in good order.' },
    { label: 'Portals', title: 'Branded client portals', body: 'Secure document vaults, signed-agreement archives, quarterly review prep and beneficiary updates, branded to your firm. Clients sign in once and see what matters in one place.' },
    { label: 'Automations', title: 'CRM workflow automation', body: 'Reminder sequences, household relationship sync, risk-tolerance scoring and IPS draft generation, built on your CRM\'s API. It extends what you bought. It does not replace it.' },
    { label: 'Deployments', title: 'Implementation and ongoing care', body: 'We handle the build, the deployment, the training and the fixes. You keep a direct line to the person who wrote the code, with no ticket queue in between.' },
  ],
  stack: ['Wealthbox', 'Redtail', 'Salesforce Financial Services Cloud', 'eMoney', 'RightCapital', 'MoneyGuidePro', 'Schwab Advisor Center', 'Fidelity'],
  scopes: [
    { title: 'Onboarding audit', body: 'A recorded walkthrough of your current new-client onboarding and a written report on the highest-value fixes for your firm\'s stack.' },
    { title: 'Intake build', body: 'A digital intake form and one CRM sync: document upload, e-signature, conditional logic, automatic CRM record creation and custodian form pre-fill.' },
    { title: 'Full onboarding system', body: 'The full Team Financial Strategies scope: intake, CRM sync, contract auto-population, signed-PDF generation, reminder sequences and financial-profile sync.' },
  ],
};
