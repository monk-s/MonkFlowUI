/* ============================================================
   MonkFlow marketing site — components and pages.

   Every function here is a pure string builder: content in, HTML out.
   No DOM access, so scripts/prerender.mjs can run the same code in Node
   to produce static HTML for crawlers and link previews.

   All names live on the MK namespace. Do NOT add top-level function
   declarations: app.js is a single global scope, and a duplicate name
   silently replaces the other (see the navigateTo / navigateToPath note
   in app.js).

   Interactions are wired by delegated listeners in marketing/site.js:
     a[data-link]     client-side navigation
     [data-book]      open the booking modal (data-intent, data-vertical)
     [data-signin]    client sign-in
     [data-legal]     privacy / terms modal
     [data-tab]       tab switch inside a [data-tabs] group
     [data-filter]    integration table filter
     [data-roi]       estimator form
   ============================================================ */
var MK = globalThis.MK || (globalThis.MK = {});

MK.esc = function (s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

MK.svg = {
  chevron: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};

/* ---------- small helpers ---------- */
MK.link = function (href, label, cls) {
  return '<a href="' + href + '" data-link' + (cls ? ' class="' + cls + '"' : '') + '>' + label + '</a>';
};

MK.bookBtn = function (label, opts) {
  opts = opts || {};
  return '<button type="button" class="' + (opts.cls || 'mk-btn mk-btn-primary') + '" data-book' +
    (opts.intent ? ' data-intent="' + opts.intent + '"' : '') +
    (opts.vertical ? ' data-vertical="' + MK.esc(opts.vertical) + '"' : '') + '>' + label + '</button>';
};

MK.num = function (i) { return '<span class="mk-num">' + String(i + 1).padStart(2, '0') + '</span>'; };

MK.crumbs = function (items) {
  return '<nav class="mk-crumbs" aria-label="Breadcrumb">' + items.map(function (it, i) {
    var last = i === items.length - 1;
    return (last ? '<span aria-current="page">' + it.label + '</span>' : MK.link(it.href, it.label)) +
      (last ? '' : '<span aria-hidden="true">/</span>');
  }).join('') + '</nav>';
};

/* ---------- shell: nav + footer ---------- */
MK.nav = function (path) {
  var cur = function (p) { return path === p || path.indexOf(p + '/') === 0 ? ' aria-current="page"' : ''; };
  var solutions = MK.verticalOrder.map(function (k) {
    var v = MK.verticals[k];
    return '<a href="' + v.path + '" data-link><strong>' + v.nav + '</strong><span>' + v.navNote + '</span></a>';
  }).join('') + '<a href="/for-advisors" data-link><strong>Advisory firms (RIAs)</strong><span>Client intake, CRM sync and signed PDFs</span></a>';

  return '' +
  '<header class="mk-nav" data-nav>' +
    '<div class="mk-wrap mk-nav-inner">' +
      '<a href="/" data-link class="mk-logo" aria-label="MonkFlow home"><img src="/logo-mark.svg" alt="" width="28" height="31">MonkFlow</a>' +
      '<nav class="mk-nav-links" aria-label="Primary">' +
        '<div class="mk-nav-item">' +
          '<button type="button" class="mk-nav-trigger" aria-haspopup="true">Solutions ' + MK.svg.chevron + '</button>' +
          '<div class="mk-menu">' + solutions + '</div>' +
        '</div>' +
        '<a href="/capabilities" data-link' + cur('/capabilities') + '>Capabilities</a>' +
        '<a href="/case-studies" data-link' + cur('/case-studies') + '>Case studies</a>' +
        '<a href="/how-we-work" data-link' + cur('/how-we-work') + '>How we work</a>' +
        '<a href="/security" data-link' + cur('/security') + '>Security</a>' +
      '</nav>' +
      '<div class="mk-nav-actions">' +
        '<button type="button" class="mk-nav-signin" data-signin>Client sign in</button>' +
        MK.bookBtn('Book a working session', { cls: 'mk-btn mk-btn-primary mk-btn-sm' }) +
      '</div>' +
      '<button type="button" class="mk-nav-toggle" data-nav-toggle aria-label="Menu" aria-expanded="false">' + MK.svg.menu + '</button>' +
    '</div>' +
  '</header>';
};

MK.footer = function () {
  var solutions = MK.verticalOrder.map(function (k) {
    return '<li>' + MK.link(MK.verticals[k].path, MK.verticals[k].nav) + '</li>';
  }).join('') + '<li>' + MK.link('/for-advisors', 'Advisory firms (RIAs)') + '</li>';

  return '' +
  '<footer class="mk-footer">' +
    '<div class="mk-wrap">' +
      '<div class="mk-footer-grid">' +
        '<div class="mk-footer-brand">' +
          '<a href="/" data-link class="mk-logo"><img src="/logo-mark.svg" alt="" width="28" height="31">MonkFlow</a>' +
          '<p>Custom software, workflow automation and practical AI for commercial real estate firms, banks and investment firms.</p>' +
        '</div>' +
        '<div><h4>Solutions</h4><ul>' + solutions + '</ul></div>' +
        '<div><h4>Company</h4><ul>' +
          '<li>' + MK.link('/capabilities', 'Capabilities') + '</li>' +
          '<li>' + MK.link('/case-studies', 'Case studies') + '</li>' +
          '<li>' + MK.link('/how-we-work', 'How we work') + '</li>' +
          '<li>' + MK.link('/security', 'Security') + '</li>' +
          '<li>' + MK.link('/tools', 'Free tools') + '</li>' +
        '</ul></div>' +
        '<div><h4>Get started</h4><ul>' +
          '<li><button type="button" data-book>Book a working session</button></li>' +
          '<li><button type="button" data-book data-intent="audit">Start with a workflow audit</button></li>' +
          '<li><button type="button" data-signin>Client sign in</button></li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="mk-footer-bottom">' +
        '<span>&copy; 2026 MonkFlow. All rights reserved.</span>' +
        '<div><button type="button" data-legal="privacy">Privacy policy</button><button type="button" data-legal="terms">Terms of service</button></div>' +
      '</div>' +
      '<p class="mk-footer-note">Product and company names are trademarks of their respective owners. Naming a system means we build around it. It does not imply a partnership or certification.</p>' +
    '</div>' +
  '</footer>';
};

MK.shell = function (path, body) {
  return MK.nav(path) + '<main>' + body + '</main>' + MK.footer();
};

/* ---------- shared sections ---------- */
MK.selector = function () {
  return '<div class="mk-selector">' +
    '<div class="mk-selector-label">Who we build for</div>' +
    MK.verticalOrder.map(function (k) {
      var v = MK.verticals[k];
      return '<a href="' + v.path + '" data-link data-vertical-card="' + k + '">' +
        '<h3>' + v.name + '</h3>' +
        '<p>' + v.selector.workflows + '</p>' +
        '<span class="mk-mono">' + v.selector.systems + '</span>' +
        '<span class="mk-selector-go" aria-hidden="true">&rarr;</span>' +
      '</a>';
    }).join('') +
  '</div>';
};

MK.flow = function () {
  return '<ol class="mk-flow">' + MK.flowSteps.map(function (s) {
    return '<li><strong>' + s.title + '</strong><span>' + s.body + '</span></li>';
  }).join('') + '</ol>';
};

MK.panelTable = function (panel) {
  return '<div class="mk-panel-doc">' + panel.doc + '</div>' +
    '<table class="mk-table mk-table-stack"><thead><tr><th>Field</th><th>Extracted</th><th>Source</th><th>Status</th></tr></thead><tbody>' +
    panel.rows.map(function (r) {
      return '<tr><td>' + r.field + '</td><td><span class="mk-val">' + r.value + '</span></td><td class="mk-small">' + r.source + '</td>' +
        '<td><span class="mk-status' + (r.ok ? '' : ' mk-status-review') + '">' + (r.ok ? 'Confirmed' : 'Needs review') + '</span>' +
        (r.note ? '<span class="mk-status-note">' + r.note + '</span>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
};

// Review-queue illustration. `only` renders a single vertical (no tabs).
MK.panel = function (only) {
  var keys = only ? [only] : MK.verticalOrder;
  var tabs = only ? '' : '<div class="mk-tabs" role="tablist" aria-label="Example by firm type">' + keys.map(function (k, i) {
    return '<button type="button" class="mk-tab" role="tab" data-tab="' + k + '" aria-selected="' + (i === 0) + '">' + MK.verticals[k].nav + '</button>';
  }).join('') + '</div>';
  return '<div class="mk-panel" data-tabs>' +
    '<div class="mk-panel-bar"><span class="mk-panel-title">Review queue</span>' + tabs + '</div>' +
    keys.map(function (k, i) {
      return '<div class="mk-tabpanel" role="tabpanel" data-tabpanel="' + k + '"' + (i === 0 ? '' : ' hidden') + '>' + MK.panelTable(MK.verticals[k].panel) + '</div>';
    }).join('') +
    '<div class="mk-panel-foot">Illustrative example with made-up figures. Not client data.</div>' +
  '</div>';
};

MK.tfsProof = function () {
  var t = MK.tfs;
  return '<div class="mk-proof">' +
    '<div class="mk-proof-copy">' +
      '<span class="mk-demo-label">Client result · Wealth management</span>' +
      '<h3>' + t.name + ': ' + t.headline.charAt(0).toLowerCase() + t.headline.slice(1) + '</h3>' +
      '<p class="mk-muted">' + t.summary + '</p>' +
      '<p class="mk-small">' + t.descriptor + '</p>' +
      '<div class="mk-actions">' + MK.link(t.path, 'Read the case study', 'mk-arrow') + '</div>' +
    '</div>' +
    '<div class="mk-metrics">' + t.metrics.map(function (m) {
      return '<div><strong>' + m.value + '</strong><span>' + m.label + '</span></div>';
    }).join('') + '</div>' +
  '</div>';
};

MK.demoCard = function (d) {
  return '<div class="mk-demo">' +
    '<span class="mk-demo-label">' + d.label + '</span>' +
    '<h3>' + d.title + '</h3>' +
    '<p>' + d.body + '</p>' +
    '<p class="mk-small">Built by MonkFlow. Synthetic data, not a client deployment.</p>' +
    '<div class="mk-actions"><a class="mk-arrow" href="' + d.url + '" target="_blank" rel="noopener">' + d.cta + '</a></div>' +
  '</div>';
};

MK.demos = function (keys) {
  var list = MK.demoList.filter(function (d) { return !keys || keys.indexOf(d.key) !== -1; });
  return list.length ? '<div class="mk-demos">' + list.map(MK.demoCard).join('') + '</div>' : '';
};

MK.steps = function () {
  return '<ol class="mk-steps">' + MK.process.map(function (s, i) {
    return '<li>' + MK.num(i) + '<h3>' + s.title + '</h3><p>' + s.body + '</p></li>';
  }).join('') + '</ol>';
};

// The soft "start with an audit" block. One per page at most; never a hard sell.
MK.audit = function (vertical) {
  return '<div class="mk-audit" id="audit">' +
    '<div><h3>Not sure where to start? Start with a workflow audit.</h3>' +
    '<p>We map one workflow and the systems around it, rank the automation opportunities, and write up scope and data handling. You decide what, if anything, to build.</p></div>' +
    MK.bookBtn('Ask about an audit', { cls: 'mk-arrow', intent: 'audit', vertical: vertical }) +
  '</div>';
};

MK.cta = function (opts) {
  opts = opts || {};
  return '<section class="mk-cta"><div class="mk-wrap mk-cta-inner">' +
    '<div><h2>' + (opts.title || 'Bring us your worst manual workflow.') + '</h2>' +
    '<p class="mk-lede">' + (opts.body || 'A working session is 20 minutes with the engineer who would build it. Walk through the process, and leave with a straight answer on whether it is worth automating.') + '</p></div>' +
    '<div class="mk-actions">' + MK.bookBtn('Book a working session', { vertical: opts.vertical }) +
      MK.link('/how-we-work', 'See how we work', 'mk-arrow') + '</div>' +
  '</div></section>';
};

MK.integrationRows = function (keys) {
  var rows = [];
  var seen = {};
  keys.forEach(function (k) {
    MK.verticals[k].integrations.forEach(function (it) {
      if (seen[it.name]) { seen[it.name].verticals.push(k); return; }
      var row = { name: it.name, role: it.role, how: it.how, live: !!it.live, verticals: [k] };
      seen[it.name] = row;
      rows.push(row);
    });
  });
  return rows;
};

MK.integrations = function (keys) {
  var multi = keys.length > 1;
  var chips = !multi ? '' : '<div class="mk-chips" role="group" aria-label="Filter by firm type">' +
    '<button type="button" class="mk-chip" data-filter="all" aria-pressed="true">All</button>' +
    keys.map(function (k) { return '<button type="button" class="mk-chip" data-filter="' + k + '" aria-pressed="false">' + MK.verticals[k].nav + '</button>'; }).join('') +
  '</div>';
  return '<div data-filter-group>' + chips +
    '<div class="mk-table-wrap"><table class="mk-table mk-table-stack"><thead><tr><th>System</th><th>What it does for you</th><th>How we connect</th></tr></thead><tbody>' +
    MK.integrationRows(keys).map(function (r) {
      return '<tr data-verticals="' + r.verticals.join(' ') + '"><td>' + r.name + (r.live ? '<span class="mk-tag">In production</span>' : '') + '</td><td class="mk-muted">' + r.role + '</td><td class="mk-muted">' + r.how + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<p class="mk-small" style="margin-top:16px;max-width:76ch;">These are the systems we design around. Access depends on your license and each vendor\'s API program, and where there is no API we work from scheduled exports. Do not see yours? If it has an API or an export, we can build to it.</p>' +
  '</div>';
};

MK.roiCalc = function (volume, minutes, rate, saved) {
  var hours = volume * 12 * (minutes / 60) * (saved / 100);
  return { hours: Math.round(hours), value: Math.round(hours * rate) };
};

MK.fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

MK.roi = function (r) {
  var out = MK.roiCalc(r.volume, r.minutes, r.rate, 60);
  var field = function (name, label, value, extra) {
    return '<label>' + label + '<input type="number" inputmode="numeric" min="0" ' + (extra || '') + ' name="' + name + '" value="' + value + '"></label>';
  };
  return '<form class="mk-roi" data-roi onsubmit="return false">' +
    '<div class="mk-roi-inputs">' +
      field('volume', r.unit, r.volume) +
      field('minutes', r.minutesLabel, r.minutes) +
      field('rate', 'Loaded cost per hour of the people doing it ($)', r.rate) +
      field('saved', 'Share of that time automation removes (%)', 60, 'max="100"') +
    '</div>' +
    '<div class="mk-roi-out" aria-live="polite">' +
      '<div><strong data-roi-hours>' + MK.fmt(out.hours) + '</strong><span>hours returned to your team each year</span></div>' +
      '<div><strong data-roi-value>$' + MK.fmt(out.value) + '</strong><span>of capacity each year, at your cost per hour</span></div>' +
      '<p>An estimate from the inputs on the left. These are example starting values, not a client result. Replace them with your own.</p>' +
    '</div>' +
  '</form>';
};

MK.faq = function (items) {
  return '<div class="mk-faq">' + items.map(function (f) {
    return '<details><summary>' + f.q + '</summary><p>' + f.a + '</p></details>';
  }).join('') + '</div>';
};

MK.head = function (eyebrow, title, lede) {
  return '<div class="mk-section-head">' + (eyebrow ? '<span class="mk-eyebrow">' + eyebrow + '</span>' : '') +
    '<h2>' + title + '</h2>' + (lede ? '<p class="mk-lede">' + lede + '</p>' : '') + '</div>';
};

/* ============================================================
   Pages
   ============================================================ */
MK.pages = {};

MK.pages.home = function () {
  return '' +
  '<section class="mk-hero"><div class="mk-wrap mk-hero-grid">' +
    '<div class="mk-hero-copy">' +
      '<span class="mk-eyebrow">Custom software and practical AI</span>' +
      '<h1>Software built around how your deals, loans and investors actually move.</h1>' +
      '<p class="mk-lede">MonkFlow is a founder-led engineering firm for commercial real estate firms, banks and investment firms. We build the internal tools, integrations and document automation that sit on top of the systems you already run.</p>' +
      '<div class="mk-actions">' + MK.bookBtn('Book a working session') +
        MK.link('/case-studies', 'See the work', 'mk-arrow') + '</div>' +
    '</div>' +
    MK.selector() +
  '</div></section>' +

  '<div class="mk-wrap"><div class="mk-facts">' +
    '<div><strong>Founder-led</strong><span>You work directly with the engineer who designs and builds your system.</span></div>' +
    '<div><strong>Built for your workflow</strong><span>Purpose-built tools and integrations. Never a reskinned template.</span></div>' +
    '<div><strong>Live in weeks</strong><span>Our first client system went from kickoff to live in two.</span></div>' +
    '<div><strong>Your data stays yours</strong><span>Records land in your systems. Private deployment is available.</span></div>' +
  '</div></div>' +

  '<section class="mk-section" style="border-top:0"><div class="mk-wrap mk-split">' +
    MK.head('What we build', 'Four kinds of work, usually combined.', 'Most engagements start with one painful workflow and touch two or three of these.') +
    '<div><ol class="mk-list mk-list-1">' + MK.capabilities.map(function (c, i) {
      return '<li>' + MK.num(i) + '<h3>' + c.title + '</h3><p>' + c.body + '</p></li>';
    }).join('') + '</ol><div class="mk-actions" style="margin-top:24px">' + MK.link('/capabilities', 'Capabilities and integrations', 'mk-arrow') + '</div></div>' +
  '</div></section>' +

  '<section class="mk-band"><div class="mk-wrap">' +
    '<span class="mk-eyebrow">Our position on AI</span>' +
    '<p class="mk-band-quote" style="margin-top:20px">We don&rsquo;t just use AI. We implement it where it matters.</p>' +
    '<div class="mk-band-grid">' + MK.principles.map(function (p) {
      return '<div><h3>' + p.title + '</h3><p>' + p.body + '</p></div>';
    }).join('') + '</div>' +
  '</div></section>' +

  '<section class="mk-section mk-section-sunk" style="border-top:0"><div class="mk-wrap">' +
    MK.head('How it works', 'From a stack of documents to a record you can trust.', 'The same five steps sit under almost everything we build. The middle one is a person.') +
    MK.flow() + MK.panel() +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Proof', 'One named client, and software you can open.', 'We are a young firm and would rather show you real work than a wall of logos.') +
    MK.tfsProof() + MK.demos() +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('How we work', 'A clear scope before we build, and one person accountable throughout.') +
    MK.steps() + MK.audit() +
  '</div></section>' +

  '<section class="mk-band"><div class="mk-wrap mk-split">' +
    '<div class="mk-section-head"><span class="mk-eyebrow">Security</span><h2>Built for firms that answer to examiners, auditors and LPs.</h2>' +
      '<div class="mk-actions">' + MK.link('/security', 'Security and data handling', 'mk-arrow') + '</div></div>' +
    '<ul class="mk-band-list">' +
      '<li><h3>Your data stays in your systems</h3><p>We build the workflow layer. We do not keep client PII on our infrastructure.</p></li>' +
      '<li><h3>Encrypted throughout</h3><p>AES-256 at rest and TLS in transit.</p></li>' +
      '<li><h3>Access by role, with a trail</h3><p>Role-based access and a log of every action.</p></li>' +
      '<li><h3>Private deployment</h3><p>Run inside your own cloud, with zero-retention model options.</p></li>' +
    '</ul>' +
  '</div></section>' +

  MK.cta();
};

MK.pages.solutions = function () {
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'Solutions' }]) +
    '<h1>Three kinds of firm. The same problem underneath.</h1>' +
    '<p class="mk-lede">Skilled people spend their days moving data between documents and systems. We build the software that does the moving, so they can do the judging.</p>' +
  '</div></div></section>' +
  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    '<ul class="mk-work">' + MK.verticalOrder.map(function (k) {
      var v = MK.verticals[k];
      return '<li><div><h3>' + v.name + '</h3><p class="mk-small" style="margin-top:8px">' + v.audience + '</p></div>' +
        '<div><p class="mk-muted">' + v.hero.sub + '</p></div>' +
        '<div><ul>' + v.workflows.slice(0, 4).map(function (w) { return '<li class="mk-muted" style="padding:6px 0;border-bottom:1px solid var(--mk-line)">' + w.title + '</li>'; }).join('') + '</ul>' +
        '<div class="mk-actions" style="margin-top:18px">' + MK.link(v.path, v.name + ' solutions', 'mk-arrow') + '</div></div></li>';
    }).join('') +
    '<li><div><h3>Advisory firms (RIAs)</h3><p class="mk-small" style="margin-top:8px">Independent registered investment advisors.</p></div>' +
      '<div><p class="mk-muted">Digital intake, CRM sync and signed-PDF generation on top of Redtail, Wealthbox or Salesforce. Where our first client work began.</p></div>' +
      '<div><div class="mk-actions">' + MK.link('/for-advisors', 'For advisory firms', 'mk-arrow') + '</div></div></li>' +
    '</ul>' +
  '</div></section>' +
  MK.cta();
};

MK.pages.vertical = function (key) {
  var v = MK.verticals[key];
  var demo = v.proof.demo ? MK.demos([v.proof.demo]) : '';
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { href: '/solutions', label: 'Solutions' }, { label: v.name }]) +
    '<span class="mk-eyebrow">' + v.hero.eyebrow + '</span>' +
    '<h1>' + v.hero.h1 + '</h1>' +
    '<p class="mk-lede">' + v.hero.sub + '</p>' +
    '<div class="mk-actions">' + MK.bookBtn('Book a working session', { vertical: v.bookAs }) +
      '<a href="#workflows" class="mk-arrow" data-scroll>See what we build</a></div>' +
  '</div></div></section>' +

  '<section class="mk-section"><div class="mk-wrap mk-split">' +
    MK.head('Sound familiar?', 'Where the hours go.', v.audience) +
    '<ol class="mk-list">' + v.pains.map(function (p, i) {
      return '<li>' + MK.num(i) + '<h3>' + p.title + '</h3><p>' + p.body + '</p></li>';
    }).join('') + '</ol>' +
  '</div></section>' +

  '<section class="mk-section" id="workflows"><div class="mk-wrap">' +
    MK.head('Workflows we build', 'What changes, workflow by workflow.') +
    '<ul class="mk-work">' + v.workflows.map(function (w) {
      return '<li><div><h3>' + w.title + '</h3><span class="mk-mono">' + w.systems + '</span></div>' +
        '<dl><dt>Today</dt><dd>' + w.today + '</dd></dl>' +
        '<dl><dt>What we build</dt><dd>' + w.build + '</dd>' +
        (w.link ? '<dd style="margin-top:12px">' + MK.link(w.link.href, w.link.label, 'mk-arrow') + '</dd>' : '') + '</dl></li>';
    }).join('') + '</ul>' +
  '</div></section>' +

  '<section class="mk-section mk-section-sunk"><div class="mk-wrap">' +
    MK.head('How it works', 'Extraction you can check, with a person in the loop.', 'Every value carries its source. Anything that does not reconcile is held for review.') +
    MK.flow() + MK.panel(key) +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Your stack', 'We work where your firm already works.', 'We do not sell a platform. We extend the systems you have already invested in.') +
    MK.integrations([key]) +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Estimate', 'What is the manual version costing you?', 'Put in your own numbers. The arithmetic is simple on purpose.') +
    MK.roi(v.roi) +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Proof', 'What we can show you today.', v.proof.note) +
    (key === 'funds' ? MK.tfsProof() : demo + '<div style="margin-top:24px">' + MK.tfsProof() + '</div>') +
  '</div></section>' +

  '<section class="mk-band"><div class="mk-wrap mk-split">' +
    '<div class="mk-section-head"><span class="mk-eyebrow">Security</span><h2>How your data is handled.</h2>' +
      '<div class="mk-actions">' + MK.link('/security', 'Security and data handling', 'mk-arrow') + '</div></div>' +
    '<ul class="mk-band-list" style="grid-template-columns:1fr">' + v.security.map(function (s) { return '<li><p style="margin:0;color:#dbe3ec">' + s + '</p></li>'; }).join('') + '</ul>' +
  '</div></section>' +

  '<section class="mk-section" style="border-top:0"><div class="mk-wrap mk-split">' +
    MK.head('Questions', 'What firms ask us first.') +
    MK.faq(v.faq) +
  '</div><div class="mk-wrap">' + MK.audit(v.bookAs) + '</div></section>' +

  MK.cta({ vertical: v.bookAs });
};

MK.pages.capabilities = function () {
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'Capabilities' }]) +
    '<h1>What we build, and how it connects to what you already run.</h1>' +
    '<p class="mk-lede">Four capabilities, one engineer accountable for all of them. Most engagements combine two or three around a single workflow.</p>' +
  '</div></div></section>' +
  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    '<ul class="mk-work">' + MK.capabilities.map(function (c, i) {
      return '<li><div>' + MK.num(i) + '<h3 style="margin-top:10px">' + c.title + '</h3></div>' +
        '<div><p class="mk-muted">' + c.body + '</p></div>' +
        '<div><p class="mk-muted">' + c.detail + '</p><span class="mk-mono">' + c.examples + '</span></div></li>';
    }).join('') + '</ul>' +
  '</div></section>' +
  '<section class="mk-band"><div class="mk-wrap">' +
    '<span class="mk-eyebrow">Our position on AI</span>' +
    '<p class="mk-band-quote" style="margin-top:20px">We don&rsquo;t just use AI. We implement it where it matters.</p>' +
    '<div class="mk-band-grid">' + MK.principles.map(function (p) { return '<div><h3>' + p.title + '</h3><p>' + p.body + '</p></div>'; }).join('') + '</div>' +
  '</div></section>' +
  '<section class="mk-section" style="border-top:0" id="integrations"><div class="mk-wrap">' +
    MK.head('Integrations', 'The systems we design around.', 'Filter by the kind of firm you are.') +
    MK.integrations(MK.verticalOrder) +
  '</div></section>' +
  MK.cta();
};

MK.pages.caseStudies = function () {
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'Case studies' }]) +
    '<h1>Real work, labelled honestly.</h1>' +
    '<p class="mk-lede">One named client with confirmed results, and working demos you can open yourself. Demos are marked as demos.</p>' +
  '</div></div></section>' +
  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    MK.tfsProof() +
    '<div class="mk-section-head" style="margin:72px 0 0"><span class="mk-eyebrow">Working demos</span><h2>Software you can try.</h2>' +
    '<p class="mk-lede">Built by MonkFlow to show the pattern in other industries. They run on synthetic data and are not client deployments.</p></div>' +
    MK.demos() +
  '</div></section>' +
  MK.cta();
};

// Narrative preserved from the published case study. Figures confirmed by
// Jody Team (founding partner). Do not paraphrase a testimonial into
// existence: there is intentionally no quote on this page.
MK.pages.tfs = function () {
  return '' +
  '<article class="mk-article">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { href: '/case-studies', label: 'Case studies' }, { label: 'Team Financial Strategies' }]) +
    '<p class="mk-small" style="margin:28px 0 0">Financial services · Client onboarding · Redtail</p>' +
    '<h1>How Team Financial Strategies cut new-client onboarding from 45 minutes to under 5</h1>' +
    '<dl class="mk-facts-box">' +
      '<dt>Firm</dt><dd>Team Financial Strategies</dd>' +
      '<dt>Size</dt><dd>4 advisors, Abilene, Texas</dd>' +
      '<dt>Contact</dt><dd>Jody Team, founding partner</dd>' +
      '<dt>CRM</dt><dd>Redtail</dd>' +
      '<dt>Project length</dt><dd>2 weeks</dd>' +
      '<dt>Outcome</dt><dd><strong>45 minutes → under 5 minutes per new-client onboarding</strong></dd>' +
    '</dl>' +

    '<h2>The problem</h2>' +
    '<p>Team Financial Strategies, like most independent RIAs in their size bracket, ran new-client onboarding on a hybrid paper, PDF and CRM workflow. A new prospect coming on board meant:</p>' +
    '<ul>' +
      '<li>Paper or PDF intake forms: about 7 pages of personal, financial, beneficiary and risk-tolerance data</li>' +
      '<li>An operations manager re-typing the data into Redtail one field at a time (about 25 minutes per client)</li>' +
      '<li>Schwab custodian-of-record forms signed one by one in DocuSign</li>' +
      '<li>A risk-tolerance questionnaire scored on a calculator</li>' +
      '<li>An IPS drafted from a Word template by hand</li>' +
    '</ul>' +
    '<p>The total: roughly <strong>45 minutes per new-client onboarding</strong>, at a firm where the founding partner ends up doing the last leg of it personally.</p>' +
    '<p>The pain was not that this workflow was broken. The pain was that the firm could not scale it. Each new advisor meant another set of clients and another bottleneck on the operations manager\'s afternoon.</p>' +

    '<h2>What we built</h2>' +
    '<p>In 2 weeks, MonkFlow built:</p>' +
    '<ol>' +
      '<li><strong>Custom intake form.</strong> Branded to TFS and hosted on a TFS-controlled subdomain. 28 fields with conditional logic (joint or individual, employed or retired, beneficiary tree). Document upload for driver\'s licenses and trust documents. E-signature on submission.</li>' +
      '<li><strong>Redtail auto-sync.</strong> On submission, the Contact record is created in Redtail with all 28 fields populated. Household relationships are built automatically, and the custom fields the firm uses for client segmentation are filled from the form answers.</li>' +
      '<li><strong>Signed-PDF generation.</strong> The Schwab account application, beneficiary designation, IPS and the firm\'s own engagement letter are pre-filled from the intake data and bundled into a single signing flow. Signed PDFs are archived to the Redtail client folder automatically.</li>' +
      '<li><strong>Compliance trail.</strong> Every form submission, sync and signature is logged with a timestamp and IP address. Partial-field detection stops incomplete intakes from reaching the CIO\'s inbox.</li>' +
    '</ol>' +

    '<h2>The result</h2>' +
    '<p class="mk-callout">Onboarding time: 45 minutes → under 5 minutes.</p>' +
    '<p>That is 5 minutes for the operations manager to <em>review</em> the auto-populated record, not to do the work. The form does the work.</p>' +
    '<p>Other downstream wins:</p>' +
    '<ul>' +
      '<li><strong>Funding speed:</strong> new accounts now fund within 2 business days of signing, compared with 5 to 7 days under the old workflow, where paperwork often came back not in good order.</li>' +
      '<li><strong>Compliance:</strong> Jody can pull a complete audit trail for any new client in under 30 seconds.</li>' +
      '<li><strong>New-client experience:</strong> clients fill in the intake on their own schedule, often before the kickoff meeting, so the meeting itself is about strategy and not paperwork.</li>' +
    '</ul>' +

    '<h2>What we\'d do differently</h2>' +
    '<p>The intake form\'s conditional logic was over-engineered in the first version. We shipped 9 conditional branches when 4 would have covered 95% of client types. The firm\'s operations manager flagged it during the first week live, and we collapsed the branches the following week.</p>' +
    '<p><em>Lesson: ship fewer branches, and add them only when clients actually hit edge cases.</em></p>' +

    '<h2>Where the same pattern applies</h2>' +
    '<p>The shape of this project is not specific to wealth management: a guided digital intake, validation before anything is accepted, automatic sync to the system of record, pre-filled documents for signature, and an audit trail. The same pattern fits:</p>' +
    '<ul>' +
      '<li>LP and investor subscription onboarding at funds</li>' +
      '<li>Borrower document collection for commercial loans</li>' +
      '<li>KYC and beneficial ownership collection at banks</li>' +
    '</ul>' +
    '<p>The results above are from Team Financial Strategies only. We do not claim them for other industries.</p>' +

    '<div class="mk-aside">' +
      '<h3>Want this for your firm?</h3>' +
      '<p>Advisory firms can see exactly what we build on top of Redtail, Wealthbox and Salesforce. Everyone else usually starts with a short working session.</p>' +
      '<div class="mk-actions">' + MK.bookBtn('Book a working session') + MK.link('/for-advisors', 'For advisory firms', 'mk-arrow') + '</div>' +
    '</div>' +
    '<p class="mk-byline">Jody Team, Founding Partner · Team Financial Strategies · Abilene, Texas</p>' +
  '</article>';
};

MK.pages.advisors = function () {
  var a = MK.advisors;
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { href: '/solutions/investment-firms', label: 'Investment firms' }, { label: 'Advisory firms' }]) +
    '<span class="mk-eyebrow">Custom CRM extensions for independent advisors</span>' +
    '<h1>Make your Wealthbox or Redtail fit your practice.</h1>' +
    '<p class="mk-lede">Your CRM does what it was built to do. We build the layer above it: digital intake, signed-PDF generation, custodian paperwork automation and client portals that turn your CRM into the onboarding system your firm actually needs.</p>' +
    '<div class="mk-actions">' + MK.bookBtn('Book a 15-minute intro call', { vertical: 'RIA / advisory firm' }) +
      MK.link(MK.tfs.path, 'Read the TFS case study', 'mk-arrow') + '</div>' +
  '</div></div></section>' +

  '<section class="mk-section"><div class="mk-wrap mk-split">' +
    MK.head('What we build', 'Forms, portals, automations, deployments.', 'Four buckets. Everything we ship for advisory firms sits inside one of them.') +
    '<ol class="mk-list">' + a.buckets.map(function (b) {
      return '<li><span class="mk-num">' + b.label.toUpperCase() + '</span><h3>' + b.title + '</h3><p>' + b.body + '</p></li>';
    }).join('') + '</ol>' +
  '</div></section>' +

  '<section class="mk-section mk-section-sunk"><div class="mk-wrap">' +
    MK.head('Built around your stack', 'We work where your firm already works.', 'We do not sell a new CRM. We extend the one you have already invested in.') +
    '<div class="mk-chips">' + a.stack.map(function (n) { return '<span class="mk-chip" style="cursor:default;background:var(--mk-surface)">' + n + '</span>'; }).join('') + '</div>' +
    '<p class="mk-small">Do not see your stack? If it has an API or an export, we can build to it.</p>' +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Proof', 'One real client. Real numbers.') +
    MK.tfsProof() +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Scope', 'Three ways firms work with us.', 'Each is scoped to your firm and your CRM. You get a written scope and quote before any build starts.') +
    '<ol class="mk-steps" style="grid-template-columns:repeat(3,minmax(0,1fr))">' + a.scopes.map(function (s, i) {
      return '<li>' + MK.num(i) + '<h3>' + s.title + '</h3><p>' + s.body + '</p></li>';
    }).join('') + '</ol>' +
  '</div></section>' +

  '<section class="mk-band"><div class="mk-wrap mk-split">' +
    '<div class="mk-section-head"><span class="mk-eyebrow">Security posture</span><h2>What happens to client PII?</h2>' +
      '<div class="mk-actions">' + MK.link('/security', 'Security and data handling', 'mk-arrow') + '</div></div>' +
    '<div><p style="color:#dbe3ec">MonkFlow is a workflow layer, not a data store. Client information moves directly into your CRM, and we do not persist PII or financial data on our infrastructure. Data is protected with TLS in transit and AES-256 encryption at rest.</p>' +
    '<p style="color:#b9c5d3;margin-top:16px;font-size:15.5px">We will walk your chief compliance officer through the architecture on request.</p></div>' +
  '</div></section>' +

  MK.cta({ title: 'Ready to extend your CRM?', body: 'Start with a 15-minute intro call. If it is a fit, an onboarding audit is the usual first step.', vertical: 'RIA / advisory firm' });
};

MK.pages.howWeWork = function () {
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'How we work' }]) +
    '<h1>One accountable engineer, a clear scope, and working software early.</h1>' +
    '<p class="mk-lede">There is no account manager and no offshore ticket queue. The person you talk to in the first call is the person who designs, builds and supports the system.</p>' +
  '</div></div></section>' +

  '<section class="mk-section"><div class="mk-wrap">' +
    MK.head('Process', 'Four steps, every project.') + MK.steps() +
  '</div></section>' +

  '<section class="mk-section mk-section-sunk" id="engagements"><div class="mk-wrap mk-split">' +
    MK.head('Engagements', 'Start small. Go further if it earns it.', 'Every engagement is scoped to your workflow and systems, so we do not publish a price list. You see a written scope and quote before any build work starts.') +
    '<ol class="mk-list mk-list-1">' + MK.engagements.map(function (e, i) {
      return '<li>' + MK.num(i) + '<h3>' + e.title + '</h3><p>' + e.body + '</p><p class="mk-small">' + e.note + '</p></li>';
    }).join('') + '</ol>' +
  '</div></section>' +

  '<section class="mk-section"><div class="mk-wrap mk-split">' +
    MK.head('The workflow audit', 'What you get from an audit.', 'A contained first step for firms that want facts before committing to a build.') +
    '<div><ol class="mk-list mk-list-1">' +
      '<li><h3>A map of the workflow as it really runs</h3><p>Who touches it, in which systems, and where the re-keying and waiting are.</p></li>' +
      '<li><h3>A systems and data-flow inventory</h3><p>What can be reached by API, what needs an export, and where the records of truth live.</p></li>' +
      '<li><h3>Ranked automation opportunities</h3><p>The few changes worth making, in order, each with a scope you can act on.</p></li>' +
      '<li><h3>A data-handling note for your compliance or security team</h3><p>How data would move, where it would live and who could see it.</p></li>' +
    '</ol>' + MK.audit() + '</div>' +
  '</div></section>' +

  '<section class="mk-band"><div class="mk-wrap">' +
    '<span class="mk-eyebrow">What stays constant</span>' +
    '<div class="mk-band-grid" style="margin-top:24px;border-top:0;padding-top:0">' +
      '<div><h3>Founder-led</h3><p>Direct access to the architect and builder, before and after launch.</p></div>' +
      '<div><h3>Built for you</h3><p>Purpose-built around your process and systems. Never a reskinned template.</p></div>' +
      '<div><h3>AI where it pays</h3><p>Used for reading and drafting, checked by rules and reviewed by a person.</p></div>' +
    '</div>' +
  '</div></section>' +

  MK.cta();
};

/* ---------- free tools ---------- */
MK.pages.tools = function () {
  var t = MK.tools.bench;
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'Tools' }]) +
    '<h1>Free tools.</h1>' +
    '<p class="mk-lede">Small, useful things built from public data. No sign-up, and nothing you enter leaves your browser.</p>' +
  '</div></div></section>' +
  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    '<ul class="mk-work"><li><div><h3>' + MK.link(t.path, t.name) + '</h3><p class="mk-small">For community and regional banks</p></div>' +
    '<div style="grid-column:2 / -1"><p class="mk-muted">' + t.blurb + '</p><p style="margin-top:12px">' + MK.link(t.path, 'Open the benchmark', 'mk-arrow') + '</p></div></li></ul>' +
  '</div></section>' + MK.cta();
};

MK.pages.bankBench = function () {
  var t = MK.tools.bench;
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }, { label: t.name }]) +
    '<h1>How does your bank\'s efficiency compare?</h1>' +
    '<p class="mk-lede">' + t.blurb + '</p>' +
  '</div></div></section>' +
  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    '<form class="mk-bench" data-bench onsubmit="return false">' +
      '<label for="mk-bench-q">Find a bank in ' + t.states + '</label>' +
      '<input id="mk-bench-q" type="search" list="mk-bench-list" autocomplete="off" placeholder="Start typing a bank name" data-bench-q disabled>' +
      '<datalist id="mk-bench-list"></datalist>' +
      '<p class="mk-small" data-bench-status>Loading public FDIC data&hellip;</p>' +
    '</form>' +
    '<div class="mk-bench-out" data-bench-out aria-live="polite"></div>' +
  '</div></section>' +
  '<section class="mk-section"><div class="mk-wrap">' + MK.head('Method', 'How the comparison works') + MK.faq(t.method) + '</div></section>' +
  MK.cta({ title: 'Want this in your board pack, or wired into your own reporting?', body: 'A working session is 20 minutes with the engineer who would build it. Bring the report your team assembles by hand each quarter.', vertical: 'banks' });
};

MK.bench = MK.bench || {};

MK.bench.titleCase = function (s) {
  var keep = { 'N.A.': 1, NA: 1, SSB: 1, FSB: 1, USA: 1, 'U.S.': 1, BOK: 1, FNB: 1, ANB: 1, TBK: 1, 'S.S.B.': 1, 'F.S.B.': 1, ATG: 1, TXRB: 1 };
  var small = { of: 1, and: 1, the: 1, in: 1, at: 1, '&': 1 };
  return String(s || '').toLowerCase().split(/\s+/).map(function (w, i) {
    var up = w.toUpperCase();
    if (keep[up]) return up;
    if (i > 0 && small[w]) return w;
    return w.replace(/(^|[-/.(])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
  }).join(' ');
};

MK.bench.median = function (xs) {
  var v = xs.filter(function (x) { return typeof x === 'number' && isFinite(x); }).sort(function (a, b) { return a - b; });
  if (!v.length) return null;
  var m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Share of peers this bank does better than (0-100), or null.
MK.bench.rank = function (xs, x, lowerIsBetter) {
  var v = xs.filter(function (y) { return typeof y === 'number' && isFinite(y); });
  if (typeof x !== 'number' || v.length < 5) return null;
  var better = 0, same = -1;
  v.forEach(function (y) { if (y === x) same++; else if (lowerIsBetter ? y > x : y < x) better++; });
  return Math.round(100 * (better + Math.max(same, 0) / 2) / (v.length - 1));
};

MK.bench.rows = function (data) {
  var c = data.cols;
  return data.rows.map(function (r) { var o = {}; c.forEach(function (k, i) { o[k] = r[i]; }); return o; });
};

MK.bench.label = function (b) { return MK.bench.titleCase(b.name) + ' (' + MK.bench.titleCase(b.city) + ', ' + b.state + ')'; };

MK.bench.spark = function (mine, peer, quarters) {
  var all = mine.concat(peer).filter(function (x) { return typeof x === 'number'; });
  if (all.length < 2) return '';
  var lo = Math.min.apply(null, all) - 2, hi = Math.max.apply(null, all) + 2, W = 320, H = 96, n = quarters.length;
  var pt = function (v, i) { return (12 + (W - 24) * (n - 1 - i) / (n - 1)).toFixed(1) + ',' + (8 + (H - 28) * (hi - v) / (hi - lo)).toFixed(1); };
  var line = function (vals, cls) {
    var pts = []; vals.forEach(function (v, i) { if (typeof v === 'number') pts.push(pt(v, i)); });
    return '<polyline class="' + cls + '" fill="none" points="' + pts.join(' ') + '"/>';
  };
  var labels = quarters.map(function (q, i) { return i === 0 || i === n - 1 ? '<text x="' + pt(lo, i).split(',')[0] + '" y="' + (H - 4) + '" text-anchor="' + (i === 0 ? 'end' : 'start') + '">' + q.slice(0, 7) + '</text>' : ''; }).join('');
  return '<svg class="mk-bench-spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Efficiency ratio over five quarters, this bank against the peer median">' +
    line(peer, 'peer') + line(mine, 'mine') + labels + '</svg>' +
    '<p class="mk-small"><span class="mk-bench-key mine"></span>This bank <span class="mk-bench-key peer"></span>Peer median</p>';
};

// Pure: data bundle + chosen bank -> HTML. Used by the page and by tests.
MK.bench.render = function (data, b) {
  var B = MK.bench, all = B.rows(data);
  var peers = all.filter(function (p) { return p.state === b.state && p.band === b.band; });
  var col = function (k, i) { return peers.map(function (p) { return i == null ? p[k] : (p[k] || [])[i]; }); };
  var fmt = function (x, d, suf) { return typeof x === 'number' ? x.toFixed(d) + (suf || '') : 'n/a'; };
  var ord = function (r) { return r == null ? 'too few peers to rank' : 'better than ' + r + '% of peers'; };
  var effMed = B.median(col('eff', 0)), effMedOld = B.median(col('eff', 4));
  var apeMed = B.median(col('assets_per_emp_m')), lpeMed = B.median(col('loans_per_emp_m')), roaMed = B.median(col('roa'));
  var metrics = [
    ['Efficiency ratio', fmt(b.eff[0], 1, '%'), fmt(effMed, 1, '%'), B.rank(col('eff', 0), b.eff[0], true), 'Lower is better'],
    ['Assets per employee', '$' + fmt(b.assets_per_emp_m, 1, 'M'), '$' + fmt(apeMed, 1, 'M'), B.rank(col('assets_per_emp_m'), b.assets_per_emp_m), ''],
    ['Loans per employee', '$' + fmt(b.loans_per_emp_m, 1, 'M'), '$' + fmt(lpeMed, 1, 'M'), B.rank(col('loans_per_emp_m'), b.loans_per_emp_m), ''],
    ['Return on assets', fmt(b.roa, 2, '%'), fmt(roaMed, 2, '%'), B.rank(col('roa'), b.roa), 'Annualized'],
  ];
  var notes = [];
  if (typeof b.eff[0] === 'number' && typeof effMed === 'number') {
    var gap = b.eff[0] - effMed;
    notes.push(Math.abs(gap) < 1 ? 'The efficiency ratio is in line with the peer median.' :
      'The efficiency ratio is ' + Math.abs(gap).toFixed(1) + ' points ' + (gap > 0 ? 'above' : 'below') + ' the peer median, which means ' +
      (gap > 0 ? 'more' : 'less') + ' expense for each dollar of revenue than a typical peer.');
  }
  if (typeof b.eff[0] === 'number' && typeof b.eff[4] === 'number' && typeof effMedOld === 'number' && typeof effMed === 'number') {
    var mine = b.eff[0] - b.eff[4], typ = effMed - effMedOld;
    notes.push('Over four quarters it moved ' + (mine >= 0 ? 'up ' : 'down ') + Math.abs(mine).toFixed(1) + ' points; the peer median moved ' +
      (typ >= 0 ? 'up ' : 'down ') + Math.abs(typ).toFixed(1) + '.');
  }
  if (typeof b.assets_per_emp_m === 'number' && typeof apeMed === 'number') {
    notes.push('Each employee supports $' + b.assets_per_emp_m.toFixed(1) + 'M of assets, against a peer median of $' + apeMed.toFixed(1) + 'M.' +
      (b.assets_per_emp_m < apeMed ? ' Time spent moving documents and figures between systems by hand is often part of a gap like that.' : ''));
  }
  var peerTrend = [0, 1, 2, 3, 4].map(function (i) { return B.median(col('eff', i)); });
  return '' +
    '<div class="mk-bench-card">' +
      '<div class="mk-bench-title"><h2>' + MK.esc(B.label(b)) + '</h2>' +
      '<p class="mk-small">Quarter ending ' + MK.esc(data.quarter) + ' &middot; $' + MK.esc((b.assets_m / 1000).toFixed(2)) + 'B total assets &middot; ' +
        MK.fmt(b.employees) + ' employees &middot; compared with ' + peers.length + ' banks in ' + MK.esc(b.state) + ', ' + MK.esc(data.bands[b.band]) + '</p></div>' +
      '<div class="mk-bench-grid">' + metrics.map(function (m) {
        return '<div class="mk-bench-metric"><span class="mk-small">' + m[0] + '</span><strong>' + MK.esc(m[1]) + '</strong>' +
          '<span class="mk-small">Peer median ' + MK.esc(m[2]) + (m[4] ? ' &middot; ' + m[4] : '') + '</span>' +
          '<span class="mk-bench-rank">' + ord(m[3]) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="mk-bench-lower"><div><h3>Efficiency ratio, last five quarters</h3>' + B.spark(b.eff, peerTrend, data.quarters) + '</div>' +
      '<div><h3>What stands out</h3><ul class="mk-bench-notes">' + notes.map(function (n) { return '<li>' + MK.esc(n) + '</li>'; }).join('') + '</ul></div></div>' +
      '<p class="mk-small mk-bench-src">Source: ' + MK.esc(data.source) + '. FDIC certificate ' + MK.esc(b.cert) + '. Figures as reported; peer medians computed by MonkFlow.</p>' +
    '</div>';
};

MK.pages.security = function () {
  var block = function (title, items) {
    return '<li><div><h3>' + title + '</h3></div><div style="grid-column:2 / -1"><ul>' + items.map(function (t) {
      return '<li class="mk-muted" style="padding:10px 0;border-bottom:1px solid var(--mk-line)">' + t + '</li>';
    }).join('') + '</ul></div></li>';
  };
  return '' +
  '<section class="mk-hero-simple"><div class="mk-wrap"><div class="mk-hero-copy">' +
    MK.crumbs([{ href: '/', label: 'Home' }, { label: 'Security' }]) +
    '<h1>Security and data handling.</h1>' +
    '<p class="mk-lede">Written for the compliance officer, information security lead or operations head who has to sign off. Plain statements of what we do, and nothing we cannot back up.</p>' +
  '</div></div></section>' +

  '<section class="mk-section" style="border-top:0;padding-top:0"><div class="mk-wrap">' +
    '<ul class="mk-work">' +
      block('Where your data lives', [
        'MonkFlow builds the workflow layer, not a data store. Records land in your system of record: your CRM, core, property-management or fund-admin system.',
        'We do not persist client PII on MonkFlow infrastructure.',
        'What we build can be deployed inside your own cloud environment, so data never leaves your perimeter.',
      ]) +
      block('Encryption', [
        'AES-256 encryption at rest for stored files and data.',
        'TLS for all data in transit.',
      ]) +
      block('Access and audit', [
        'Role-based access in everything we build, so each person sees only what their role requires.',
        'An audit trail of submissions, uploads, downloads, edits, approvals and signatures, with who and when.',
        'On our side, access is limited to the engineer working on your system.',
      ]) +
      block('How AI is used', [
        'AI is used for reading and drafting. Calculations and system updates are deterministic code.',
        'Every extracted value links to the document and page it came from.',
        'A person on your team reviews and approves before anything reaches a system of record or a client.',
        'Models can run privately in your own cloud, or through zero-retention configurations where the provider does not retain your documents.',
      ]) +
      block('Working with your review process', [
        'We complete your vendor due-diligence questionnaire.',
        'We walk your security or compliance team through the architecture and data flows before any data moves.',
        'The workflow audit includes a written data-handling note for the specific workflow in question.',
      ]) +
    '</ul>' +
  '</div></section>' +
  MK.cta({ title: 'Have a security questionnaire?', body: 'Send it over or book a session. We would rather answer the hard questions before the build than after.' });
};

MK.pages.notFound = function () {
  return '' +
  '<section class="mk-hero-simple" style="min-height:52vh"><div class="mk-wrap"><div class="mk-hero-copy">' +
    '<span class="mk-eyebrow">Page not found</span>' +
    '<h1>That page does not exist.</h1>' +
    '<p class="mk-lede">The link may be old. These will get you where you were going.</p>' +
    '<div class="mk-actions">' + MK.link('/', 'Home', 'mk-btn mk-btn-primary') + MK.link('/solutions', 'Solutions', 'mk-arrow') + MK.link('/case-studies', 'Case studies', 'mk-arrow') + '</div>' +
  '</div></div></section>';
};
