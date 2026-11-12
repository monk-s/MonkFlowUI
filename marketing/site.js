/* ============================================================
   MonkFlow marketing site — routes, per-page metadata, mounting and
   event wiring.

   MK.routes is the single source of truth for public URLs. It is read by:
     - app.js dispatchLandingRoute()  -> MK.mount(pathname)
     - scripts/prerender.mjs          -> static HTML, sitemap.xml
   Add a page by adding a route here and a builder in marketing/pages.js,
   then run `node scripts/prerender.mjs`.
   ============================================================ */
var MK = globalThis.MK || (globalThis.MK = {});

MK.ld = {
  org: function () {
    return {
      '@type': 'ProfessionalService',
      '@id': MK.site.url + '/#organization',
      name: 'MonkFlow',
      url: MK.site.url,
      logo: MK.site.url + '/assets/og/logo.png',
      image: MK.site.url + '/assets/og/home.png',
      description: MK.site.tagline,
      founder: { '@type': 'Person', name: 'Nathan Linder' },
      areaServed: 'US',
      knowsAbout: ['Custom software development', 'Workflow automation', 'Document automation', 'Applied AI', 'Commercial real estate technology', 'Banking technology', 'Investment operations'],
    };
  },
  crumbs: function (items) {
    return {
      '@type': 'BreadcrumbList',
      itemListElement: items.map(function (it, i) {
        return { '@type': 'ListItem', position: i + 1, name: it[0], item: MK.site.url + it[1] };
      }),
    };
  },
  service: function (v) {
    return {
      '@type': 'Service',
      name: v.meta.serviceType,
      serviceType: v.meta.serviceType,
      description: v.meta.description,
      url: MK.site.url + v.path,
      provider: { '@id': MK.site.url + '/#organization' },
      audience: { '@type': 'BusinessAudience', audienceType: v.meta.audience },
      areaServed: 'US',
    };
  },
  faq: function (items) {
    return {
      '@type': 'FAQPage',
      mainEntity: items.map(function (f) {
        return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
      }),
    };
  },
};

MK.verticalRoute = function (key) {
  var v = MK.verticals[key];
  return {
    path: v.path,
    title: v.meta.title,
    description: v.meta.description,
    og: v.meta.og,
    render: function () { return MK.pages.vertical(key); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.service(v), MK.ld.faq(v.faq), MK.ld.crumbs([['Home', '/'], ['Solutions', '/solutions'], [v.name, v.path]])]; },
  };
};

MK.routes = [
  {
    path: '/',
    title: 'MonkFlow | Custom Software & Practical AI for CRE, Banks and Investment Firms',
    description: 'Founder-led custom software, integrations and document automation for commercial real estate firms, banks and investment firms. Built around the systems you already run.',
    render: function () { return MK.pages.home(); },
    jsonLd: function () { return [MK.ld.org(), { '@type': 'WebSite', name: 'MonkFlow', url: MK.site.url }]; },
  },
  {
    path: '/solutions',
    title: 'Solutions for CRE Firms, Banks and Investment Firms | MonkFlow',
    description: 'Custom software and workflow automation for commercial real estate firms, banks, investment firms and RIAs.',
    render: function () { return MK.pages.solutions(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['Solutions', '/solutions']])]; },
  },
  MK.verticalRoute('cre'),
  MK.verticalRoute('banks'),
  MK.verticalRoute('funds'),
  {
    path: '/for-advisors',
    title: 'Digital Intake & CRM Sync for Advisory Firms (RIAs) | MonkFlow',
    description: 'Digital intake forms, CRM sync for Redtail, Wealthbox and Salesforce, and signed-PDF generation for independent advisory firms. Built by a founder-led engineering shop.',
    og: '/assets/og/investment-firms.png',
    render: function () { return MK.pages.advisors(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['Investment firms', '/solutions/investment-firms'], ['Advisory firms', '/for-advisors']])]; },
  },
  {
    path: '/capabilities',
    title: 'Capabilities & Integrations | MonkFlow',
    description: 'Custom internal tools and portals, system and core integrations, document and underwriting automation, and practical AI workflows with human review.',
    render: function () { return MK.pages.capabilities(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['Capabilities', '/capabilities']])]; },
  },
  {
    path: '/case-studies',
    title: 'Case Studies & Working Demos | MonkFlow',
    description: 'How Team Financial Strategies cut client onboarding from 45 minutes to under 5, plus working demos for banking and commercial real estate.',
    render: function () { return MK.pages.caseStudies(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['Case studies', '/case-studies']])]; },
  },
  {
    path: '/case-studies/team-financial-strategies',
    title: 'Case Study: Team Financial Strategies Cut Onboarding from 45 Minutes to 5 | MonkFlow',
    description: 'A custom intake form, Redtail sync and signed-PDF generation took new-client onboarding at a four-advisor firm from 45 minutes to under 5. Built in two weeks.',
    ogType: 'article',
    render: function () { return MK.pages.tfs(); },
    jsonLd: function () {
      return [MK.ld.org(), {
        '@type': 'Article',
        headline: 'How Team Financial Strategies cut new-client onboarding from 45 minutes to under 5',
        about: 'Client onboarding automation for a wealth management firm',
        author: { '@id': MK.site.url + '/#organization' },
        publisher: { '@id': MK.site.url + '/#organization' },
        mainEntityOfPage: MK.site.url + '/case-studies/team-financial-strategies',
        image: MK.site.url + '/assets/og/home.png',
      }, MK.ld.crumbs([['Home', '/'], ['Case studies', '/case-studies'], ['Team Financial Strategies', '/case-studies/team-financial-strategies']])];
    },
  },
  {
    path: '/how-we-work',
    title: 'How We Work | MonkFlow',
    description: 'One accountable engineer, a written scope before any build, and working software early. How a MonkFlow engagement runs, from workflow audit to ongoing support.',
    render: function () { return MK.pages.howWeWork(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['How we work', '/how-we-work']])]; },
  },
  {
    path: '/security',
    title: 'Security & Data Handling | MonkFlow',
    description: 'AES-256 encryption at rest, TLS in transit, no client PII persisted on MonkFlow infrastructure, role-based access, audit trails, and private or zero-retention AI deployment.',
    render: function () { return MK.pages.security(); },
    jsonLd: function () { return [MK.ld.org(), MK.ld.crumbs([['Home', '/'], ['Security', '/security']])]; },
  },
  {
    // Shareable booking link for outreach emails: the homepage with the
    // booking modal open. Accepts ?intent=audit and ?v=<firm type>.
    path: '/book',
    canonical: '/',
    noPrerender: true,
    title: 'Book a Working Session | MonkFlow',
    description: 'Book 20 minutes with the engineer who would build your system.',
    render: function () { return MK.pages.home(); },
    onMount: function () {
      var q = new URLSearchParams(window.location.search);
      setTimeout(function () { showSchedulingModal({ intent: q.get('intent') || '', vertical: q.get('v') || '' }); }, 300);
    },
  },
];

MK.notFoundRoute = {
  path: '/404',
  noindex: true,
  noPrerender: true,
  title: 'Page not found | MonkFlow',
  description: 'That page does not exist.',
  render: function () { return MK.pages.notFound(); },
};

MK.normalize = function (pathname) {
  var p = (pathname || '/').replace(/\/index\.html$/, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
};

MK.resolve = function (pathname) {
  var p = MK.normalize(pathname);
  for (var i = 0; i < MK.routes.length; i++) if (MK.routes[i].path === p) return MK.routes[i];
  return null;
};

// Head tags for a route, as plain data. Used by both setMeta() in the
// browser and the prerender script, so the two cannot drift apart.
MK.metaFor = function (route) {
  var canonical = MK.site.url + (route.canonical || route.path);
  if (route === MK.notFoundRoute) canonical = '';
  var graph = route.jsonLd ? route.jsonLd() : [MK.ld.org()];
  return {
    title: route.title,
    description: route.description,
    canonical: canonical,
    robots: route.noindex ? 'noindex' : 'index,follow',
    ogType: route.ogType || 'website',
    ogImage: MK.site.url + (route.og || '/assets/og/home.png'),
    jsonLd: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
  };
};

/* ---------- browser only below ---------- */
MK.setMeta = function (route) {
  var m = MK.metaFor(route);
  var set = function (selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };
  document.title = m.title;
  set('meta[name="description"]', 'content', m.description);
  set('meta[name="robots"]', 'content', m.robots);
  set('link[rel="canonical"]', 'href', m.canonical || window.location.href);
  set('meta[property="og:type"]', 'content', m.ogType);
  set('meta[property="og:title"]', 'content', m.title);
  set('meta[property="og:description"]', 'content', m.description);
  set('meta[property="og:url"]', 'content', m.canonical || window.location.href);
  set('meta[property="og:image"]', 'content', m.ogImage);
  set('meta[name="twitter:title"]', 'content', m.title);
  set('meta[name="twitter:description"]', 'content', m.description);
  set('meta[name="twitter:image"]', 'content', m.ogImage);
  var ld = document.getElementById('mk-jsonld');
  if (ld) ld.textContent = m.jsonLd;
};

MK.mount = function (pathname) {
  var container = document.getElementById('landing-container');
  if (!container) return;
  var route = MK.resolve(pathname) || MK.notFoundRoute;
  container.classList.add('mk');
  container.innerHTML = MK.shell(route.path, route.render());
  MK.setMeta(route);

  // Outreach links can pre-select a firm type: /?v=cre | banks | funds
  var v = new URLSearchParams(window.location.search).get('v');
  if (v) {
    var card = container.querySelector('[data-vertical-card="' + v.replace(/[^a-z]/g, '') + '"]');
    if (card) card.classList.add('is-match');
  }

  // In-page anchors such as /how-we-work#engagements
  var hash = window.location.hash;
  if (hash && hash.length > 1 && /^#[a-z][\w-]*$/i.test(hash)) {
    var target = container.querySelector(hash);
    if (target) target.scrollIntoView();
  }
  if (route.onMount) route.onMount();
};

MK.track = function (name, props) {
  try { window.plausible && window.plausible(name, props ? { props: props } : undefined); } catch (_) {}
};

MK.onClick = function (e) {
  var container = document.getElementById('landing-container');
  if (!container || !container.contains(e.target)) return;
  var el;

  if ((el = e.target.closest('[data-book]'))) {
    e.preventDefault();
    showSchedulingModal({ intent: el.getAttribute('data-intent') || '', vertical: el.getAttribute('data-vertical') || '' });
    return;
  }
  if ((el = e.target.closest('[data-signin]'))) { e.preventDefault(); showAuth(); return; }
  if ((el = e.target.closest('[data-legal]'))) { e.preventDefault(); showLegalPage(el.getAttribute('data-legal')); return; }

  if ((el = e.target.closest('[data-nav-toggle]'))) {
    var nav = el.closest('[data-nav]');
    var open = nav.classList.toggle('is-open');
    el.setAttribute('aria-expanded', String(open));
    return;
  }

  if ((el = e.target.closest('[data-tab]'))) {
    var group = el.closest('[data-tabs]');
    var key = el.getAttribute('data-tab');
    group.querySelectorAll('[data-tab]').forEach(function (t) { t.setAttribute('aria-selected', String(t === el)); });
    group.querySelectorAll('[data-tabpanel]').forEach(function (p) { p.hidden = p.getAttribute('data-tabpanel') !== key; });
    return;
  }

  if ((el = e.target.closest('[data-filter]'))) {
    var fgroup = el.closest('[data-filter-group]');
    var f = el.getAttribute('data-filter');
    fgroup.querySelectorAll('[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', String(c === el)); });
    fgroup.querySelectorAll('tr[data-verticals]').forEach(function (row) {
      row.hidden = f !== 'all' && row.getAttribute('data-verticals').split(' ').indexOf(f) === -1;
    });
    return;
  }

  if ((el = e.target.closest('a[data-link]'))) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (el.hasAttribute('data-vertical-card')) MK.track('Vertical Card Click', { vertical: el.getAttribute('data-vertical-card') });
    navigateToPath(el.getAttribute('href'));
  }
};

MK.onInput = function (e) {
  var form = e.target.closest && e.target.closest('[data-roi]');
  if (!form) return;
  var n = function (name) { var x = parseFloat(form.elements[name].value); return isFinite(x) && x > 0 ? x : 0; };
  var out = MK.roiCalc(n('volume'), n('minutes'), n('rate'), Math.min(n('saved'), 100));
  form.querySelector('[data-roi-hours]').textContent = MK.fmt(out.hours);
  form.querySelector('[data-roi-value]').textContent = '$' + MK.fmt(out.value);
  if (!form._tracked) { form._tracked = true; MK.track('ROI Estimate Used'); }
};

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', MK.onClick);
  document.addEventListener('input', MK.onInput);
}
