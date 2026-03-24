/* ============================================================
   MONK FLOW — Complete SaaS Application
   ============================================================ */

// ── SVG Icons ──────────────────────────────────────────────
const icons = {
  dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  workflow: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  agents: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  integrations: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>`,
  templates: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
  logs: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>`,
  analytics: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  billing: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  bell: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  arrowUp: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  arrowDown: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  pause: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  zap: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  globe: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.3 9.3"/><path d="M18.5 5.5 21 3"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  filter: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  moreV: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
  help: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  mail: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  book: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  save: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  zoomIn: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/></svg>`,
  zoomOut: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/></svg>`,
  send: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
};

// ── API Client ───────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8080/api/v1'
  : '/api/v1';
const api = {
  get token() { return localStorage.getItem('accessToken'); },
  get refreshToken() { return localStorage.getItem('refreshToken'); },
  setTokens(access, refresh) {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
  },
  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    let res = await fetch(`${API_BASE}${path}`, opts);
    // Auto-refresh on 401
    if (res.status === 401 && this.refreshToken && !path.includes('/auth/')) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        this.setTokens(data.accessToken, data.refreshToken);
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
      } else {
        this.clearTokens();
        isAuthenticated = false;
        showLanding();
        return null;
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new Error(err.error?.message || 'Request failed');
    }
    return res.json();
  },
  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },
};

// ── State ──────────────────────────────────────────────
let currentPage = 'dashboard';
let isAuthenticated = !!localStorage.getItem('accessToken');
let currentUser = null;
let notificationPanelOpen = false;
let searchDropdownOpen = false;
let searchSelectedIndex = -1;

// ── Notifications Data ──────────────────────────────────
let notifications = [
  { id: 1, type: 'workflow', title: 'Workflow Completed', message: 'Lead Scoring Pipeline finished with 99.2% success rate', time: '2 min ago', read: false, icon: 'workflow' },
  { id: 2, type: 'agent', title: 'Agent Alert', message: 'Support Agent handled 150 tickets today — new record!', time: '15 min ago', read: false, icon: 'agents' },
  { id: 3, type: 'system', title: 'System Update', message: 'Platform maintenance scheduled for tonight at 2 AM EST', time: '1 hour ago', read: false, icon: 'shield' },
  { id: 4, type: 'workflow', title: 'Workflow Error', message: 'Slack Alert System failed — API rate limit exceeded', time: '2 hours ago', read: false, icon: 'workflow' },
  { id: 5, type: 'integration', title: 'New Integration', message: 'Salesforce connection synced 234 new records', time: '3 hours ago', read: true, icon: 'integrations' },
  { id: 6, type: 'team', title: 'Team Update', message: 'Sarah Chen accepted your invitation to join the team', time: '5 hours ago', read: true, icon: 'users' },
  { id: 7, type: 'agent', title: 'Agent Deployed', message: 'Content Writer v2 is now live in production', time: '1 day ago', read: true, icon: 'agents' },
  { id: 8, type: 'workflow', title: 'Workflow Paused', message: 'Invoice Processing paused due to PDF parsing timeout', time: '1 day ago', read: true, icon: 'workflow' },
  { id: 9, type: 'system', title: 'Usage Alert', message: 'You have used 85% of your monthly API quota', time: '2 days ago', read: true, icon: 'zap' },
  { id: 10, type: 'integration', title: 'Integration Update', message: 'OpenAI connector updated to GPT-4o support', time: '3 days ago', read: true, icon: 'integrations' },
];

// ── Search Index ──────────────────────────────────────────
const searchIndex = [
  { type: 'page', name: 'Dashboard', page: 'dashboard', keywords: ['home', 'overview', 'stats', 'activity'] },
  { type: 'page', name: 'Workflows', page: 'workflows', keywords: ['automation', 'pipeline', 'trigger'] },
  { type: 'page', name: 'AI Solutions', page: 'agents', keywords: ['ai', 'agent', 'bot', 'intelligence'] },
  { type: 'page', name: 'Integrations', page: 'integrations', keywords: ['connect', 'api', 'sync', 'slack', 'salesforce'] },
  { type: 'page', name: 'Analytics', page: 'analytics', keywords: ['data', 'reports', 'performance', 'metrics'] },
  { type: 'page', name: 'Settings', page: 'settings', keywords: ['account', 'profile', 'api keys', 'preferences'] },
  { type: 'page', name: 'Team Management', page: 'team', keywords: ['members', 'invite', 'roles', 'permissions'] },
  { type: 'page', name: 'Help Center', page: 'help', keywords: ['support', 'docs', 'faq', 'guide'] },
  { type: 'page', name: 'Logs', page: 'logs', keywords: ['execution', 'debug', 'error', 'stream'] },
  { type: 'workflow', name: 'Lead Scoring Pipeline', page: 'workflows', keywords: ['leads', 'scoring', 'webhook'] },
  { type: 'workflow', name: 'Email Outreach Sequence', page: 'workflows', keywords: ['email', 'outreach', 'campaign'] },
  { type: 'workflow', name: 'Customer Onboarding', page: 'workflows', keywords: ['onboarding', 'customer', 'welcome'] },
  { type: 'workflow', name: 'Invoice Processing', page: 'workflows', keywords: ['invoice', 'billing', 'payment'] },
  { type: 'workflow', name: 'Support Ticket Router', page: 'workflows', keywords: ['support', 'tickets', 'routing'] },
  { type: 'workflow', name: 'Data Backup Pipeline', page: 'workflows', keywords: ['backup', 'data', 's3'] },
  { type: 'agent', name: 'Lead Qualifier', page: 'agents', keywords: ['leads', 'qualify', 'score'] },
  { type: 'agent', name: 'Content Writer', page: 'agents', keywords: ['content', 'blog', 'writing'] },
  { type: 'agent', name: 'Support Agent', page: 'agents', keywords: ['support', 'customer', 'tickets'] },
  { type: 'agent', name: 'Data Analyst', page: 'agents', keywords: ['data', 'analysis', 'reports'] },
  { type: 'integration', name: 'Slack', page: 'integrations', keywords: ['slack', 'messaging', 'chat'] },
  { type: 'integration', name: 'Salesforce', page: 'integrations', keywords: ['crm', 'salesforce', 'leads'] },
  { type: 'integration', name: 'Stripe', page: 'integrations', keywords: ['stripe', 'payments', 'billing'] },
  { type: 'integration', name: 'OpenAI', page: 'integrations', keywords: ['openai', 'gpt', 'ai', 'llm'] },
  { type: 'setting', name: 'Profile Settings', page: 'settings', keywords: ['profile', 'name', 'email'] },
  { type: 'setting', name: 'API Keys', page: 'settings', keywords: ['api', 'key', 'token', 'secret'] },
  { type: 'setting', name: 'Notification Preferences', page: 'settings', keywords: ['notifications', 'alerts', 'email'] },
];

// ── Workflow Editor State ──────────────────────────────────
let editorState = {
  nodes: [
    { id: 1, type: 'webhook-trigger', label: 'Webhook Trigger', desc: 'POST /api/leads', x: 60, y: 180, color: 'green', icon: 'zap' },
    { id: 2, type: 'ai-classifier', label: 'AI Classifier', desc: 'Score & categorize', x: 340, y: 140, color: 'blue', icon: 'agents' },
    { id: 3, type: 'condition', label: 'Conditional Split', desc: 'Score >= 80?', x: 340, y: 300, color: 'purple', icon: 'filter' },
    { id: 4, type: 'action', label: 'Send to CRM', desc: 'Salesforce record', x: 620, y: 120, color: 'orange', icon: 'mail' },
    { id: 5, type: 'action', label: 'Email Sequence', desc: 'Nurture campaign', x: 620, y: 300, color: 'green', icon: 'mail' },
  ],
  connections: [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 3, to: 5 },
  ],
  selectedNodeId: null,
  draggingNodeId: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  connecting: false,
  connectFromId: null,
  nextId: 6,
  zoom: 100,
  workflowName: 'Lead Scoring Pipeline',
};

const nodeTypes = [
  { category: 'Triggers', items: [
    { type: 'webhook-trigger', label: 'Webhook', icon: 'zap', color: 'green', desc: 'HTTP endpoint' },
    { type: 'schedule-trigger', label: 'Schedule', icon: 'clock', color: 'blue', desc: 'Cron timer' },
    { type: 'event-trigger', label: 'Event', icon: 'bell', color: 'yellow', desc: 'System event' },
  ]},
  { category: 'AI', items: [
    { type: 'ai-classifier', label: 'AI Classifier', icon: 'agents', color: 'blue', desc: 'Classify data' },
    { type: 'ai-generator', label: 'AI Writer', icon: 'edit', color: 'purple', desc: 'Generate text' },
    { type: 'ai-analyzer', label: 'AI Analyzer', icon: 'analytics', color: 'green', desc: 'Analyze data' },
  ]},
  { category: 'Logic', items: [
    { type: 'condition', label: 'Condition', icon: 'filter', color: 'purple', desc: 'If/else split' },
    { type: 'delay', label: 'Delay', icon: 'clock', color: 'yellow', desc: 'Wait period' },
    { type: 'loop', label: 'Loop', icon: 'workflow', color: 'blue', desc: 'Iterate items' },
  ]},
  { category: 'Actions', items: [
    { type: 'action', label: 'Send Email', icon: 'mail', color: 'green', desc: 'Email action' },
    { type: 'api-call', label: 'API Call', icon: 'globe', color: 'blue', desc: 'HTTP request' },
    { type: 'notify', label: 'Notification', icon: 'bell', color: 'orange', desc: 'Send alert' },
    { type: 'database', label: 'Database', icon: 'logs', color: 'purple', desc: 'DB operation' },
  ]},
];

// ── Router ──────────────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  closeNotificationPanel();
  closeSearchDropdown();
  renderTopbar();
  renderMainContent();
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Init editor if navigating to workflow-editor
  if (page === 'workflow-editor') {
    setTimeout(() => initWorkflowEditor(), 50);
  }
}

// ── Initialize ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (isAuthenticated) {
    try {
      const data = await api.get('/users/me');
      if (data && data.user) {
        currentUser = data.user;
        showApp();
      } else {
        api.clearTokens();
        isAuthenticated = false;
        showLanding();
      }
    } catch {
      // Token invalid — show landing
      api.clearTokens();
      isAuthenticated = false;
      showLanding();
    }
  } else {
    showLanding();
  }
});

// ── Landing Page ──────────────────────────────────────────
function showLanding() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('landing-container').classList.remove('hidden');
  renderLandingPage();
}

function showAuth() {
  document.getElementById('landing-container').classList.add('hidden');
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('auth-container').classList.remove('hidden');
  renderAuthLogin();
}

function showApp() {
  document.getElementById('landing-container').classList.add('hidden');
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  renderSidebar();
  renderTopbar();
  renderMainContent();
}

// ── Auth Handlers ──────────────────────────────────────
async function handleLogin() {
  const emailEl = document.querySelector('#auth-login input[type="email"]');
  const passEl = document.querySelector('#auth-login input[type="password"]');
  const email = emailEl?.value?.trim();
  const password = passEl?.value;
  if (!email || !password) { showToast('Please enter email and password', 'error'); return; }
  try {
    const data = await api.post('/auth/login', { email, password });
    api.setTokens(data.accessToken, data.refreshToken);
    currentUser = data.user;
    isAuthenticated = true;
    showApp();
    showToast(`Welcome back, ${data.user.first_name}!`);
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  }
}

async function handleSignup() {
  const inputs = document.querySelectorAll('#auth-signup input');
  const firstName = inputs[0]?.value?.trim();
  const lastName = inputs[1]?.value?.trim();
  const email = inputs[2]?.value?.trim();
  const password = inputs[3]?.value;
  const company = inputs[4]?.value?.trim();
  if (!firstName || !lastName || !email || !password) { showToast('Please fill all required fields', 'error'); return; }
  if (password.length < 8) { showToast('Password must be at least 8 characters', 'error'); return; }
  try {
    const data = await api.post('/auth/signup', { email, password, firstName, lastName, company });
    api.setTokens(data.accessToken, data.refreshToken);
    currentUser = data.user;
    isAuthenticated = true;
    showApp();
    showToast('Account created! Welcome to Monk Flow.');
  } catch (err) {
    showToast(err.message || 'Signup failed', 'error');
  }
}

async function handleLogout() {
  try {
    await api.post('/auth/logout', { refreshToken: api.refreshToken });
  } catch { /* ignore logout errors */ }
  api.clearTokens();
  isAuthenticated = false;
  currentUser = null;
  currentPage = 'dashboard';
  showLanding();
  showToast('Signed out successfully', 'info');
}

// ── Data Fetching Helpers ──────────────────────────────
async function fetchDashboardData() {
  try {
    const [wfData, agentData, logData, notifData] = await Promise.all([
      api.get('/workflows?limit=5'),
      api.get('/agents?limit=5'),
      api.get('/logs?limit=5'),
      api.get('/notifications?limit=5&read=false'),
    ]);
    return { workflows: wfData?.data || [], agents: agentData?.data || [], logs: logData?.data || [], notifications: notifData?.data || [], unreadCount: notifData?.unreadCount || 0 };
  } catch { return null; }
}

async function fetchNotifications() {
  try {
    const data = await api.get('/notifications?limit=20');
    if (data) {
      notifications = (data.data || []).map((n, i) => ({
        id: n.id, type: n.type, title: n.title, message: n.message,
        time: new Date(n.created_at).toLocaleString(), read: n.read, icon: n.icon || 'bell',
      }));
    }
  } catch { /* use existing notifications */ }
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Modal ──────────────────────────────────────────────
function showModal(content) {
  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-content');
  box.innerHTML = content;
  overlay.classList.remove('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Landing Page Render ──────────────────────────────────
function renderLandingPage() {
  const container = document.getElementById('landing-container');

  const testimonials = [
    { name: 'Sarah Mitchell', role: 'CEO at Acme Corp', initials: 'SM', quote: 'MonkFlow completely transformed how we onboard new clients. What used to take 3 days now happens in under 2 hours.', result: '85% faster onboarding' },
    { name: 'James Park', role: 'Operations Director at Meridian Health', initials: 'JP', quote: 'The AI chatbot actually understands our medical scheduling workflows. Our call center volume dropped 40% in the first month.', result: '40% fewer support calls' },
    { name: 'Rachel Torres', role: 'Founder at Peak Fitness', initials: 'RT', quote: 'AI-powered slot optimization increased our booking rates by 28% across 12 locations.', result: '28% more bookings' },
  ];

  const services = [
    { icon: icons.users, title: 'Onboarding Tools', desc: 'Automated client & employee onboarding flows with document collection and progress tracking.' },
    { icon: icons.clock, title: 'Scheduling Software', desc: 'Smart booking systems with AI-powered optimization, reminders, and multi-provider sync.' },
    { icon: icons.agents, title: 'Custom Chatbots', desc: 'AI chatbots trained on your business data — not generic bots, intelligent assistants.' },
    { icon: icons.workflow, title: 'Workflow Automation', desc: 'End-to-end process automation connecting your existing tools, eliminating manual bottlenecks.' },
    { icon: icons.analytics, title: 'Data & Analytics', desc: 'Custom data pipelines, real-time dashboards, and automated reporting built around your KPIs.' },
    { icon: icons.help, title: 'Support Systems', desc: 'AI-powered ticket classification, knowledge bases, and escalation workflows.' },
  ];

  container.innerHTML = `
    <nav class="landing-nav">
      <div class="landing-nav-inner">
        <div class="landing-nav-logo">
          <img src="logo.svg" alt="MonkFlow" class="logo-icon-img">
          <div class="logo-text">Monk<span>Flow</span></div>
        </div>
        <div class="landing-nav-links">
          <a href="#landing-services" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">Services</a>
          <a href="#landing-testimonials" onclick="event.preventDefault();document.getElementById('landing-testimonials').scrollIntoView({behavior:'smooth'})">Testimonials</a>
          <a href="#landing-about" onclick="event.preventDefault();document.getElementById('landing-about').scrollIntoView({behavior:'smooth'})">About</a>
        </div>
        <div class="landing-nav-actions">
          <button class="btn btn-ghost" onclick="showAuth()">Sign In</button>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('landing-schedule').scrollIntoView({behavior:'smooth'})">Schedule a Call</button>
        </div>
        <button class="landing-menu-btn" onclick="document.querySelector('.landing-nav-links').classList.toggle('open');document.querySelector('.landing-nav-actions').classList.toggle('open')">
          ${icons.menu}
        </button>
      </div>
    </nav>

    <!-- Hero -->
    <section class="landing-hero">
      <div class="landing-hero-content">
        <div class="hero-badge">Curated Software for Your Business</div>
        <h1 class="landing-hero-title">We Build the Tools<br/>Your Business <span class="text-accent">Actually Needs</span></h1>
        <p class="landing-hero-subtitle">MonkFlow crafts custom onboarding tools, scheduling software, chatbots, and intelligent workflows — built around your business, not the other way around. We don't just use AI. We implement it where it matters most.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" onclick="document.getElementById('landing-schedule').scrollIntoView({behavior:'smooth'})">${icons.clock} Schedule a Free Consultation</button>
          <button class="btn btn-secondary btn-lg" onclick="document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">${icons.eye} Explore Our Services</button>
        </div>
        <div class="landing-hero-stats">
          <div class="landing-stat"><div class="landing-stat-val">120+</div><div class="landing-stat-label">Businesses Served</div></div>
          <div class="landing-stat"><div class="landing-stat-val">340+</div><div class="landing-stat-label">Tools Delivered</div></div>
          <div class="landing-stat"><div class="landing-stat-val">99.7%</div><div class="landing-stat-label">Client Satisfaction</div></div>
          <div class="landing-stat"><div class="landing-stat-val">12,400h</div><div class="landing-stat-label">Hours Saved</div></div>
        </div>
      </div>
      <div class="hero-glow"></div>
    </section>

    <!-- Services -->
    <section id="landing-services" class="landing-section">
      <div class="landing-section-inner">
        <div class="section-header">
          <div class="hero-badge">What We Build</div>
          <h2 class="section-title">Custom Software Solutions</h2>
          <p class="section-subtitle">Every tool we build is purpose-built for your workflows — not a one-size-fits-all template.</p>
        </div>
        <div class="landing-services-grid">
          ${services.map(s => `
            <div class="landing-service-card">
              <div class="landing-service-icon">${s.icon}</div>
              <h3>${s.title}</h3>
              <p>${s.desc}</p>
            </div>
          `).join('')}
        </div>

        <div class="landing-ai-banner">
          <div class="ai-banner-icon">${icons.zap}</div>
          <div>
            <h3>We Don't Just Use AI — We Implement It Where It Matters</h3>
            <p>We study your operations, identify where AI can create real impact, and build custom tools that integrate intelligence into your existing processes. No gimmicks — just practical AI that solves real problems.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section id="landing-testimonials" class="landing-section landing-section-alt">
      <div class="landing-section-inner">
        <div class="section-header">
          <div class="hero-badge">Client Success</div>
          <h2 class="section-title">Trusted by 120+ Businesses</h2>
          <p class="section-subtitle">Don't take our word for it — hear from the businesses we've helped transform.</p>
        </div>
        <div class="landing-testimonials-grid">
          ${testimonials.map(t => `
            <div class="landing-testimonial-card">
              <div class="testimonial-quote">"${t.quote}"</div>
              <div class="testimonial-result">
                <span class="result-badge">${icons.zap} ${t.result}</span>
              </div>
              <div class="testimonial-author">
                <div class="testimonial-avatar">${t.initials}</div>
                <div>
                  <div class="testimonial-name">${t.name}</div>
                  <div class="testimonial-role">${t.role}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- About / AI Approach -->
    <section id="landing-about" class="landing-section">
      <div class="landing-section-inner">
        <div class="section-header">
          <div class="hero-badge">Our Approach</div>
          <h2 class="section-title">How We Work</h2>
          <p class="section-subtitle">Every project follows our proven four-step process.</p>
        </div>
        <div class="landing-process-grid">
          <div class="landing-process-step">
            <div class="process-number">1</div>
            <div class="process-icon">${icons.search}</div>
            <h3>Discover</h3>
            <p>We learn your business inside and out before writing a single line of code.</p>
          </div>
          <div class="landing-process-step">
            <div class="process-number">2</div>
            <div class="process-icon">${icons.agents}</div>
            <h3>Implement AI</h3>
            <p>We integrate AI where it genuinely solves your problems — not everywhere.</p>
          </div>
          <div class="landing-process-step">
            <div class="process-number">3</div>
            <div class="process-icon">${icons.workflow}</div>
            <h3>Build & Deploy</h3>
            <p>Every tool is purpose-built for your specific workflows and processes.</p>
          </div>
          <div class="landing-process-step">
            <div class="process-number">4</div>
            <div class="process-icon">${icons.zap}</div>
            <h3>Iterate & Scale</h3>
            <p>We stay with you, refining tools as your business grows and evolves.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Schedule CTA -->
    <section id="landing-schedule" class="landing-section landing-section-alt">
      <div class="landing-section-inner">
        <div class="landing-cta">
          <h2>Ready to Build Something Great?</h2>
          <p>Every tool we build starts with a conversation. Tell us about your business, and we'll show you what's possible.</p>
          <div class="landing-cta-actions">
            <button class="btn btn-primary btn-lg" onclick="showAuth()">${icons.clock} Schedule Your Free Consultation</button>
            <button class="btn btn-secondary btn-lg" onclick="showAuth()">${icons.eye} Sign In to Dashboard</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="landing-footer">
      <div class="landing-footer-inner">
        <div class="landing-footer-brand">
          <div class="landing-nav-logo">
            <img src="logo.svg" alt="MonkFlow" class="logo-icon-img">
            <div class="logo-text">Monk<span>Flow</span></div>
          </div>
          <p>Custom software tools built around your business — not the other way around.</p>
        </div>
        <div class="landing-footer-links">
          <div>
            <h4>Solutions</h4>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">Onboarding Tools</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">Scheduling Software</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">AI Chatbots</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">Workflow Automation</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-about').scrollIntoView({behavior:'smooth'})">About</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-testimonials').scrollIntoView({behavior:'smooth'})">Testimonials</a>
            <a href="#" onclick="event.preventDefault();showAuth()">Sign In</a>
          </div>
        </div>
        <div class="landing-footer-bottom">
          <span>&copy; 2026 MonkFlow. All rights reserved.</span>
        </div>
      </div>
    </footer>
  `;
}

// ============================================================
// AUTH PAGES
// ============================================================
function renderAuthLogin() {
  document.getElementById('auth-login').innerHTML = `
    <div class="auth-screen">
      <div class="auth-left">
        <div class="auth-form-wrapper">
          <div class="auth-logo">
            <img src="logo.svg" alt="MonkFlow" class="logo-icon-img">
            <div class="logo-text">Monk<span>Flow</span></div>
          </div>
          <h1 class="auth-heading">Welcome back</h1>
          <p class="auth-subheading">Sign in to your MonkFlow dashboard to manage your projects.</p>
          <div class="auth-form">
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" placeholder="you@company.com" />
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" placeholder="Enter your password" />
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
                <input type="checkbox" style="width:auto;" /> Remember me
              </label>
              <a href="#" style="font-size:12px;">Forgot password?</a>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="handleLogin()">
              Sign In
            </button>
            <div class="auth-divider">or continue with</div>
            <div class="auth-social-btns">
              <button class="auth-social-btn" onclick="handleLogin()">
                ${icons.globe} Google
              </button>
              <button class="auth-social-btn" onclick="handleLogin()">
                ${icons.key} GitHub
              </button>
            </div>
          </div>
          <div class="auth-footer">
            Don't have an account? <a href="#" onclick="event.preventDefault();renderAuthSignup()">Sign up free</a>
          </div>
          <div style="text-align:center;margin-top:12px;">
            <a href="#" onclick="event.preventDefault();showLanding();" style="font-size:12px;color:var(--text-tertiary);">&larr; Back to home</a>
          </div>
        </div>
      </div>
      <div class="auth-right">
        <div class="auth-hero-content">
          <h2>Custom Software<br/><span style="color:var(--accent)">Built for You</span></h2>
          <p>We build curated tools for businesses — onboarding portals, scheduling systems, AI chatbots, and more. Not templates. Not generic SaaS. Software built around your business.</p>
          <div class="auth-features">
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              Custom onboarding & scheduling tools
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              AI implemented where it matters most
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              120+ businesses served
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              Dedicated team & ongoing support
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('auth-login').classList.remove('hidden');
  document.getElementById('auth-signup').classList.add('hidden');
}

function renderAuthSignup() {
  document.getElementById('auth-login').classList.add('hidden');
  document.getElementById('auth-signup').classList.remove('hidden');
  document.getElementById('auth-signup').innerHTML = `
    <div class="auth-screen">
      <div class="auth-left">
        <div class="auth-form-wrapper">
          <div class="auth-logo">
            <img src="logo.svg" alt="MonkFlow" class="logo-icon-img">
            <div class="logo-text">Monk<span>Flow</span></div>
          </div>
          <h1 class="auth-heading">Get started</h1>
          <p class="auth-subheading">Create your account to explore what MonkFlow can build for your business.</p>
          <div class="auth-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">First Name</label>
                <input type="text" placeholder="Nathan" />
              </div>
              <div class="form-group">
                <label class="form-label">Last Name</label>
                <input type="text" placeholder="Linder" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Work Email</label>
              <input type="email" placeholder="you@company.com" />
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" placeholder="Min 8 characters" />
            </div>
            <div class="form-group">
              <label class="form-label">Company Name</label>
              <input type="text" placeholder="Your company" />
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="handleSignup()">
              Create Account
            </button>
            <div class="auth-divider">or sign up with</div>
            <div class="auth-social-btns">
              <button class="auth-social-btn">${icons.globe} Google</button>
              <button class="auth-social-btn">${icons.key} GitHub</button>
            </div>
          </div>
          <div class="auth-footer">
            Already have an account? <a href="#" onclick="event.preventDefault();renderAuthLogin()">Sign in</a>
          </div>
          <div style="text-align:center;margin-top:12px;">
            <a href="#" onclick="event.preventDefault();showLanding();" style="font-size:12px;color:var(--text-tertiary);">&larr; Back to home</a>
          </div>
        </div>
      </div>
      <div class="auth-right">
        <div class="auth-hero-content">
          <h2>Join <span style="color:var(--accent)">120+</span><br/>Businesses</h2>
          <p>From startups to enterprises, we build curated software tools that transform how teams work.</p>
          <div class="auth-features">
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              Free consultation call
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              AI-powered custom solutions
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              99.7% client satisfaction
            </div>
            <div class="auth-feature">
              <div class="feature-check">${icons.check}</div>
              Ongoing support & iteration
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Sidebar (Client Dashboard — no marketing pages) ──────
function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <img src="logo.svg" alt="MonkFlow" class="logo-icon-img">
      <div class="logo-text">Monk<span>Flow</span></div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Main</div>
      <div class="nav-item active" data-page="dashboard" onclick="navigateTo('dashboard')">
        ${icons.dashboard} Dashboard
      </div>
      <div class="nav-item" data-page="workflows" onclick="navigateTo('workflows')">
        ${icons.workflow} Workflows
        <span class="badge">12</span>
      </div>
      <div class="nav-item" data-page="agents" onclick="navigateTo('agents')">
        ${icons.agents} AI Solutions
      </div>

      <div class="nav-section-label">Platform</div>
      <div class="nav-item" data-page="integrations" onclick="navigateTo('integrations')">
        ${icons.integrations} Integrations
      </div>
      <div class="nav-item" data-page="analytics" onclick="navigateTo('analytics')">
        ${icons.analytics} Analytics
      </div>
      <div class="nav-item" data-page="logs" onclick="navigateTo('logs')">
        ${icons.logs} Logs
      </div>

      <div class="nav-section-label">Account</div>
      <div class="nav-item" data-page="help" onclick="navigateTo('help')">
        ${icons.help} Help Center
      </div>
      <div class="nav-item" data-page="settings" onclick="navigateTo('settings')">
        ${icons.settings} Settings
      </div>
      <div class="nav-item" data-page="team" onclick="navigateTo('team')">
        ${icons.users} Team
      </div>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user" onclick="navigateTo('settings')">
        <div class="avatar">NL</div>
        <div class="user-info">
          <div class="user-name">Nathan Linder</div>
          <div class="user-plan">Curated Software Solutions</div>
        </div>
      </div>
      <button class="sidebar-logout-btn" onclick="handleLogout()">
        ${icons.logout} Sign Out
      </button>
    </div>
  `;
}

// ── Topbar ──────────────────────────────────────────────
function renderTopbar() {
  const titles = {
    dashboard: 'Dashboard',
    workflows: 'Workflows',
    agents: 'AI Solutions',
    integrations: 'Integrations',
    analytics: 'Analytics',
    logs: 'Execution Logs',
    help: 'Help Center',
    settings: 'Settings',
    team: 'Team Management',
    'workflow-editor': 'Workflow Editor',
  };
  const unreadCount = notifications.filter(n => !n.read).length;
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `
    <span class="topbar-title">${titles[currentPage] || 'Dashboard'}</span>
    <div class="topbar-search" style="position:relative;">
      ${icons.search}
      <input type="text" placeholder="Search workflows, agents, logs..." oninput="handleSearchInput(this.value)" onfocus="handleSearchInput(this.value)" onkeydown="handleSearchKeydown(event)" />
      <div id="search-dropdown" class="search-dropdown hidden"></div>
    </div>
    <div class="topbar-actions">
      <button class="topbar-btn" onclick="toggleNotificationPanel()" style="position:relative;">
        ${icons.bell}
        ${unreadCount > 0 ? '<span class="notif-dot"></span>' : ''}
      </button>
      <button class="topbar-btn" onclick="navigateTo('help')">
        ${icons.help}
      </button>
      <button class="btn btn-primary btn-sm" onclick="showNewWorkflowModal()">
        ${icons.plus} New Workflow
      </button>
    </div>
  `;
}

// ── Notification Panel ──────────────────────────────────
function toggleNotificationPanel() {
  if (notificationPanelOpen) {
    closeNotificationPanel();
  } else {
    openNotificationPanel();
  }
}

function openNotificationPanel() {
  closeSearchDropdown();
  notificationPanelOpen = true;
  let panel = document.getElementById('notification-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'notification-panel';
    panel.className = 'notifications-panel';
    document.querySelector('.topbar-actions').appendChild(panel);
  }
  renderNotificationPanel();
  panel.classList.remove('hidden');

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', closeNotifOnClickOutside);
    document.addEventListener('keydown', closeNotifOnEscape);
  }, 10);
}

function closeNotificationPanel() {
  notificationPanelOpen = false;
  const panel = document.getElementById('notification-panel');
  if (panel) panel.classList.add('hidden');
  document.removeEventListener('click', closeNotifOnClickOutside);
  document.removeEventListener('keydown', closeNotifOnEscape);
}

function closeNotifOnClickOutside(e) {
  const panel = document.getElementById('notification-panel');
  if (panel && !panel.contains(e.target) && !e.target.closest('.topbar-btn')) {
    closeNotificationPanel();
  }
}

function closeNotifOnEscape(e) {
  if (e.key === 'Escape') closeNotificationPanel();
}

function renderNotificationPanel() {
  const panel = document.getElementById('notification-panel');
  if (!panel) return;
  const unreadCount = notifications.filter(n => !n.read).length;

  panel.innerHTML = `
    <div class="notification-header">
      <span class="notification-header-title">Notifications ${unreadCount > 0 ? `<span class="notif-count">${unreadCount}</span>` : ''}</span>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();markAllNotificationsRead()">Mark all read</button>
    </div>
    <div class="notification-list">
      ${notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="event.stopPropagation();markNotificationRead(${n.id})">
          <div class="notification-icon ${n.type}">${icons[n.icon] || icons.bell}</div>
          <div class="notification-content">
            <div class="notification-title">${n.title}</div>
            <div class="notification-message">${n.message}</div>
            <div class="notification-time">${n.time}</div>
          </div>
          ${!n.read ? '<div class="notification-unread-dot"></div>' : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function markNotificationRead(id) {
  const n = notifications.find(n => n.id === id);
  if (n) n.read = true;
  api.patch(`/notifications/${id}/read`).catch(() => {});
  renderNotificationPanel();
  renderTopbar();
  // Re-open panel after topbar re-render
  setTimeout(() => {
    notificationPanelOpen = false;
    openNotificationPanel();
  }, 10);
}

function markAllNotificationsRead() {
  notifications.forEach(n => n.read = true);
  api.patch('/notifications/read-all').catch(() => {});
  renderNotificationPanel();
  renderTopbar();
  setTimeout(() => {
    notificationPanelOpen = false;
    openNotificationPanel();
  }, 10);
}

// ── Search Dropdown ──────────────────────────────────────
function handleSearchInput(query) {
  if (!query || query.trim().length === 0) {
    closeSearchDropdown();
    return;
  }
  const q = query.toLowerCase();
  const results = searchIndex.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.keywords.some(k => k.includes(q))
  );

  if (results.length === 0) {
    const dropdown = document.getElementById('search-dropdown');
    if (dropdown) {
      dropdown.innerHTML = '<div class="search-empty">No results found</div>';
      dropdown.classList.remove('hidden');
      searchDropdownOpen = true;
    }
    return;
  }

  // Group by type
  const grouped = {};
  results.forEach(r => {
    if (!grouped[r.type]) grouped[r.type] = [];
    if (grouped[r.type].length < 3) grouped[r.type].push(r);
  });

  renderSearchResults(grouped);
}

function renderSearchResults(grouped) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown) return;

  const typeLabels = { page: 'Pages', workflow: 'Workflows', agent: 'AI Agents', integration: 'Integrations', setting: 'Settings' };
  const typeIcons = { page: 'dashboard', workflow: 'workflow', agent: 'agents', integration: 'integrations', setting: 'settings' };

  let html = '';
  let idx = 0;
  for (const type in grouped) {
    html += `<div class="search-group-label">${typeLabels[type] || type}</div>`;
    grouped[type].forEach(item => {
      html += `
        <div class="search-result-item ${idx === searchSelectedIndex ? 'selected' : ''}" data-idx="${idx}" onclick="selectSearchResult('${item.page}')" onmouseenter="searchSelectedIndex=${idx};highlightSearchItem(${idx})">
          <span class="search-result-icon">${icons[typeIcons[type]] || icons.search}</span>
          <span class="search-result-name">${item.name}</span>
          <span class="search-result-type">${typeLabels[type] || type}</span>
        </div>
      `;
      idx++;
    });
  }

  dropdown.innerHTML = html;
  dropdown.classList.remove('hidden');
  searchDropdownOpen = true;
  searchSelectedIndex = -1;
}

function handleSearchKeydown(e) {
  if (!searchDropdownOpen) return;
  const items = document.querySelectorAll('.search-result-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchSelectedIndex = Math.min(searchSelectedIndex + 1, items.length - 1);
    highlightSearchItem(searchSelectedIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
    highlightSearchItem(searchSelectedIndex);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchSelectedIndex >= 0 && items[searchSelectedIndex]) {
      items[searchSelectedIndex].click();
    }
  } else if (e.key === 'Escape') {
    closeSearchDropdown();
  }
}

function highlightSearchItem(idx) {
  document.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
}

function selectSearchResult(page) {
  closeSearchDropdown();
  const input = document.querySelector('.topbar-search input');
  if (input) input.value = '';
  navigateTo(page);
}

function closeSearchDropdown() {
  searchDropdownOpen = false;
  searchSelectedIndex = -1;
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
}

// ── Main Content Router ──────────────────────────────────
function renderMainContent() {
  const main = document.getElementById('main-content');
  const pages = {
    dashboard: renderDashboard,
    workflows: renderWorkflows,
    agents: renderAgents,
    integrations: renderIntegrations,
    analytics: renderAnalytics,
    logs: renderLogs,
    help: renderHelpCenter,
    settings: renderSettings,
    team: renderTeam,
    'workflow-editor': renderWorkflowEditor,
  };
  main.innerHTML = (pages[currentPage] || renderDashboard)();
}

// ============================================================
// DASHBOARD PAGE (operational — no marketing hero)
// ============================================================
function renderDashboard() {
  const barData = [65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88, 50];
  const barLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const bars = barData.map((v, i) => `<div class="chart-bar" style="height:${v}%"><span class="bar-value">${v * 12}</span><span class="bar-label">${barLabels[i]}</span></div>`).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Welcome back, Nathan</h1>
        <p class="page-desc">Here's an overview of your projects and team performance.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-sm" onclick="showNewWorkflowModal()">${icons.plus} New Workflow</button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon green">${icons.workflow}</div>
          <span class="stat-change up">${icons.arrowUp} 18%</span>
        </div>
        <div class="stat-value">24</div>
        <div class="stat-label">Active Workflows</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon blue">${icons.agents}</div>
          <span class="stat-change up">${icons.arrowUp} 12%</span>
        </div>
        <div class="stat-value">6</div>
        <div class="stat-label">AI Agents Running</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon yellow">${icons.zap}</div>
          <span class="stat-change up">${icons.arrowUp} 23%</span>
        </div>
        <div class="stat-value">5,421</div>
        <div class="stat-label">Total Executions</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon green">${icons.clock}</div>
          <span class="stat-change up">${icons.arrowUp} 41%</span>
        </div>
        <div class="stat-value">99.4%</div>
        <div class="stat-label">Uptime</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid-2" style="margin-bottom:28px;">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Workflow Executions</div>
            <div class="card-subtitle">Monthly execution volume over the past year</div>
          </div>
          <button class="btn btn-ghost btn-sm">${icons.filter} Filter</button>
        </div>
        <div class="chart-bar-group" style="margin-bottom:30px;">
          ${bars}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Execution Status</div>
            <div class="card-subtitle">Breakdown of results this quarter</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:40px;padding:20px 0;">
          <div class="donut-chart" style="background:conic-gradient(var(--accent) 0% 72%, var(--warning) 72% 85%, var(--info) 85% 92%, var(--border-light) 92% 100%);">
            <div class="donut-center">
              <div class="donut-value">72%</div>
              <div class="donut-label">Success</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--accent);"></div>
              Successful — 72%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--warning);"></div>
              Retried — 13%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--info);"></div>
              Pending — 7%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--border-light);"></div>
              Failed — 8%
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Activity & Quick Actions -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Activity</div>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('logs')">View all</button>
        </div>
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>Lead Scoring Pipeline</strong> executed successfully (99.2%)</div>
            <div class="activity-time">2 minutes ago</div>
          </div>
        </div>
        <div class="activity-item">
          <div class="activity-dot" style="background:var(--info);"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>Support Agent</strong> handled 150 tickets today</div>
            <div class="activity-time">15 min ago</div>
          </div>
        </div>
        <div class="activity-item">
          <div class="activity-dot" style="background:var(--error);"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>Slack Alert System</strong> failed — API rate limited</div>
            <div class="activity-time">2 hours ago</div>
          </div>
        </div>
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>Data Backup Pipeline</strong> completed — 2.4 GB synced</div>
            <div class="activity-time">3 hours ago</div>
          </div>
        </div>
        <div class="activity-item">
          <div class="activity-dot" style="background:var(--accent);"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>Email Outreach Sequence</strong> sent batch of 25 emails</div>
            <div class="activity-time">5 hours ago</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Quick Actions</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;padding-top:8px;">
          <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;gap:12px;" onclick="showNewWorkflowModal()">
            ${icons.plus} Create New Workflow
          </button>
          <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;gap:12px;" onclick="navigateTo('workflow-editor')">
            ${icons.edit} Open Workflow Editor
          </button>
          <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;gap:12px;" onclick="navigateTo('agents')">
            ${icons.agents} Manage AI Agents
          </button>
          <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;gap:12px;" onclick="navigateTo('integrations')">
            ${icons.integrations} Browse Integrations
          </button>
          <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;gap:12px;" onclick="navigateTo('analytics')">
            ${icons.analytics} View Analytics Report
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// WORKFLOWS PAGE
// ============================================================
function renderWorkflows() {
  const workflows = [
    { name: 'Lead Scoring Pipeline', status: 'active', runs: '1,284', lastRun: '2m ago', trigger: 'Webhook', success: '99.2%' },
    { name: 'Email Outreach Sequence', status: 'active', runs: '856', lastRun: '15m ago', trigger: 'Schedule', success: '97.8%' },
    { name: 'Customer Onboarding', status: 'active', runs: '432', lastRun: '1h ago', trigger: 'Event', success: '99.5%' },
    { name: 'Invoice Processing', status: 'paused', runs: '218', lastRun: '3h ago', trigger: 'Schedule', success: '96.1%' },
    { name: 'Slack Alert System', status: 'error', runs: '1,092', lastRun: '5m ago', trigger: 'Webhook', success: '88.4%' },
    { name: 'Data Backup Pipeline', status: 'active', runs: '365', lastRun: '30m ago', trigger: 'Schedule', success: '100%' },
    { name: 'Social Media Scheduler', status: 'draft', runs: '0', lastRun: 'Never', trigger: 'Schedule', success: '—' },
    { name: 'Support Ticket Router', status: 'active', runs: '2,105', lastRun: '1m ago', trigger: 'Webhook', success: '99.8%' },
  ];

  const rows = workflows.map(w => `
    <tr>
      <td style="font-weight:600;">${w.name}</td>
      <td><span class="badge-status ${w.status}"><span class="dot"></span> ${w.status.charAt(0).toUpperCase() + w.status.slice(1)}</span></td>
      <td>${w.trigger}</td>
      <td>${w.runs}</td>
      <td>${w.success}</td>
      <td>${w.lastRun}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflow-editor')">${icons.edit}</button>
          <button class="btn btn-ghost btn-sm" onclick="showToast('Workflow executed!')">${icons.play}</button>
          <button class="btn btn-ghost btn-sm">${icons.moreV}</button>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Workflows</h1>
        <p class="page-desc">Manage and monitor all your automated workflows.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm">${icons.filter} Filter</button>
        <button class="btn btn-primary btn-sm" onclick="showNewWorkflowModal()">${icons.plus} New Workflow</button>
      </div>
    </div>

    <div class="filter-bar">
      <span class="filter-chip active">All (${workflows.length})</span>
      <span class="filter-chip">Active (${workflows.filter(w=>w.status==='active').length})</span>
      <span class="filter-chip">Paused (${workflows.filter(w=>w.status==='paused').length})</span>
      <span class="filter-chip">Error (${workflows.filter(w=>w.status==='error').length})</span>
      <span class="filter-chip">Draft (${workflows.filter(w=>w.status==='draft').length})</span>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Workflow Name</th>
            <th>Status</th>
            <th>Trigger</th>
            <th>Total Runs</th>
            <th>Success Rate</th>
            <th>Last Run</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- Quick Builder Preview -->
    <div style="margin-top:28px;">
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div class="card-title">Workflow Builder</div>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('workflow-editor')">${icons.edit} Open Editor</button>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Design workflows visually with our drag-and-drop editor. Connect triggers, AI nodes, conditions, and actions.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('workflow-editor')">Blank Canvas</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflow-editor')">Lead Scoring Template</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflow-editor')">Email Automation Template</button>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflow-editor')">Support Router Template</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// AI AGENTS PAGE
// ============================================================
function renderAgents() {
  const agents = [
    { name: 'Lead Qualifier', icon: '🎯', role: 'Scores and qualifies incoming leads using custom criteria', tasks: '2,340', accuracy: '96%', status: 'active' },
    { name: 'Content Writer', icon: '✍️', role: 'Generates blog posts, emails, and social media content', tasks: '1,205', accuracy: '94%', status: 'active' },
    { name: 'Data Analyst', icon: '📊', role: 'Analyzes datasets and generates reports with insights', tasks: '856', accuracy: '98%', status: 'active' },
    { name: 'Support Agent', icon: '💬', role: 'Handles customer support tickets and provides solutions', tasks: '4,512', accuracy: '92%', status: 'active' },
    { name: 'Code Reviewer', icon: '🔍', role: 'Reviews pull requests and suggests improvements', tasks: '678', accuracy: '97%', status: 'paused' },
    { name: 'Email Composer', icon: '📧', role: 'Drafts personalized outreach and follow-up emails', tasks: '3,210', accuracy: '95%', status: 'active' },
  ];

  const cards = agents.map(a => `
    <div class="agent-card">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="agent-avatar">${a.icon}</div>
        <span class="badge-status ${a.status}"><span class="dot"></span> ${a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span>
      </div>
      <div class="agent-name">${a.name}</div>
      <div class="agent-role">${a.role}</div>
      <div class="agent-stats">
        <div class="agent-stat-item" style="flex:1;">
          <div class="agent-stat-val">${a.tasks}</div>
          <div class="agent-stat-label">Tasks</div>
        </div>
        <div class="agent-stat-item" style="flex:1;">
          <div class="agent-stat-val">${a.accuracy}</div>
          <div class="agent-stat-label">Accuracy</div>
        </div>
        <div class="agent-stat-item" style="flex:1;">
          <button class="btn btn-ghost btn-sm" onclick="showToast('Agent configuration opened')">${icons.settings}</button>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1>AI Solutions</h1>
        <p class="page-desc">Intelligent agents we build and deploy — AI that actually works.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-sm" onclick="showNewAgentModal()">${icons.plus} Create Agent</button>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon green">${icons.agents}</div>
        </div>
        <div class="stat-value">${agents.length}</div>
        <div class="stat-label">Total Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon blue">${icons.zap}</div>
        </div>
        <div class="stat-value">12,801</div>
        <div class="stat-label">Total Tasks Completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon yellow">${icons.analytics}</div>
        </div>
        <div class="stat-value">95.3%</div>
        <div class="stat-label">Average Accuracy</div>
      </div>
    </div>

    <div class="grid-3">${cards}</div>
  `;
}

// ============================================================
// INTEGRATIONS PAGE
// ============================================================
function renderIntegrations() {
  const integrations = [
    { name: 'Slack', icon: '💬', desc: 'Send messages, create channels, and receive notifications.', connected: true, cat: 'Communication' },
    { name: 'Salesforce', icon: '☁️', desc: 'Sync leads, contacts, and opportunities with your CRM.', connected: true, cat: 'CRM' },
    { name: 'Google Sheets', icon: '📊', desc: 'Read and write spreadsheet data in your workflows.', connected: true, cat: 'Productivity' },
    { name: 'GitHub', icon: '🐙', desc: 'Trigger workflows on PRs, issues, and deployments.', connected: false, cat: 'Developer' },
    { name: 'Stripe', icon: '💳', desc: 'Process payments, manage subscriptions, and invoices.', connected: true, cat: 'Finance' },
    { name: 'HubSpot', icon: '🟠', desc: 'Marketing automation, CRM, and analytics integration.', connected: false, cat: 'Marketing' },
    { name: 'Twilio', icon: '📱', desc: 'Send SMS, make calls, and manage communications.', connected: false, cat: 'Communication' },
    { name: 'PostgreSQL', icon: '🐘', desc: 'Query, insert, and manage your database records.', connected: true, cat: 'Database' },
    { name: 'OpenAI', icon: '🤖', desc: 'Access GPT models for text generation and analysis.', connected: true, cat: 'AI' },
    { name: 'Notion', icon: '📝', desc: 'Sync pages, databases, and documents.', connected: false, cat: 'Productivity' },
    { name: 'Jira', icon: '🔷', desc: 'Create issues, track sprints, and manage projects.', connected: true, cat: 'Developer' },
    { name: 'Zapier', icon: '⚡', desc: 'Connect to 5,000+ apps through Zapier webhooks.', connected: false, cat: 'Automation' },
  ];

  const cards = integrations.map(i => `
    <div class="integration-card">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="int-icon" style="background:var(--bg-tertiary);font-size:24px;">${i.icon}</div>
        <div>
          <div class="int-name">${i.name}</div>
          <span style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;">${i.cat}</span>
        </div>
      </div>
      <div class="int-desc">${i.desc}</div>
      <div class="int-footer">
        ${i.connected
          ? `<span class="badge-status active"><span class="dot"></span> Connected</span>
             <button class="btn btn-ghost btn-sm" onclick="showToast('Integration settings opened')">Configure</button>`
          : `<span class="badge-status draft"><span class="dot"></span> Not connected</span>
             <button class="btn btn-primary btn-sm" onclick="showToast('${i.name} connected!', 'success')">Connect</button>`
        }
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Integrations</h1>
        <p class="page-desc">Connect your tools and services to power your workflows.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm">${icons.search} Browse Marketplace</button>
      </div>
    </div>
    <div class="filter-bar">
      <span class="filter-chip active">All (${integrations.length})</span>
      <span class="filter-chip">Connected (${integrations.filter(i=>i.connected).length})</span>
      <span class="filter-chip">Available (${integrations.filter(i=>!i.connected).length})</span>
    </div>
    <div class="grid-3">${cards}</div>
  `;
}

// ============================================================
// ANALYTICS PAGE
// ============================================================
function renderAnalytics() {
  const weekData = [72, 58, 84, 91, 66, 78, 95];
  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekBars = weekData.map((v, i) => `<div class="chart-bar" style="height:${v}%"><span class="bar-value">${v * 8}</span><span class="bar-label">${weekLabels[i]}</span></div>`).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Analytics</h1>
        <p class="page-desc">Detailed insights into your workflow and agent performance.</p>
      </div>
      <div class="page-actions">
        <select style="width:auto;padding:8px 12px;font-size:12px;">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
          <option>This year</option>
        </select>
        <button class="btn btn-secondary btn-sm">${icons.download} Export Report</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon green">${icons.zap}</div><span class="stat-change up">${icons.arrowUp} 18%</span></div>
        <div class="stat-value">5,421</div>
        <div class="stat-label">Total Executions</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon blue">${icons.clock}</div><span class="stat-change down">${icons.arrowDown} 12%</span></div>
        <div class="stat-value">1.2s</div>
        <div class="stat-label">Avg. Execution Time</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon yellow">${icons.workflow}</div><span class="stat-change up">${icons.arrowUp} 5%</span></div>
        <div class="stat-value">99.4%</div>
        <div class="stat-label">Uptime</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon green">${icons.analytics}</div><span class="stat-change up">${icons.arrowUp} 32%</span></div>
        <div class="stat-value">$24.8k</div>
        <div class="stat-label">Estimated ROI</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:28px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Weekly Execution Volume</div>
        </div>
        <div class="chart-bar-group" style="margin-bottom:30px;">${weekBars}</div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Top Performing Workflows</div>
        </div>
        <div>
          ${['Support Ticket Router', 'Lead Scoring Pipeline', 'Data Sync Pipeline', 'Email Outreach', 'Customer Onboarding'].map((name, i) => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
              <span style="font-size:12px;color:var(--text-tertiary);width:20px;">${i + 1}</span>
              <span style="flex:1;font-size:13px;font-weight:500;">${name}</span>
              <div class="sparkline">
                ${Array.from({length: 8}, () => `<div class="sparkline-bar" style="height:${Math.random() * 100}%;"></div>`).join('')}
              </div>
              <span style="font-size:12px;font-weight:600;color:var(--accent);">${(99 - i * 2)}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">Agent Performance Comparison</div>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Tasks Completed</th>
              <th>Accuracy</th>
              <th>Avg. Response</th>
              <th>Satisfaction</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            ${[
              ['Support Agent', '4,512', '92%', '0.8s', '4.7/5'],
              ['Lead Qualifier', '2,340', '96%', '1.1s', '4.8/5'],
              ['Content Writer', '1,205', '94%', '3.2s', '4.5/5'],
              ['Email Composer', '3,210', '95%', '1.5s', '4.6/5'],
              ['Data Analyst', '856', '98%', '2.4s', '4.9/5'],
            ].map(row => `
              <tr>
                <td style="font-weight:600;">${row[0]}</td>
                <td>${row[1]}</td>
                <td><span style="color:var(--accent);">${row[2]}</span></td>
                <td>${row[3]}</td>
                <td>${row[4]}</td>
                <td>
                  <div class="sparkline">
                    ${Array.from({length: 8}, () => `<div class="sparkline-bar" style="height:${30 + Math.random() * 70}%;"></div>`).join('')}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// LOGS PAGE
// ============================================================
function renderLogs() {
  const logs = [
    { time: '14:32:05.123', level: 'info', msg: 'Workflow "Lead Scoring Pipeline" triggered via webhook POST /api/leads' },
    { time: '14:32:05.456', level: 'info', msg: 'AI Classifier agent invoked — processing lead data (score: 87)' },
    { time: '14:32:06.012', level: 'info', msg: 'Conditional split: score 87 >= 80 — routing to CRM path' },
    { time: '14:32:06.234', level: 'info', msg: 'Salesforce API call: POST /services/data/v58.0/sobjects/Lead' },
    { time: '14:32:06.890', level: 'info', msg: 'Lead created in Salesforce — ID: 00Q5g00000A1B2C' },
    { time: '14:32:07.001', level: 'info', msg: 'Slack notification sent to #sales-leads' },
    { time: '14:32:07.123', level: 'info', msg: 'Workflow "Lead Scoring Pipeline" completed in 2.0s' },
    { time: '14:33:12.456', level: 'warn', msg: 'Workflow "Slack Alert System" — API rate limit approaching (89/100 requests)' },
    { time: '14:33:15.789', level: 'error', msg: 'Workflow "Slack Alert System" — Slack API error 429: Rate limited. Retrying in 30s...' },
    { time: '14:34:01.234', level: 'info', msg: 'Workflow "Email Outreach Sequence" triggered — processing batch of 25 emails' },
    { time: '14:34:02.567', level: 'info', msg: 'AI Content Writer generating personalized email for contact #1842' },
    { time: '14:34:05.890', level: 'info', msg: 'Email sent via SendGrid — recipient: j.smith@company.com' },
    { time: '14:35:00.000', level: 'debug', msg: 'Health check: All 24 active workflows responding normally' },
    { time: '14:35:45.123', level: 'warn', msg: 'Workflow "Invoice Processing" — PDF parsing timeout on invoice #INV-2024-0842' },
    { time: '14:36:01.456', level: 'info', msg: 'Workflow "Data Backup Pipeline" — Backup completed: 2.4 GB transferred to S3' },
    { time: '14:36:30.789', level: 'error', msg: 'Workflow "Slack Alert System" — Retry failed. Marking execution as failed.' },
  ];

  const entries = logs.map(l => `
    <div class="log-entry">
      <span class="log-time">${l.time}</span>
      <span class="log-level ${l.level}">${l.level.toUpperCase()}</span>
      <span class="log-msg">${l.msg}</span>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Execution Logs</h1>
        <p class="page-desc">Real-time log stream from all workflow executions.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm">${icons.filter} Filter</button>
        <button class="btn btn-secondary btn-sm">${icons.download} Export Logs</button>
        <div class="toggle active" onclick="this.classList.toggle('active');showToast(this.classList.contains('active')?'Live mode on':'Live mode off','info')" title="Live mode"></div>
      </div>
    </div>

    <div class="filter-bar">
      <span class="filter-chip active">All Levels</span>
      <span class="filter-chip">Info</span>
      <span class="filter-chip">Warning</span>
      <span class="filter-chip">Error</span>
      <span class="filter-chip">Debug</span>
      <div style="flex:1;"></div>
      <input type="text" placeholder="Search logs..." style="width:260px;padding:6px 12px;font-size:12px;" />
    </div>

    <div class="card" style="padding:0;overflow:hidden;font-size:12px;">
      ${entries}
    </div>
  `;
}

// ============================================================
// HELP CENTER PAGE
// ============================================================
function renderHelpCenter() {
  const faqs = [
    { q: 'How do I create a new workflow?', a: 'Navigate to the Workflows page and click "New Workflow". You can start from a blank canvas or choose from our pre-built templates. The visual editor lets you drag and drop nodes to design your automation.' },
    { q: 'How do AI agents work?', a: 'AI agents are intelligent assistants that perform specific tasks automatically. Each agent is configured with a role, model, and parameters. They process incoming data, make decisions, and execute actions based on your business rules.' },
    { q: 'Can I connect my existing tools?', a: 'Yes! MonkFlow integrates with 50+ popular tools including Slack, Salesforce, Google Sheets, Stripe, and more. Visit the Integrations page to connect your accounts and start building workflows across your tools.' },
    { q: 'How is pricing structured?', a: 'MonkFlow offers custom pricing based on your business needs. We start with a free consultation to understand your requirements, then provide a tailored quote. No hidden fees or per-seat charges.' },
    { q: 'What happens when a workflow fails?', a: 'Failed workflows are automatically retried based on your configuration. You receive real-time notifications via the bell icon and email. Check the Logs page for detailed error information and debugging.' },
    { q: 'How do I invite team members?', a: 'Go to Team Management and click "Invite Member". Enter their email and assign a role (Viewer, Editor, or Admin). They will receive an invitation email to join your workspace.' },
    { q: 'Is my data secure?', a: 'Absolutely. We use end-to-end encryption, SOC 2 compliance, and your data never leaves your designated region. API keys are encrypted at rest, and we support SSO and 2FA for all accounts.' },
    { q: 'Can I export my data?', a: 'Yes, you can export logs, analytics reports, and workflow configurations from their respective pages. We support CSV, JSON, and PDF formats for all exports.' },
  ];

  const topics = [
    { icon: icons.workflow, title: 'Workflows', desc: 'Learn how to create, manage, and monitor automated workflows.', page: 'workflows' },
    { icon: icons.agents, title: 'AI Agents', desc: 'Configure intelligent agents to automate complex tasks.', page: 'agents' },
    { icon: icons.integrations, title: 'Integrations', desc: 'Connect your favorite tools and services.', page: 'integrations' },
    { icon: icons.analytics, title: 'Analytics', desc: 'Understand your performance metrics and ROI.', page: 'analytics' },
    { icon: icons.settings, title: 'Account & Security', desc: 'Manage your profile, API keys, and security settings.', page: 'settings' },
    { icon: icons.users, title: 'Team Management', desc: 'Invite members, manage roles, and permissions.', page: 'team' },
  ];

  return `
    <div class="page-header">
      <div>
        <h1>Help Center</h1>
        <p class="page-desc">Find answers, learn best practices, and get support.</p>
      </div>
    </div>

    <!-- Getting Started -->
    <div class="card" style="margin-bottom:28px;border-color:var(--border-accent);box-shadow:0 0 30px var(--accent-glow);">
      <div class="card-header">
        <div class="card-title">Getting Started</div>
      </div>
      <div class="getting-started-grid">
        <div class="getting-started-step">
          <div class="step-number">1</div>
          <div class="step-content">
            <h4>Connect Your Tools</h4>
            <p>Link your existing software — Slack, Salesforce, Google Sheets, and more.</p>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('integrations')">Browse Integrations</button>
          </div>
        </div>
        <div class="getting-started-step">
          <div class="step-number">2</div>
          <div class="step-content">
            <h4>Create Your First Workflow</h4>
            <p>Use our visual editor to design automated processes with drag-and-drop nodes.</p>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflow-editor')">Open Editor</button>
          </div>
        </div>
        <div class="getting-started-step">
          <div class="step-number">3</div>
          <div class="step-content">
            <h4>Deploy AI Agents</h4>
            <p>Configure intelligent agents to handle repetitive tasks automatically.</p>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('agents')">View Agents</button>
          </div>
        </div>
        <div class="getting-started-step">
          <div class="step-number">4</div>
          <div class="step-content">
            <h4>Monitor & Optimize</h4>
            <p>Track performance, review logs, and continuously improve your automations.</p>
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('analytics')">View Analytics</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Documentation Topics -->
    <div class="card" style="margin-bottom:28px;">
      <div class="card-header">
        <div class="card-title">Documentation Topics</div>
      </div>
      <div class="grid-3" style="margin-top:8px;">
        ${topics.map(t => `
          <div class="help-topic-card" onclick="navigateTo('${t.page}')">
            <div class="help-topic-icon">${t.icon}</div>
            <div class="help-topic-title">${t.title}</div>
            <div class="help-topic-desc">${t.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- FAQ -->
    <div class="card" style="margin-bottom:28px;">
      <div class="card-header">
        <div class="card-title">Frequently Asked Questions</div>
        <div class="topbar-search" style="position:relative;max-width:260px;">
          ${icons.search}
          <input type="text" placeholder="Search FAQs..." oninput="filterFaqs(this.value)" style="font-size:12px;" />
        </div>
      </div>
      <div id="faq-list">
        ${faqs.map((f, i) => `
          <div class="faq-item" data-keywords="${f.q.toLowerCase()} ${f.a.toLowerCase()}">
            <div class="faq-question" onclick="toggleFaq(this)">
              <span>${f.q}</span>
              <span class="faq-chevron">${icons.chevronDown}</span>
            </div>
            <div class="faq-answer">
              <p>${f.a}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Contact Support -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Contact Support</div>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Can't find what you're looking for? Send us a message and we'll get back to you within 24 hours.</p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" placeholder="Your name" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" placeholder="you@company.com" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input type="text" placeholder="What do you need help with?" />
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea rows="4" placeholder="Describe your issue or question..." style="resize:vertical;"></textarea>
      </div>
      <button class="btn btn-primary" onclick="handleContactSubmit()">${icons.send} Send Message</button>
    </div>
  `;
}

function toggleFaq(el) {
  const item = el.parentElement;
  item.classList.toggle('open');
}

function filterFaqs(query) {
  const items = document.querySelectorAll('.faq-item');
  const q = query.toLowerCase();
  items.forEach(item => {
    const keywords = item.dataset.keywords || '';
    item.style.display = keywords.includes(q) ? '' : 'none';
  });
}

async function handleContactSubmit() {
  const inputs = document.querySelectorAll('.help-contact-form input, .help-contact-form textarea');
  const name = inputs[0]?.value?.trim();
  const email = inputs[1]?.value?.trim();
  const subject = inputs[2]?.value?.trim();
  const message = inputs[3]?.value?.trim();
  if (!name || !email || !subject || !message) { showToast('Please fill all fields', 'error'); return; }
  try {
    await api.post('/contact', { name, email, subject, message });
    showToast('Support message sent! We\'ll respond within 24 hours.');
    inputs.forEach(i => i.value = '');
  } catch (err) {
    showToast(err.message || 'Failed to send message', 'error');
  }
}

// ============================================================
// WORKFLOW EDITOR PAGE
// ============================================================
function renderWorkflowEditor() {
  const palette = nodeTypes.map(cat => `
    <div class="palette-category">
      <div class="palette-category-label">${cat.category}</div>
      ${cat.items.map(item => `
        <div class="editor-palette-item" onclick="addNodeToEditor('${item.type}','${item.label}','${item.icon}','${item.color}','${item.desc}')">
          <div class="palette-item-icon ${item.color}">${icons[item.icon]}</div>
          <div>
            <div class="palette-item-name">${item.label}</div>
            <div class="palette-item-desc">${item.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  return `
    <div class="workflow-editor-container">
      <!-- Palette Sidebar -->
      <div class="editor-sidebar">
        <div class="editor-sidebar-header">
          <div style="font-weight:600;font-size:13px;">Node Palette</div>
        </div>
        <div class="editor-sidebar-search">
          <input type="text" placeholder="Search nodes..." style="font-size:12px;padding:8px 12px;" oninput="filterPalette(this.value)" />
        </div>
        <div class="editor-palette" id="editor-palette">
          ${palette}
        </div>
      </div>

      <!-- Main Editor Area -->
      <div class="editor-main">
        <!-- Toolbar -->
        <div class="editor-toolbar">
          <div class="editor-toolbar-left">
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflows')">${icons.arrowLeft} Back</button>
            <div class="editor-toolbar-divider"></div>
            <input type="text" value="${editorState.workflowName}" class="editor-name-input" onchange="editorState.workflowName=this.value" />
          </div>
          <div class="editor-toolbar-right">
            <button class="btn btn-ghost btn-sm" onclick="editorZoom(-10)">${icons.zoomOut}</button>
            <span class="editor-zoom-label" id="editor-zoom-label">${editorState.zoom}%</span>
            <button class="btn btn-ghost btn-sm" onclick="editorZoom(10)">${icons.zoomIn}</button>
            <div class="editor-toolbar-divider"></div>
            <button class="btn btn-secondary btn-sm" onclick="showToast('Workflow saved!','success')">${icons.save} Save</button>
            <button class="btn btn-primary btn-sm" onclick="showToast('Workflow deployed!','success')">${icons.zap} Deploy</button>
          </div>
        </div>

        <!-- Canvas -->
        <div class="editor-canvas" id="editor-canvas">
          <svg class="editor-connections-svg" id="editor-svg"></svg>
          <div id="editor-nodes"></div>
        </div>
      </div>
    </div>
  `;
}

function initWorkflowEditor() {
  renderEditorNodes();
  renderEditorConnections();

  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown', (e) => {
    if (e.target.closest('.workflow-node')) {
      const nodeEl = e.target.closest('.workflow-node');
      const nodeId = parseInt(nodeEl.dataset.id);
      const node = editorState.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Check if clicking on connector
      if (e.target.classList.contains('node-connector')) {
        if (e.target.classList.contains('out')) {
          editorState.connecting = true;
          editorState.connectFromId = nodeId;
          canvas.style.cursor = 'crosshair';
          return;
        } else if (e.target.classList.contains('in') && editorState.connecting) {
          // Complete connection
          const fromId = editorState.connectFromId;
          if (fromId !== nodeId && !editorState.connections.find(c => c.from === fromId && c.to === nodeId)) {
            editorState.connections.push({ from: fromId, to: nodeId });
            renderEditorConnections();
          }
          editorState.connecting = false;
          editorState.connectFromId = null;
          canvas.style.cursor = '';
          return;
        }
      }

      // Start dragging
      editorState.draggingNodeId = nodeId;
      editorState.selectedNodeId = nodeId;
      const rect = canvas.getBoundingClientRect();
      editorState.dragOffsetX = e.clientX - rect.left - node.x;
      editorState.dragOffsetY = e.clientY - rect.top - node.y;
      renderEditorNodes();
    } else {
      // Clicked on canvas — deselect and cancel connecting
      editorState.selectedNodeId = null;
      editorState.connecting = false;
      editorState.connectFromId = null;
      canvas.style.cursor = '';
      renderEditorNodes();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (editorState.draggingNodeId) {
      const rect = canvas.getBoundingClientRect();
      const node = editorState.nodes.find(n => n.id === editorState.draggingNodeId);
      if (node) {
        node.x = Math.max(0, e.clientX - rect.left - editorState.dragOffsetX);
        node.y = Math.max(0, e.clientY - rect.top - editorState.dragOffsetY);
        renderEditorNodes();
        renderEditorConnections();
      }
    }
  });

  canvas.addEventListener('mouseup', () => {
    editorState.draggingNodeId = null;
  });

  // Delete key
  document.addEventListener('keydown', editorKeyHandler);
}

function editorKeyHandler(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (editorState.selectedNodeId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      const id = editorState.selectedNodeId;
      editorState.nodes = editorState.nodes.filter(n => n.id !== id);
      editorState.connections = editorState.connections.filter(c => c.from !== id && c.to !== id);
      editorState.selectedNodeId = null;
      renderEditorNodes();
      renderEditorConnections();
      showToast('Node deleted', 'info');
    }
  }
}

function renderEditorNodes() {
  const container = document.getElementById('editor-nodes');
  if (!container) return;

  const colorMap = {
    green: 'rgba(0,255,136,0.15)',
    blue: 'rgba(59,130,246,0.15)',
    purple: 'rgba(147,51,234,0.15)',
    orange: 'rgba(249,115,22,0.15)',
    yellow: 'rgba(251,191,36,0.15)',
  };
  const textColorMap = {
    green: 'var(--accent)',
    blue: '#3b82f6',
    purple: '#a855f7',
    orange: '#f97316',
    yellow: '#fbbf24',
  };

  container.innerHTML = editorState.nodes.map(n => `
    <div class="workflow-node ${n.id === editorState.selectedNodeId ? 'selected' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px;">
      <div class="node-header">
        <div class="node-icon" style="background:${colorMap[n.color] || colorMap.green};color:${textColorMap[n.color] || textColorMap.green};">${icons[n.icon] || icons.zap}</div>
        <div>
          <div class="node-title">${n.label}</div>
          <div class="node-desc">${n.desc}</div>
        </div>
      </div>
      <div class="node-connector in" title="Connect input"></div>
      <div class="node-connector out" title="Connect output"></div>
    </div>
  `).join('');
}

function renderEditorConnections() {
  const svg = document.getElementById('editor-svg');
  if (!svg) return;

  let paths = '';
  editorState.connections.forEach(conn => {
    const fromNode = editorState.nodes.find(n => n.id === conn.from);
    const toNode = editorState.nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) return;

    const nodeWidth = 200;
    const nodeHeight = 60;

    const x1 = fromNode.x + nodeWidth;
    const y1 = fromNode.y + nodeHeight / 2;
    const x2 = toNode.x;
    const y2 = toNode.y + nodeHeight / 2;

    const cx = (x1 + x2) / 2;

    paths += `<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" stroke="var(--accent)" stroke-width="2" fill="none" stroke-opacity="0.6"/>`;
  });

  svg.innerHTML = paths;
}

function addNodeToEditor(type, label, icon, color, desc) {
  const id = editorState.nextId++;
  editorState.nodes.push({
    id, type, label, desc, icon, color,
    x: 200 + Math.random() * 300,
    y: 100 + Math.random() * 200,
  });
  renderEditorNodes();
  showToast(`${label} node added`, 'info');
}

function editorZoom(delta) {
  editorState.zoom = Math.min(150, Math.max(50, editorState.zoom + delta));
  const label = document.getElementById('editor-zoom-label');
  if (label) label.textContent = editorState.zoom + '%';
  const canvas = document.getElementById('editor-canvas');
  if (canvas) {
    canvas.style.transform = `scale(${editorState.zoom / 100})`;
    canvas.style.transformOrigin = 'top left';
  }
}

function filterPalette(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.editor-palette-item').forEach(item => {
    const name = item.querySelector('.palette-item-name').textContent.toLowerCase();
    const desc = item.querySelector('.palette-item-desc').textContent.toLowerCase();
    item.style.display = (name.includes(q) || desc.includes(q)) ? '' : 'none';
  });
}

// ============================================================
// SETTINGS PAGE
// ============================================================
function renderSettings() {
  return `
    <div class="page-header">
      <div>
        <h1>Settings</h1>
        <p class="page-desc">Manage your account, security, and preferences.</p>
      </div>
    </div>

    <div class="tabs">
      <div class="tab active" onclick="this.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');">General</div>
      <div class="tab" onclick="this.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');">Security</div>
      <div class="tab" onclick="this.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');">Notifications</div>
      <div class="tab" onclick="this.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));this.classList.add('active');">API Keys</div>
    </div>

    <!-- Profile -->
    <div class="settings-section">
      <h3>Profile Information</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input type="text" value="Nathan" />
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input type="text" value="Linder" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" value="nathan@monkflow.io" />
      </div>
      <div class="form-group">
        <label class="form-label">Company</label>
        <input type="text" value="MonkFlow Inc." />
      </div>
      <div class="form-group">
        <label class="form-label">Timezone</label>
        <select>
          <option>America/Los_Angeles (PST)</option>
          <option>America/New_York (EST)</option>
          <option>Europe/London (GMT)</option>
          <option>Asia/Tokyo (JST)</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="showToast('Profile saved!')">Save Changes</button>
    </div>

    <!-- Notifications -->
    <div class="settings-section">
      <h3>Notification Preferences</h3>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Workflow Failures</h4>
          <p>Get notified when a workflow execution fails</p>
        </div>
        <div class="toggle active" onclick="this.classList.toggle('active')"></div>
      </div>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Usage Alerts</h4>
          <p>Alerts when approaching plan limits</p>
        </div>
        <div class="toggle active" onclick="this.classList.toggle('active')"></div>
      </div>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Weekly Report</h4>
          <p>Receive a weekly summary of workflow performance</p>
        </div>
        <div class="toggle active" onclick="this.classList.toggle('active')"></div>
      </div>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Product Updates</h4>
          <p>News about new features and improvements</p>
        </div>
        <div class="toggle" onclick="this.classList.toggle('active')"></div>
      </div>
    </div>

    <!-- API Keys -->
    <div class="settings-section">
      <h3>API Keys</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Manage your API keys for programmatic access to Monk Flow.</p>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Name</th><th>Key</th><th>Created</th><th>Last Used</th><th></th></tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:600;">Production API Key</td>
              <td><code style="font-size:12px;background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;">mk_prod_****...x8f2</code></td>
              <td>Jan 15, 2026</td>
              <td>2 hours ago</td>
              <td><button class="btn btn-ghost btn-sm">${icons.copy}</button></td>
            </tr>
            <tr>
              <td style="font-weight:600;">Development Key</td>
              <td><code style="font-size:12px;background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;">mk_dev_****...k3m1</code></td>
              <td>Feb 22, 2026</td>
              <td>1 day ago</td>
              <td><button class="btn btn-ghost btn-sm">${icons.copy}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-secondary" style="margin-top:16px;" onclick="showToast('New API key generated', 'success')">${icons.plus} Generate New Key</button>
    </div>

    <!-- Danger Zone -->
    <div class="settings-section" style="border-color:rgba(239,68,68,0.2);">
      <h3 style="color:var(--error);">Danger Zone</h3>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Delete Account</h4>
          <p>Permanently delete your account and all data. This cannot be undone.</p>
        </div>
        <button class="btn btn-danger btn-sm">Delete Account</button>
      </div>
    </div>
  `;
}

// ============================================================
// TEAM PAGE
// ============================================================
function renderTeam() {
  const members = [
    { name: 'Nathan Linder', email: 'nathan@monkflow.io', role: 'Owner', status: 'active', initials: 'NL' },
    { name: 'Sarah Chen', email: 'sarah@monkflow.io', role: 'Admin', status: 'active', initials: 'SC' },
    { name: 'Marcus Johnson', email: 'marcus@monkflow.io', role: 'Editor', status: 'active', initials: 'MJ' },
    { name: 'Priya Patel', email: 'priya@monkflow.io', role: 'Editor', status: 'active', initials: 'PP' },
    { name: 'Alex Kim', email: 'alex@monkflow.io', role: 'Viewer', status: 'active', initials: 'AK' },
    { name: 'Jordan Rivera', email: 'jordan@monkflow.io', role: 'Editor', status: 'active', initials: 'JR' },
    { name: 'Emily Zhao', email: 'emily@monkflow.io', role: 'Viewer', status: 'paused', initials: 'EZ' },
    { name: "Chris O'Brien", email: 'chris@monkflow.io', role: 'Editor', status: 'active', initials: 'CO' },
  ];

  return `
    <div class="page-header">
      <div>
        <h1>Team Management</h1>
        <p class="page-desc">Invite and manage team members and their permissions.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-sm" onclick="showInviteModal()">${icons.plus} Invite Member</button>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-value">${members.length}</div>
        <div class="stat-label">Team Members</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">15</div>
        <div class="stat-label">Seats Available</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">2</div>
        <div class="stat-label">Pending Invites</div>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <table>
        <thead>
          <tr><th>Member</th><th>Role</th><th>Status</th><th>Last Active</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--green-700));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--black);">${m.initials}</div>
                  <div>
                    <div style="font-weight:600;">${m.name}</div>
                    <div style="font-size:11px;color:var(--text-tertiary);">${m.email}</div>
                  </div>
                </div>
              </td>
              <td>
                <select style="width:auto;padding:4px 8px;font-size:12px;background:var(--bg-tertiary);">
                  <option ${m.role==='Owner'?'selected':''}>Owner</option>
                  <option ${m.role==='Admin'?'selected':''}>Admin</option>
                  <option ${m.role==='Editor'?'selected':''}>Editor</option>
                  <option ${m.role==='Viewer'?'selected':''}>Viewer</option>
                </select>
              </td>
              <td><span class="badge-status ${m.status}"><span class="dot"></span> ${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
              <td style="font-size:12px;color:var(--text-tertiary);">Today</td>
              <td>
                <button class="btn btn-ghost btn-sm">${icons.moreV}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
// MODALS
// ============================================================
function showNewWorkflowModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Create New Workflow</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div class="form-group">
      <label class="form-label">Workflow Name</label>
      <input type="text" placeholder="e.g., Lead Scoring Pipeline" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea rows="3" placeholder="What does this workflow do?" style="resize:vertical;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Trigger Type</label>
      <select>
        <option>Webhook</option>
        <option>Schedule (Cron)</option>
        <option>Event-based</option>
        <option>Manual</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Start from</label>
      <div class="form-row" style="gap:10px;">
        <button class="btn btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal();navigateTo('workflow-editor')">Blank Canvas</button>
        <button class="btn btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal();navigateTo('workflows')">Browse Templates</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="closeModal();navigateTo('workflow-editor');showToast('Workflow created! Opening editor...')">Create Workflow</button>
    </div>
  `);
}

function showNewAgentModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Create AI Agent</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div class="form-group">
      <label class="form-label">Agent Name</label>
      <input type="text" placeholder="e.g., Customer Support Agent" />
    </div>
    <div class="form-group">
      <label class="form-label">Role Description</label>
      <textarea rows="3" placeholder="Describe what this agent should do..." style="resize:vertical;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">AI Model</label>
      <select>
        <option>Claude Opus 4</option>
        <option>Claude Sonnet 4</option>
        <option>GPT-4o</option>
        <option>Custom Model</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Temperature</label>
      <input type="range" min="0" max="100" value="30" style="background:transparent;border:none;padding:0;" />
    </div>
    <div class="form-group">
      <label class="form-label">Max Tokens</label>
      <input type="number" value="4096" />
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="closeModal();showToast('AI Agent created!')">Create Agent</button>
    </div>
  `);
}

function showInviteModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Invite Team Member</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div class="form-group">
      <label class="form-label">Email Address</label>
      <input type="email" placeholder="colleague@company.com" />
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select>
        <option>Viewer — Can view workflows and logs</option>
        <option>Editor — Can create and edit workflows</option>
        <option>Admin — Full access except billing</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Personal Message (optional)</label>
      <textarea rows="2" placeholder="Add a note to the invite..." style="resize:vertical;"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="closeModal();showToast('Invitation sent!')">Send Invite</button>
    </div>
  `);
}
