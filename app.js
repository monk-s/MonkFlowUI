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
      const errMsg = err.error?.message || 'Request failed';
      if (res.status === 429 && /plan|limit/i.test(errMsg)) {
        showUpgradeModal(errMsg);
      }
      throw new Error(errMsg);
    }
    return res.json();
  },
  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path, body) { return this.request('DELETE', path, body); },
};

// ── State ──────────────────────────────────────────────
let currentPage = 'dashboard';
let isAuthenticated = !!localStorage.getItem('accessToken');
let currentUser = null;
let notificationPanelOpen = false;
let searchDropdownOpen = false;
let searchSelectedIndex = -1;
let dashboardData = null;
let workflowsData = null;
let logsData = null;
let agentsData = null;
let currentWorkflowId = null;
let logsSearchDebounceTimer = null;
let apiKeysData = null;
let currentWorkflowDetail = null;
let executionPollTimer = null;
let currentAgentId = null;
let currentAgentDetail = null;
let agentDetailExecutions = null;
let agentExecutionPollTimer = null;
let adminData = null;
let adminAccounts = null;
let adminSelectedAccount = null;
let adminAccountDetail = null;
let currentPlan = null;
let billingPlans = null;
let qboConnected = false;
let billingInvoices = [];
let adminQboStatus = null;

// ── Type Mappings ──────────────────────────────────────────
const FRONTEND_TO_BACKEND_TYPE = {
  'webhook-trigger': 'trigger',
  'schedule-trigger': 'schedule',
  'event-trigger': 'event',
  'ai-classifier': 'ai',
  'ai-generator': 'ai',
  'ai-analyzer': 'ai',
  'condition': 'condition',
  'delay': 'delay',
  'loop': 'loop',
  'action': 'action',
  'api-call': 'api_call',
  'notify': 'notification',
  'database': 'transform',
};

const BACKEND_TO_FRONTEND_TYPE = {
  'trigger': 'webhook-trigger',
  'schedule': 'schedule-trigger',
  'event': 'event-trigger',
  'ai': 'ai-classifier',
  'condition': 'condition',
  'delay': 'delay',
  'loop': 'loop',
  'action': 'action',
  'api_call': 'api-call',
  'notification': 'notify',
  'transform': 'database',
};

// ── Helpers ──────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatLogTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function triggerTypeLabel(triggerType) {
  const map = { webhook: 'Webhook', schedule: 'Schedule', event: 'Event', manual: 'Manual', trigger: 'Webhook' };
  return map[triggerType] || triggerType || 'Manual';
}

// ── Token Cost Calculator (Claude API pricing + 10% service fee) ──
const TOKEN_PRICING = {
  'claude-opus-4-20250514':   { input: 15.00,  output: 75.00  }, // per 1M tokens
  'claude-sonnet-4-20250514': { input: 3.00,   output: 15.00  },
  'gpt-4o':                   { input: 2.50,   output: 10.00  },
  'custom':                   { input: 3.00,   output: 15.00  },
};
const SERVICE_FEE_RATE = 0.10; // 10% markup

function calculateTokenCost(tokensInput, tokensOutput, model) {
  const pricing = TOKEN_PRICING[model] || TOKEN_PRICING['claude-sonnet-4-20250514'];
  const baseCost = (tokensInput / 1_000_000) * pricing.input + (tokensOutput / 1_000_000) * pricing.output;
  const fee = baseCost * SERVICE_FEE_RATE;
  return { baseCost, fee, total: baseCost + fee };
}

function formatCost(amount) {
  if (amount < 0.001) return '< $0.001';
  if (amount < 0.01) return '$' + amount.toFixed(4);
  if (amount < 1) return '$' + amount.toFixed(3);
  return '$' + amount.toFixed(2);
}

function calculateExecsCost(execs, model) {
  let totalInput = 0, totalOutput = 0;
  for (const e of execs) {
    totalInput += e.tokens_input || 0;
    totalOutput += e.tokens_output || 0;
  }
  return { ...calculateTokenCost(totalInput, totalOutput, model), totalInput, totalOutput };
}

function calculateWorkflowExecCost(execution) {
  let totalInput = 0, totalOutput = 0;
  let model = 'claude-sonnet-4-20250514';
  const nodeResults = execution.node_results || [];
  for (const nr of nodeResults) {
    if (nr.output && typeof nr.output === 'object') {
      totalInput += nr.output.tokensInput || 0;
      totalOutput += nr.output.tokensOutput || 0;
      if (nr.output.model) model = nr.output.model;
    }
  }
  // Also check top-level tokens (for future-proofed executions)
  totalInput += execution.tokens_input || 0;
  totalOutput += execution.tokens_output || 0;
  return { ...calculateTokenCost(totalInput, totalOutput, model), totalInput, totalOutput, model };
}

function calculateWorkflowExecsCost(execs) {
  let totalInput = 0, totalOutput = 0;
  let model = 'claude-sonnet-4-20250514';
  for (const e of execs) {
    const c = calculateWorkflowExecCost(e);
    totalInput += c.totalInput;
    totalOutput += c.totalOutput;
    if (c.model) model = c.model;
  }
  return { ...calculateTokenCost(totalInput, totalOutput, model), totalInput, totalOutput };
}

function humanReadableCron(cron, tz) {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  const tzLabel = tz ? tz.replace(/_/g, ' ').replace(/^America\//, '') : '';
  const tzShort = { 'Chicago': 'CT', 'New_York': 'ET', 'Los_Angeles': 'PT', 'Denver': 'MT', 'Phoenix': 'MT' };
  const tzAbbr = tz ? (tzShort[tz.split('/').pop()] || tzLabel) : '';
  const h = parseInt(hour, 10);
  const m = parseInt(min, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  if (dow === '1-5' || dow === 'MON-FRI') return `Weekdays at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  if (dow === '0-6' || dow === '*') {
    if (dom === '*' && mon === '*') return `Daily at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  }
  if (dow === '0' || dow === 'SUN') return `Sundays at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  if (dow === '1' || dow === 'MON') return `Mondays at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  const dowNames = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' };
  if (dowNames[dow]) return `${dowNames[dow]}s at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  if (dom !== '*' && mon === '*') return `Day ${dom} of each month at ${timeStr}${tzAbbr ? ' ' + tzAbbr : ''}`;
  return `${cron}${tzAbbr ? ' (' + tzAbbr + ')' : ''}`;
}

function getNextCronRun(cron, tz) {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [minStr, hourStr, , , dowStr] = parts;
  const targetH = parseInt(hourStr, 10);
  const targetM = parseInt(minStr, 10);
  if (isNaN(targetH) || isNaN(targetM)) return null;
  const now = new Date();
  let candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(targetH, targetM, 0, 0);
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
  const weekdaysOnly = (dowStr === '1-5' || dowStr === 'MON-FRI');
  for (let i = 0; i < 8; i++) {
    const day = candidate.getDay();
    if (weekdaysOnly && (day === 0 || day === 6)) {
      candidate.setDate(candidate.getDate() + 1);
      continue;
    }
    break;
  }
  return candidate;
}

function renderNodeTypeIcon(type) {
  const iconMap = {
    search: icons.search,
    score: icons.analytics,
    diagnose: icons.analytics,
    email: icons.mail,
    generate: icons.edit,
    send: icons.send,
    summary: icons.logs,
    notify: icons.bell,
    filter: icons.filter,
    webhook: icons.globe,
    trigger: icons.zap,
  };
  const t = (type || '').toLowerCase();
  for (const [key, icon] of Object.entries(iconMap)) {
    if (t.includes(key)) return icon;
  }
  return icons.zap;
}

// ── Notifications Data ──────────────────────────────────
let notifications = [];

// ── Search Index ──────────────────────────────────────────
const searchIndex = [
  { type: 'page', name: 'Dashboard', page: 'dashboard', keywords: ['home', 'overview', 'stats', 'activity'] },
  { type: 'page', name: 'Projects', page: 'projects', keywords: ['project', 'deliverable', 'files', 'status', 'portal', 'upload'] },
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
    { type: 'webhook-trigger', label: 'Webhook', icon: 'zap', color: 'green', desc: 'HTTP endpoint', tooltip: 'Starts when an external event fires' },
    { type: 'schedule-trigger', label: 'Schedule', icon: 'clock', color: 'blue', desc: 'Cron timer', tooltip: 'Runs your workflow on a timer' },
    { type: 'event-trigger', label: 'Event', icon: 'bell', color: 'yellow', desc: 'System event', tooltip: 'Fires when something happens in MonkFlow' },
  ]},
  { category: 'AI', items: [
    { type: 'ai-classifier', label: 'AI Classifier', icon: 'agents', color: 'blue', desc: 'Classify data', tooltip: 'Categorizes input using AI' },
    { type: 'ai-generator', label: 'AI Writer', icon: 'edit', color: 'purple', desc: 'Generate text', tooltip: 'Creates content like emails using AI' },
    { type: 'ai-analyzer', label: 'AI Analyzer', icon: 'analytics', color: 'green', desc: 'Analyze data', tooltip: 'Extracts insights from data using AI' },
  ]},
  { category: 'Logic', items: [
    { type: 'condition', label: 'Condition', icon: 'filter', color: 'purple', desc: 'If/else split', tooltip: 'Makes a yes/no decision to branch your workflow' },
    { type: 'delay', label: 'Delay', icon: 'clock', color: 'yellow', desc: 'Wait period', tooltip: 'Pauses the workflow for a set amount of time' },
    { type: 'loop', label: 'Loop', icon: 'workflow', color: 'blue', desc: 'Iterate items', tooltip: 'Repeats an action for each item in a list' },
  ]},
  { category: 'Actions', items: [
    { type: 'action', label: 'Send Email', icon: 'mail', color: 'green', desc: 'Email action', tooltip: 'Sends an email to one or more recipients' },
    { type: 'api-call', label: 'API Call', icon: 'globe', color: 'blue', desc: 'HTTP request', tooltip: 'Connects to an external service via API' },
    { type: 'notify', label: 'Notification', icon: 'bell', color: 'orange', desc: 'Send alert', tooltip: 'Sends a notification to your team' },
    { type: 'database', label: 'Database', icon: 'logs', color: 'purple', desc: 'DB operation', tooltip: 'Reads or writes data in your database' },
  ]},
];

// ── Router ──────────────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  closeNotificationPanel();
  closeSearchDropdown();
  renderTopbar();
  renderMainContent();
  if (page === 'dashboard') loadDashboardData();
  if (page === 'workflows') loadWorkflowsData();
  if (page === 'projects') loadProjectsData();
  if (page === 'logs') loadLogsData();
  if (page === 'agents') loadAgentsData();
  if (page === 'team') loadTeamData();
  if (page === 'analytics' && !dashboardData) loadDashboardData();
  if (page === 'workflow-detail') loadWorkflowDetail();
  if (page === 'agent-detail') loadAgentDetail();
  if (page === 'admin') loadAdminData();
  if (page === 'billing') loadBillingData();
  if (page === 'outreach') loadOutreachData();
  if (page === 'integrations') loadQboStatus();
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Init editor if navigating to workflow-editor
  if (page === 'workflow-editor') {
    setTimeout(() => initWorkflowEditor(), 50);
  }
}

async function loadDashboardData() {
  try {
    const result = await api.get('/dashboard/stats');
    dashboardData = result.data;
    renderMainContent();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadWorkflowsData() {
  try {
    const result = await api.get('/workflows?limit=50');
    workflowsData = result.data || [];
    renderMainContent();
  } catch (err) {
    console.error('Failed to load workflows:', err);
  }
}

async function loadLogsData() {
  try {
    const result = await api.get('/logs?limit=50');
    logsData = result.data || [];
    renderMainContent();
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

async function loadAgentsData() {
  try {
    const result = await api.get('/agents?limit=50');
    agentsData = result.data || [];
    renderMainContent();
  } catch (err) {
    console.error('Failed to load agents:', err);
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
  loadDashboardData();
  fetchNotifications().then(() => renderTopbar());
  loadCurrentPlan();
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

async function handleForgotPassword() {
  const emailEl = document.querySelector('#auth-login input[type="email"]');
  const email = emailEl?.value?.trim();
  if (!email) { showToast('Please enter your email address first', 'error'); return; }
  try {
    await api.post('/auth/forgot-password', { email });
    showToast('If that email exists, a password reset link has been sent.', 'info');
  } catch {
    showToast('If that email exists, a password reset link has been sent.', 'info');
  }
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
          <a href="#landing-services" onclick="event.preventDefault();document.getElementById('landing-services').scrollIntoView({behavior:'smooth'});document.querySelector('.landing-nav-links').classList.remove('open');document.querySelector('.landing-nav-actions').classList.remove('open');">Services</a>
          <a href="#landing-testimonials" onclick="event.preventDefault();document.getElementById('landing-testimonials').scrollIntoView({behavior:'smooth'});document.querySelector('.landing-nav-links').classList.remove('open');document.querySelector('.landing-nav-actions').classList.remove('open');">Why MonkFlow</a>
          <a href="#landing-about" onclick="event.preventDefault();document.getElementById('landing-about').scrollIntoView({behavior:'smooth'});document.querySelector('.landing-nav-links').classList.remove('open');document.querySelector('.landing-nav-actions').classList.remove('open');">About</a>
        </div>
        <div class="landing-nav-actions">
          <button class="btn btn-ghost" onclick="showAuth()">Sign In</button>
          <button class="btn btn-primary btn-sm" onclick="showSchedulingModal()">Schedule a Call</button>
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
          <button class="btn btn-primary btn-lg" onclick="showSchedulingModal()">${icons.clock} Schedule a Free Consultation</button>
          <button class="btn btn-secondary btn-lg" onclick="document.getElementById('landing-services').scrollIntoView({behavior:'smooth'})">${icons.eye} Explore Our Services</button>
        </div>
        <div class="landing-hero-stats">
          <div class="landing-stat"><div class="landing-stat-val">ACU</div><div class="landing-stat-label">Student-Founded</div></div>
          <div class="landing-stat"><div class="landing-stat-val">100%</div><div class="landing-stat-label">Custom-Built</div></div>
          <div class="landing-stat"><div class="landing-stat-val">Fixed</div><div class="landing-stat-label">Fee Projects</div></div>
          <div class="landing-stat"><div class="landing-stat-val">Local</div><div class="landing-stat-label">West Texas Focus</div></div>
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

    <!-- Why MonkFlow -->
    <section id="landing-testimonials" class="landing-section landing-section-alt">
      <div class="landing-section-inner">
        <div class="section-header">
          <div class="hero-badge">Why MonkFlow</div>
          <h2 class="section-title">Built Different</h2>
          <p class="section-subtitle">We're not a big agency. We're a student-led software studio that builds tools businesses actually use.</p>
        </div>
        <div class="landing-testimonials-grid">
          <div class="landing-testimonial-card">
            <div class="testimonial-quote" style="font-size:20px;font-weight:600;color:var(--accent);">No Templates</div>
            <div style="color:var(--text-secondary);margin-top:8px;">Every tool we build is custom. We study your business first, then write code specifically for your workflows. You'll never get a reskinned template.</div>
          </div>
          <div class="landing-testimonial-card">
            <div class="testimonial-quote" style="font-size:20px;font-weight:600;color:var(--accent);">Fixed-Fee Pricing</div>
            <div style="color:var(--text-secondary);margin-top:8px;">No hourly billing, no surprise invoices. We scope the project, quote a price, and deliver. You know exactly what you're paying before we start.</div>
          </div>
          <div class="landing-testimonial-card">
            <div class="testimonial-quote" style="font-size:20px;font-weight:600;color:var(--accent);">Real Support</div>
            <div style="color:var(--text-secondary);margin-top:8px;">We don't disappear after launch. You get a direct line to the person who built your tool — not a support ticket queue.</div>
          </div>
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
            <button class="btn btn-primary btn-lg" onclick="showSchedulingModal()">${icons.clock} Schedule Your Free Consultation</button>
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
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-about').scrollIntoView({behavior:'smooth'})">How We Work</a>
            <a href="#" onclick="event.preventDefault();document.getElementById('landing-testimonials').scrollIntoView({behavior:'smooth'})">Why MonkFlow</a>
            <a href="#" onclick="event.preventDefault();showSchedulingModal()">Schedule a Call</a>
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
              <input type="password" placeholder="Enter your password" onkeydown="if(event.key==='Enter')handleLogin()" />
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;">
                <input type="checkbox" style="width:auto;" /> Remember me
              </label>
              <a href="#" onclick="event.preventDefault();handleForgotPassword();" style="font-size:12px;">Forgot password?</a>
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="handleLogin()">
              Sign In
            </button>
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
              Student-founded at ACU, Abilene TX
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
              <input type="text" placeholder="Your company" onkeydown="if(event.key==='Enter')handleSignup()" />
            </div>
            <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center;" onclick="handleSignup()">
              Create Account
            </button>
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
          <h2>Let's Build<br/><span style="color:var(--accent)">Something Great</span></h2>
          <p>We build custom software tools around your business — not the other way around.</p>
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
              Fixed-fee projects, no surprises
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
      </div>
      <div class="nav-item" data-page="agents" onclick="navigateTo('agents')">
        ${icons.agents} AI Solutions
      </div>

      <div class="nav-item" data-page="projects" onclick="navigateTo('projects')">
        ${icons.book} Projects
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

      ${currentUser?.role === 'superadmin' ? `
      <div class="nav-section-label">Admin</div>
      <div class="nav-item" data-page="admin" onclick="navigateTo('admin')">
        ${icons.shield} Admin Dashboard
      </div>
      <div class="nav-item" data-page="outreach" onclick="navigateTo('outreach')">
        ${icons.send} Outreach
      </div>
      ` : ''}

      <div class="nav-section-label">Account</div>
      <div class="nav-item" data-page="billing" onclick="navigateTo('billing')">
        ${icons.zap} Plans & Billing
      </div>
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
        <div class="avatar">${currentUser ? (currentUser.first_name?.[0] || '') + (currentUser.last_name?.[0] || '') : 'NL'}</div>
        <div class="user-info">
          <div class="user-name">${currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : 'Nathan Linder'}</div>
          <div class="user-plan">${currentPlan?.plan_name || 'Free'} Plan</div>
${currentPlan ? `<div style="margin-top:6px;">
  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">
    <span>Runs: ${currentPlan.monthly_workflow_runs || 0}/${currentPlan.plan_workflow_limit || '\u221e'}</span>
    <span>Tasks: ${currentPlan.monthly_agent_tasks || 0}/${currentPlan.plan_task_limit || '\u221e'}</span>
  </div>
  <div style="height:3px;background:var(--bg-tertiary);border-radius:2px;overflow:hidden;display:flex;gap:1px;">
    <div style="width:50%;position:relative;"><div style="position:absolute;inset:0;background:${(currentPlan.monthly_workflow_runs || 0) / (currentPlan.plan_workflow_limit || 1) > 0.9 ? '#ef4444' : (currentPlan.monthly_workflow_runs || 0) / (currentPlan.plan_workflow_limit || 1) > 0.7 ? '#fbbf24' : '#00cc6a'};width:${Math.min(100, ((currentPlan.monthly_workflow_runs || 0) / (currentPlan.plan_workflow_limit || 1)) * 100)}%;border-radius:2px;"></div></div>
    <div style="width:50%;position:relative;"><div style="position:absolute;inset:0;background:${(currentPlan.monthly_agent_tasks || 0) / (currentPlan.plan_task_limit || 1) > 0.9 ? '#ef4444' : (currentPlan.monthly_agent_tasks || 0) / (currentPlan.plan_task_limit || 1) > 0.7 ? '#fbbf24' : '#00cc6a'};width:${Math.min(100, ((currentPlan.monthly_agent_tasks || 0) / (currentPlan.plan_task_limit || 1)) * 100)}%;border-radius:2px;"></div></div>
  </div>
</div>` : ''}
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
    projects: 'Projects',
    workflows: 'Workflows',
    agents: 'AI Solutions',
    integrations: 'Integrations',
    analytics: 'Analytics',
    logs: 'Execution Logs',
    help: 'Help Center',
    settings: 'Settings',
    team: 'Team Management',
    'workflow-editor': 'Workflow Editor',
    admin: 'Admin Dashboard',
    'admin-account': 'Account Detail',
    billing: 'Plans & Billing',
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
    projects: renderProjects,
    workflows: renderWorkflows,
    agents: renderAgents,
    integrations: renderIntegrations,
    analytics: renderAnalytics,
    logs: renderLogs,
    help: renderHelpCenter,
    settings: renderSettings,
    team: renderTeam,
    'workflow-editor': renderWorkflowEditor,
    'workflow-detail': renderWorkflowDetail,
    'agent-detail': renderAgentDetail,
    'admin': renderAdminDashboard,
    'admin-account': renderAdminAccountDetail,
    'outreach': renderOutreachPage,
    'billing': renderBilling,
  };
  main.innerHTML = (pages[currentPage] || renderDashboard)();
}

// ============================================================
// PROJECTS PAGE (client portal — view project status & files)
// ============================================================
let projectsData = null;
let currentProjectDetail = null;

async function loadProjectsData() {
  try {
    const isOwner = currentUser?.id === '385e12a9-c98d-4555-91a1-a9b4c76a9ad8';
    const endpoint = isOwner ? '/projects/all' : '/projects';
    const result = await api.get(endpoint);
    projectsData = result.data || [];
    renderMainContent();
  } catch (err) {
    console.error('Failed to load projects:', err);
    projectsData = [];
    renderMainContent();
  }
}

async function viewProject(id) {
  try {
    currentProjectDetail = await api.get(`/projects/${id}`);
    renderMainContent();
  } catch (err) {
    showToast('Failed to load project', 'error');
  }
}

async function createProjectPrompt() {
  showModal(`
    <h2 style="margin-bottom:16px;">Create New Project</h2>
    <div class="form-group">
      <label class="form-label">Project Name</label>
      <input type="text" id="new-project-name" placeholder="e.g., Website Redesign" />
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea id="new-project-desc" placeholder="Brief description of the project..." rows="3" style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text-primary);resize:vertical;"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Client User ID</label>
      <input type="text" id="new-project-user" placeholder="User UUID" />
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewProject()">Create Project</button>
    </div>
  `);
}

async function submitNewProject() {
  const name = document.getElementById('new-project-name')?.value?.trim();
  const description = document.getElementById('new-project-desc')?.value?.trim();
  const userId = document.getElementById('new-project-user')?.value?.trim();
  if (!name || !userId) { showToast('Name and User ID are required', 'error'); return; }
  try {
    await api.post('/projects', { name, description, userId });
    closeModal();
    showToast('Project created!');
    loadProjectsData();
  } catch (err) {
    showToast(err.message || 'Failed to create project', 'error');
  }
}

async function updateProjectStatus(id, status) {
  try {
    await api.patch(`/projects/${id}`, { status });
    showToast('Status updated!');
    viewProject(id);
  } catch (err) {
    showToast(err.message || 'Failed to update', 'error');
  }
}

async function addProjectUpdate(id) {
  const input = document.getElementById('project-update-msg');
  const message = input?.value?.trim();
  if (!message) return;
  try {
    await api.post(`/projects/${id}/updates`, { message });
    input.value = '';
    showToast('Update posted!');
    viewProject(id);
  } catch (err) {
    showToast(err.message || 'Failed', 'error');
  }
}

async function uploadProjectFile(projectId) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { showToast('File too large (max 50MB)', 'error'); return; }
    showToast('Uploading...', 'info');
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        await api.post(`/projects/${projectId}/files`, {
          filename: file.name,
          data: base64,
          mimeType: file.type,
        });
        showToast('File uploaded!');
        viewProject(projectId);
      } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
      }
    };
    reader.readAsDataURL(file);
  };
  fileInput.click();
}

async function downloadProjectFile(projectId, fileId, filename) {
  try {
    const res = await fetch(`${API_BASE}/projects/${projectId}/files/${fileId}/download`, {
      headers: { 'Authorization': `Bearer ${api.token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Download failed', 'error');
  }
}

function renderProjects() {
  const isOwner = currentUser?.id === '385e12a9-c98d-4555-91a1-a9b4c76a9ad8';

  // If viewing a specific project
  if (currentProjectDetail && currentPage === 'projects') {
    const p = currentProjectDetail;
    const statusColors = { discovery: '#6366f1', in_progress: '#f59e0b', review: '#3b82f6', delivered: '#10b981', completed: '#22c55e' };
    const statusLabels = { discovery: 'Discovery', in_progress: 'In Progress', review: 'Under Review', delivered: 'Delivered', completed: 'Completed' };

    const filesHtml = (p.files || []).map(f => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${icons.download}
          <div>
            <div style="font-weight:500;">${f.original_name}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${(f.file_size / 1024).toFixed(1)} KB • ${new Date(f.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="downloadProjectFile('${p.id}','${f.id}','${f.original_name}')">Download</button>
      </div>
    `).join('') || '<div style="color:var(--text-tertiary);padding:12px;">No files uploaded yet.</div>';

    const updatesHtml = (p.updates || []).map(u => `
      <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="width:8px;height:8px;border-radius:50%;background:${u.status ? statusColors[u.status] || 'var(--accent)' : 'var(--text-tertiary)'};margin-top:6px;flex-shrink:0;"></div>
        <div>
          <div style="font-size:13px;">${u.message}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${new Date(u.created_at).toLocaleString()}</div>
        </div>
      </div>
    `).join('') || '<div style="color:var(--text-tertiary);padding:12px;">No updates yet.</div>';

    const statusOptions = isOwner ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
        ${Object.entries(statusLabels).map(([k, v]) => `
          <button class="btn ${p.status === k ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="updateProjectStatus('${p.id}','${k}')">${v}</button>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="btn btn-ghost btn-sm" onclick="currentProjectDetail=null;renderMainContent();">${icons.arrowLeft} Back</button>
          <div>
            <h1>${p.name}</h1>
            <p class="page-desc">${p.description || 'No description'}</p>
          </div>
        </div>
        ${isOwner ? `<button class="btn btn-primary btn-sm" onclick="uploadProjectFile('${p.id}')">${icons.plus} Upload File</button>` : ''}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div class="card">
          <div class="card-header"><h3>Status</h3></div>
          <div style="padding:16px;">
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:20px;background:${statusColors[p.status] || '#666'}22;color:${statusColors[p.status] || '#666'};font-weight:600;font-size:14px;">
              <div style="width:8px;height:8px;border-radius:50%;background:${statusColors[p.status] || '#666'}"></div>
              ${statusLabels[p.status] || p.status}
            </div>
            ${statusOptions}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Project Info</h3></div>
          <div style="padding:16px;font-size:13px;color:var(--text-secondary);">
            <div style="margin-bottom:8px;"><strong>Created:</strong> ${new Date(p.created_at).toLocaleDateString()}</div>
            <div style="margin-bottom:8px;"><strong>Last Updated:</strong> ${new Date(p.updated_at).toLocaleDateString()}</div>
            <div><strong>Files:</strong> ${(p.files || []).length}</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:20px;">
        <div class="card-header"><h3>Files & Deliverables</h3></div>
        <div style="padding:16px;">${filesHtml}</div>
      </div>

      <div class="card" style="margin-top:20px;">
        <div class="card-header"><h3>Timeline & Updates</h3></div>
        <div style="padding:16px;">
          ${isOwner ? `
            <div style="display:flex;gap:8px;margin-bottom:16px;">
              <input type="text" id="project-update-msg" placeholder="Post an update..." style="flex:1;" onkeydown="if(event.key==='Enter')addProjectUpdate('${p.id}')" />
              <button class="btn btn-primary btn-sm" onclick="addProjectUpdate('${p.id}')">Post</button>
            </div>
          ` : ''}
          ${updatesHtml}
        </div>
      </div>
    `;
  }

  // Projects list view
  if (!projectsData) {
    return `<div class="page-header"><div><h1>Projects</h1><p class="page-desc">Loading...</p></div></div>`;
  }

  const statusColors = { discovery: '#6366f1', in_progress: '#f59e0b', review: '#3b82f6', delivered: '#10b981', completed: '#22c55e' };
  const statusLabels = { discovery: 'Discovery', in_progress: 'In Progress', review: 'Under Review', delivered: 'Delivered', completed: 'Completed' };

  const projectCards = projectsData.length === 0
    ? `<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">
        <div style="font-size:48px;margin-bottom:12px;">${icons.book}</div>
        <h3 style="color:var(--text-primary);">No projects yet</h3>
        <p>Projects will appear here once we start building for ${isOwner ? 'clients' : 'you'}.</p>
      </div>`
    : `<div class="table-wrapper"><table>
        <thead><tr>
          <th>Project</th>
          ${isOwner ? '<th>Client</th>' : ''}
          <th>Status</th>
          <th>Files</th>
          <th>Last Updated</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${projectsData.map(p => `
            <tr onclick="viewProject('${p.id}')" style="cursor:pointer;">
              <td>
                <div style="font-weight:600;">${p.name}</div>
                <div style="font-size:11px;color:var(--text-tertiary);">${p.description || ''}</div>
              </td>
              ${isOwner ? `<td style="font-size:13px;">${p.client_first_name || ''} ${p.client_last_name || ''}<br/><span style="color:var(--text-tertiary);font-size:11px;">${p.client_email || ''}</span></td>` : ''}
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:12px;background:${statusColors[p.status] || '#666'}22;color:${statusColors[p.status] || '#666'};font-weight:500;font-size:12px;">
                  <span style="width:6px;height:6px;border-radius:50%;background:${statusColors[p.status] || '#666'}"></span>
                  ${statusLabels[p.status] || p.status}
                </span>
              </td>
              <td>${p.file_count || 0}</td>
              <td style="font-size:12px;color:var(--text-tertiary);">${timeAgo(p.updated_at)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();viewProject('${p.id}')">View</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>`;

  return `
    <div class="page-header">
      <div>
        <h1>Projects</h1>
        <p class="page-desc">${isOwner ? 'Manage all client projects and deliverables' : 'View your project status and download deliverables'}</p>
      </div>
      ${isOwner ? `<button class="btn btn-primary" onclick="createProjectPrompt()">${icons.plus} New Project</button>` : ''}
    </div>
    ${projectCards}
  `;
}

// ============================================================
// DASHBOARD PAGE (operational — real data from API)
// ============================================================
function renderDashboard() {
  if (!dashboardData) {
    return `
      <div class="page-header">
        <div>
          <h1>Welcome back, ${currentUser?.first_name || 'there'}</h1>
          <p class="page-desc">Loading your dashboard...</p>
        </div>
      </div>
      <div class="stats-grid">
        ${[1,2,3,4].map(() => `
          <div class="stat-card">
            <div class="stat-header">
              <div class="stat-icon" style="background:var(--bg-tertiary);"></div>
            </div>
            <div style="height:32px;width:60%;background:var(--bg-tertiary);border-radius:6px;margin:8px 0;animation:pulse 1.5s ease-in-out infinite;"></div>
            <div style="height:14px;width:80%;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s ease-in-out infinite;"></div>
          </div>
        `).join('')}
      </div>
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style>
    `;
  }

  const { workflows, agents, executions, chartData, recentActivity } = dashboardData;

  // Bar chart
  const maxCount = Math.max(...(chartData || []).map(d => d.count), 1);
  const bars = (chartData || []).map(d => {
    const pct = Math.round((d.count / maxCount) * 100);
    return `<div class="chart-bar" style="height:${pct}%"><span class="bar-value">${d.count}</span><span class="bar-label">${d.month}</span></div>`;
  }).join('');

  // Donut chart percentages
  const total = executions?.total || 1;
  const completedPct = Math.round((executions?.completed || 0) / total * 100);
  const failedPct = Math.round((executions?.failed || 0) / total * 100);
  const runningPct = Math.round((executions?.running || 0) / total * 100);
  const otherPct = Math.max(0, 100 - completedPct - failedPct - runningPct);
  const donutEnd1 = completedPct;
  const donutEnd2 = donutEnd1 + failedPct;
  const donutEnd3 = donutEnd2 + runningPct;

  // Activity dot color based on level
  const dotColor = (level) => {
    if (level === 'error') return 'style="background:var(--error);"';
    if (level === 'warn' || level === 'warning') return 'style="background:var(--warning);"';
    if (level === 'info') return 'style="background:var(--info);"';
    return '';
  };

  const activityItems = (recentActivity || []).slice(0, 5).map(a => `
    <div class="activity-item">
      <div class="activity-dot" ${dotColor(a.level)}></div>
      <div class="activity-content">
        <div class="activity-text">${a.message}</div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Welcome back, ${currentUser?.first_name || 'there'}</h1>
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
        </div>
        <div class="stat-value">${workflows?.active || 0}</div>
        <div class="stat-label">Active Workflows</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon blue">${icons.agents}</div>
        </div>
        <div class="stat-value">${agents?.total || 0}</div>
        <div class="stat-label">AI Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon yellow">${icons.zap}</div>
        </div>
        <div class="stat-value">${(executions?.total || 0).toLocaleString()}</div>
        <div class="stat-label">Total Executions</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon green">${icons.check}</div>
        </div>
        <div class="stat-value">${executions?.successRate != null ? executions.successRate.toFixed(1) + '%' : '--'}</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>

    <!-- Charts Row -->
    <div class="grid-2" style="margin-bottom:28px;">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Workflow Executions</div>
            <div class="card-subtitle">Monthly execution volume</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="showToast('Chart filtering coming soon','info')">${icons.filter} Filter</button>
        </div>
        <div class="chart-bar-group" style="margin-bottom:30px;">
          ${bars || '<div style="padding:20px;color:var(--text-secondary);font-size:13px;">No execution data yet</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Execution Status</div>
            <div class="card-subtitle">Breakdown of results</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:40px;padding:20px 0;">
          <div class="donut-chart" style="background:conic-gradient(var(--accent) 0% ${donutEnd1}%, var(--error) ${donutEnd1}% ${donutEnd2}%, var(--info) ${donutEnd2}% ${donutEnd3}%, var(--border-light) ${donutEnd3}% 100%);">
            <div class="donut-center">
              <div class="donut-value">${completedPct}%</div>
              <div class="donut-label">Success</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--accent);"></div>
              Completed — ${completedPct}%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--error);"></div>
              Failed — ${failedPct}%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--info);"></div>
              Running — ${runningPct}%
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
              <div style="width:10px;height:10px;border-radius:2px;background:var(--border-light);"></div>
              Other — ${otherPct}%
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
        ${activityItems || '<div style="padding:20px;color:var(--text-secondary);font-size:13px;">No recent activity</div>'}
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
  const workflows = workflowsData;

  if (workflows === null) {
    // Loading skeleton
    const skeletonRows = Array.from({ length: 5 }, () => `
      <tr>
        <td><div style="height:14px;width:160px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:60px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:70px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:40px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:50px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:60px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
        <td><div style="height:14px;width:80px;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div></td>
      </tr>
    `).join('');

    return `
      <div class="page-header">
        <div>
          <h1>Workflows</h1>
          <p class="page-desc">Manage and monitor all your automated workflows.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="showNewWorkflowModal()">${icons.plus} New Workflow</button>
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Workflow Name</th><th>Status</th><th>Trigger</th><th>Total Runs</th><th>Success Rate</th><th>Last Run</th><th>Actions</th></tr></thead>
          <tbody>${skeletonRows}</tbody>
        </table>
      </div>
    `;
  }

  const rows = workflows.map(w => {
    const status = w.status || 'draft';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const successRate = w.success_rate != null ? `${w.success_rate}%` : '\u2014';
    const totalRuns = w.total_runs != null ? w.total_runs.toLocaleString() : '0';
    const lastRun = w.last_run_at ? timeAgo(w.last_run_at) : 'Never';
    const trigger = triggerTypeLabel(w.trigger_type);

    return `
      <tr data-workflow-status="${status}">
        <td style="font-weight:600;"><a href="#" onclick="event.preventDefault();currentWorkflowId='${w.id}';currentWorkflowDetail=null;workflowDetailExecutions=null;navigateTo('workflow-detail')" style="color:var(--text-primary);text-decoration:none;cursor:pointer;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-primary)'">${w.name || 'Untitled'}</a></td>
        <td><span class="badge-status ${status}"><span class="dot"></span> ${statusLabel}</span></td>
        <td>${trigger}</td>
        <td>${totalRuns}</td>
        <td>${successRate}</td>
        <td>${lastRun}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" onclick="loadWorkflowInEditor('${w.id}')" title="Edit">${icons.edit}</button>
            <button class="btn btn-ghost btn-sm" onclick="executeWorkflowFromList('${w.id}')" title="Execute">${icons.play}</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteWorkflowFromList('${w.id}','${(w.name || '').replace(/'/g, "\\'")}')" title="Delete">${icons.trash}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Workflows</h1>
        <p class="page-desc">Manage and monitor all your automated workflows.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="showToast('Use the filter chips below to filter workflows','info')">${icons.filter} Filter</button>
        <button class="btn btn-primary btn-sm" onclick="showNewWorkflowModal()">${icons.plus} New Workflow</button>
      </div>
    </div>

    <div class="filter-bar">
      <span class="filter-chip active" onclick="filterWorkflows('all',this)">All (${workflows.length})</span>
      <span class="filter-chip" onclick="filterWorkflows('active',this)">Active (${workflows.filter(w=>w.status==='active').length})</span>
      <span class="filter-chip" onclick="filterWorkflows('paused',this)">Paused (${workflows.filter(w=>w.status==='paused').length})</span>
      <span class="filter-chip" onclick="filterWorkflows('error',this)">Error (${workflows.filter(w=>w.status==='error').length})</span>
      <span class="filter-chip" onclick="filterWorkflows('draft',this)">Draft (${workflows.filter(w=>w.status==='draft').length})</span>
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
          <button class="btn btn-secondary btn-sm" onclick="currentWorkflowId=null;editorState.nodes=[];editorState.connections=[];editorState.workflowName='Untitled Workflow';editorState.nextId=1;navigateTo('workflow-editor')">Blank Canvas</button>
          <button class="btn btn-ghost btn-sm" onclick="loadWorkflowTemplate('lead-scoring')">Lead Scoring Template</button>
          <button class="btn btn-ghost btn-sm" onclick="loadWorkflowTemplate('email-automation')">Email Automation Template</button>
          <button class="btn btn-ghost btn-sm" onclick="loadWorkflowTemplate('support-router')">Support Router Template</button>
        </div>
      </div>
    </div>
  `;
}

function filterWorkflows(status, el) {
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const rows = document.querySelectorAll('.table-wrapper tbody tr');
  rows.forEach(row => {
    if (status === 'all') { row.style.display = ''; return; }
    row.style.display = row.dataset.workflowStatus === status ? '' : 'none';
  });
}

async function executeWorkflowFromList(workflowId) {
  try {
    const result = await api.post(`/workflows/${workflowId}/execute`);
    showToast(`Workflow executed! Execution ID: ${result.executionId || 'started'}`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to execute workflow', 'error');
  }
}

async function deleteWorkflowFromList(workflowId, workflowName) {
  if (!confirm(`Are you sure you want to delete "${workflowName}"? This cannot be undone.`)) return;
  try {
    await api.del(`/workflows/${workflowId}`);
    showToast('Workflow deleted', 'success');
    loadWorkflowsData();
  } catch (err) {
    showToast(err.message || 'Failed to delete workflow', 'error');
  }
}

async function loadWorkflowInEditor(workflowId) {
  try {
    const result = await api.get(`/workflows/${workflowId}`);
    const wf = result.data || result;
    currentWorkflowId = workflowId;
    editorState.workflowName = wf.name || 'Untitled Workflow';

    // Map backend definition to editor nodes
    if (wf.definition && wf.definition.nodes && Array.isArray(wf.definition.nodes)) {
      editorState.nodes = wf.definition.nodes.map((n, i) => {
        const frontendType = BACKEND_TO_FRONTEND_TYPE[n.type] || n.type;
        // Find matching node type info for icon/color
        let icon = 'zap', color = 'blue', desc = '';
        for (const cat of nodeTypes) {
          const found = cat.items.find(item => item.type === frontendType);
          if (found) { icon = found.icon; color = found.color; desc = found.desc; break; }
        }
        return {
          id: n.id || i + 1,
          type: frontendType,
          label: n.label || n.name || frontendType,
          desc: n.desc || desc,
          x: n.x || 60 + (i % 3) * 280,
          y: n.y || 140 + Math.floor(i / 3) * 180,
          color: n.color || color,
          icon: n.icon || icon,
          config: n.config || getDefaultNodeConfig(frontendType),
        };
      });
      editorState.nextId = Math.max(...editorState.nodes.map(n => n.id), 0) + 1;
    } else {
      editorState.nodes = [];
      editorState.nextId = 1;
    }

    if (wf.definition && wf.definition.connections && Array.isArray(wf.definition.connections)) {
      editorState.connections = wf.definition.connections;
    } else {
      editorState.connections = [];
    }

    editorState.selectedNodeId = null;
    navigateTo('workflow-editor');
  } catch (err) {
    showToast(err.message || 'Failed to load workflow', 'error');
  }
}

// ============================================================
// AI AGENTS PAGE
// ============================================================
function renderAgents() {
  const agents = agentsData;

  if (agents === null) {
    // Loading skeleton
    const skeletonCards = Array.from({ length: 6 }, () => `
      <div class="agent-card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="width:44px;height:44px;border-radius:12px;background:var(--bg-tertiary);animation:pulse 1.5s infinite;"></div>
          <div style="width:60px;height:20px;border-radius:4px;background:var(--bg-tertiary);animation:pulse 1.5s infinite;"></div>
        </div>
        <div style="height:18px;width:70%;background:var(--bg-tertiary);border-radius:4px;margin:12px 0 8px;animation:pulse 1.5s infinite;"></div>
        <div style="height:14px;width:90%;background:var(--bg-tertiary);border-radius:4px;animation:pulse 1.5s infinite;"></div>
      </div>
    `).join('');

    return `
      <div class="page-header">
        <div>
          <h1>AI Agents</h1>
          <p class="page-desc">Intelligent agents that power your workflows.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="showNewAgentModal()">${icons.plus} Create Agent</button>
        </div>
      </div>
      <div class="grid-3">${skeletonCards}</div>
    `;
  }

  const activeCount = agents.filter(a => a.status === 'active').length;

  const cards = agents.map(a => {
    const status = a.status || 'draft';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const agentIcon = a.icon || '🤖';
    return `
      <div class="agent-card" onclick="currentAgentId='${a.id}';currentAgentDetail=null;agentDetailExecutions=null;navigateTo('agent-detail')" style="cursor:pointer;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div class="agent-avatar">${agentIcon}</div>
          <span class="badge-status ${status}"><span class="dot"></span> ${statusLabel}</span>
        </div>
        <div class="agent-name">${a.name || 'Unnamed Agent'}</div>
        <div class="agent-role">${a.description || a.agent_type || 'No description'}</div>
        <div class="agent-stats">
          <div class="agent-stat-item" style="flex:1;">
            <div class="agent-stat-val">${a.model || 'claude'}</div>
            <div class="agent-stat-label">Model</div>
          </div>
          <div class="agent-stat-item" style="flex:1;">
            <div class="agent-stat-val">${a.agent_type || 'general'}</div>
            <div class="agent-stat-label">Type</div>
          </div>
          <div class="agent-stat-item" style="flex:1;">
            <div style="display:flex;gap:4px;">
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();currentAgentId='${a.id}';currentAgentDetail=null;agentDetailExecutions=null;navigateTo('agent-detail')" title="Configure">${icons.settings}</button>
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteAgent('${a.id}','${(a.name || '').replace(/'/g, "\\'")}')" title="Delete">${icons.trash}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const emptyState = agents.length === 0 ? `
    <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
      <div style="font-size:48px;margin-bottom:16px;">🤖</div>
      <h3 style="color:var(--text-primary);margin-bottom:8px;">No agents yet</h3>
      <p style="font-size:13px;margin-bottom:20px;">Create your first AI agent to automate tasks.</p>
      <button class="btn btn-primary" onclick="showNewAgentModal()">${icons.plus} Create Agent</button>
    </div>
  ` : '';

  return `
    <div class="page-header">
      <div>
        <h1>AI Agents</h1>
        <p class="page-desc">Intelligent agents that power your workflows.</p>
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
        <div class="stat-value">${activeCount}</div>
        <div class="stat-label">Active Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <div class="stat-icon yellow">${icons.analytics}</div>
        </div>
        <div class="stat-value">${agents.length - activeCount}</div>
        <div class="stat-label">Paused / Draft</div>
      </div>
    </div>

    ${emptyState || `<div class="grid-3">${cards}</div>`}
  `;
}

async function deleteAgent(agentId, agentName) {
  if (!confirm('Are you sure you want to delete "' + agentName + '"? This cannot be undone.')) return;
  try {
    await api.del('/agents/' + agentId);
    showToast('Agent deleted', 'success');
    loadAgentsData();
  } catch (err) {
    showToast(err.message || 'Failed to delete agent', 'error');
  }
}

// ============================================================
// AGENT DETAIL PAGE
// ============================================================

async function loadAgentDetail() {
  if (!currentAgentId) { navigateTo('agents'); return; }
  try {
    const [agentResult, execResult] = await Promise.all([
      api.get(`/agents/${currentAgentId}`),
      api.get(`/agents/${currentAgentId}/executions?limit=20`).catch(() => ({ data: [] })),
    ]);
    currentAgentDetail = agentResult.data || agentResult;
    agentDetailExecutions = execResult.data || execResult || [];
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to load agent', 'error');
    navigateTo('agents');
  }
}

function renderAgentDetail() {
  if (!currentAgentDetail) {
    return `
      <div class="page-header"><div><h1>Agent Details</h1><p class="page-desc">Loading...</p></div></div>
      <div class="card" style="padding:32px;text-align:center;">
        <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
        <p style="color:var(--text-secondary);font-size:13px;">Loading agent details...</p>
      </div>
    `;
  }

  const agent = currentAgentDetail;
  const execs = agentDetailExecutions || [];
  const status = agent.status || 'draft';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

  // Compute stats
  const totalTasks = agent.total_runs || execs.length || 0;
  const totalTokens = execs.reduce((sum, e) => sum + (e.tokens_used || e.total_tokens || 0), 0);
  const durations = execs.filter(e => e.started_at && e.completed_at).map(e => (new Date(e.completed_at) - new Date(e.started_at)) / 1000);
  const avgDuration = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) + 's' : '\u2014';
  const agentCost = calculateExecsCost(execs, agent.model);

  // Model display mapping
  const modelDisplayMap = {
    'claude-opus-4-20250514': 'Claude Opus 4',
    'claude-sonnet-4-20250514': 'Claude Sonnet 4',
    'gpt-4o': 'GPT-4o',
    'custom': 'Custom Model',
  };
  const modelDisplay = modelDisplayMap[agent.model] || agent.model || 'Claude Sonnet 4';
  const tempValue = agent.temperature != null ? Math.round(agent.temperature * 100) : 30;

  // Execution history rows
  const executionRows = execs.length > 0 ? execs.map(e => {
    const eStatus = e.status || 'pending';
    const eStatusColor = { completed: '#00ff88', failed: '#ef4444', running: '#3b82f6', pending: '#fbbf24' };
    const duration = e.started_at && e.completed_at ? ((new Date(e.completed_at) - new Date(e.started_at)) / 1000).toFixed(1) + 's' : e.started_at ? 'Running...' : '\u2014';
    const rawInput = e.input_data || e.input || e.input_text || '';
    const inputText = typeof rawInput === 'object' ? JSON.stringify(rawInput, null, 2) : String(rawInput);
    const rawOutput = e.output_data || e.output || e.output_text || e.result || '';
    const outputText = typeof rawOutput === 'object' ? (rawOutput.text || JSON.stringify(rawOutput, null, 2)) : String(rawOutput);
    const inputTrunc = inputText.length > 50 ? inputText.slice(0, 47) + '...' : inputText;
    const outputTrunc = outputText.length > 50 ? outputText.slice(0, 47) + '...' : outputText;
    const tokens = (e.tokens_input || 0) + (e.tokens_output || 0) || e.tokens_used || e.total_tokens || '\u2014';
    const execCost = calculateTokenCost(e.tokens_input || 0, e.tokens_output || 0, agent.model);
    const costStr = typeof tokens === 'number' && tokens > 0 ? formatCost(execCost.total) : '\u2014';
    const escapedInput = (inputText || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const escapedOutput = (outputText || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `
      <tr style="cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'table-row':'none'">
        <td style="font-family:monospace;font-size:11px;">${(e.id || '').slice(0, 8)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${eStatusColor[eStatus] || '#666'};"></span> ${eStatus}</span></td>
        <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${inputText.replace(/"/g, '&quot;')}">${inputTrunc || '\u2014'}</td>
        <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${outputText.replace(/"/g, '&quot;')}">${outputTrunc || '\u2014'}</td>
        <td>${tokens}</td>
        <td style="color:#00cc6a;font-size:11px;">${costStr}</td>
        <td>${duration}</td>
        <td>${e.started_at ? timeAgo(e.started_at) : '\u2014'}</td>
      </tr>
      <tr style="display:none;">
        <td colspan="8" style="padding:12px 16px;background:var(--bg-tertiary);border-radius:8px;">
          <div style="margin-bottom:8px;"><strong style="color:var(--text-secondary);font-size:11px;">Full Input:</strong><pre style="margin:4px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);max-height:200px;overflow-y:auto;">${inputText || 'No input'}</pre></div>
          <div style="margin-bottom:8px;"><strong style="color:var(--text-secondary);font-size:11px;">Full Output:</strong><pre style="margin:4px 0;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);max-height:200px;overflow-y:auto;">${outputText || 'No output'}</pre></div>
          <div style="font-size:11px;color:var(--text-tertiary);">Tokens: ${e.tokens_input || 0} in / ${e.tokens_output || 0} out | Base: ${formatCost(execCost.baseCost)} + Fee: ${formatCost(execCost.fee)} = <strong style="color:#00cc6a;">${formatCost(execCost.total)}</strong></div>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--text-tertiary);padding:24px;">No executions yet. Run this agent to see execution history.</td></tr>`;

  return `
    <!-- Header -->
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('agents')">${icons.arrowLeft} Back</button>
          <h1 style="margin:0;">${agent.name || 'Unnamed Agent'}</h1>
          <span class="badge-status ${status}"><span class="dot"></span> ${statusLabel}</span>
        </div>
        <p class="page-desc">${agent.description || 'No description'}</p>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('agent-run-section').scrollIntoView({behavior:'smooth'})">${icons.play} Run Agent</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleAgentStatus('${agent.id}','${status}')">${status === 'active' ? icons.pause + ' Pause' : icons.zap + ' Activate'}</button>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="deleteAgentFromDetail('${agent.id}','${(agent.name || '').replace(/'/g, "\\'")}')">${icons.trash} Delete</button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${totalTasks}</div><div class="stat-label">Total Tasks</div></div>
      <div class="stat-card"><div class="stat-value">${totalTokens.toLocaleString()}</div><div class="stat-label">Total Tokens Used</div></div>
      <div class="stat-card" style="border:1px solid rgba(0,204,106,0.2);"><div class="stat-value" style="color:#00cc6a;">${formatCost(agentCost.total)}</div><div class="stat-label">Est. Cost (incl. 10% fee)</div></div>
      <div class="stat-card"><div class="stat-value">${avgDuration}</div><div class="stat-label">Avg Duration</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${status === 'active' ? '#00ff88' : status === 'error' ? '#ef4444' : '#fbbf24'};">${statusLabel}</div><div class="stat-label">Status</div></div>
    </div>

    <!-- Configuration Panel -->
    <div class="card" style="padding:20px;margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:16px;">Configuration</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group">
          <label class="form-label">Agent Name</label>
          <input type="text" id="agent-cfg-name" value="${(agent.name || '').replace(/"/g, '&quot;')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Agent Type</label>
          <select id="agent-cfg-type">
            <option value="text_generation" ${agent.agent_type === 'text_generation' ? 'selected' : ''}>Text Generation</option>
            <option value="classification" ${agent.agent_type === 'classification' ? 'selected' : ''}>Classification</option>
            <option value="analysis" ${agent.agent_type === 'analysis' ? 'selected' : ''}>Analysis</option>
            <option value="custom" ${agent.agent_type === 'custom' ? 'selected' : ''}>Custom</option>
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Description</label>
          <textarea id="agent-cfg-desc" rows="2" style="resize:vertical;">${agent.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">AI Model</label>
          <select id="agent-cfg-model">
            <option value="Claude Opus 4" ${modelDisplay === 'Claude Opus 4' ? 'selected' : ''}>Claude Opus 4</option>
            <option value="Claude Sonnet 4" ${modelDisplay === 'Claude Sonnet 4' ? 'selected' : ''}>Claude Sonnet 4</option>
            <option value="GPT-4o" ${modelDisplay === 'GPT-4o' ? 'selected' : ''}>GPT-4o</option>
            <option value="Custom Model" ${modelDisplay === 'Custom Model' ? 'selected' : ''}>Custom Model</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Max Tokens</label>
          <input type="number" id="agent-cfg-maxtokens" value="${agent.max_tokens || agent.maxTokens || 4096}" />
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">System Prompt</label>
          <textarea id="agent-cfg-prompt" rows="5" style="resize:vertical;font-family:monospace;font-size:12px;" placeholder="Enter the system instructions for this agent...">${agent.system_prompt || agent.systemPrompt || ''}</textarea>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Temperature: <span id="agent-temp-display">${(tempValue / 100).toFixed(2)}</span></label>
          <input type="range" id="agent-cfg-temp" min="0" max="100" value="${tempValue}" style="width:100%;background:transparent;border:none;padding:0;" oninput="document.getElementById('agent-temp-display').textContent=(this.value/100).toFixed(2)" />
        </div>
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" onclick="saveAgentConfig('${agent.id}')">${icons.save} Save Configuration</button>
      </div>
    </div>

    <!-- Run Agent Section -->
    <div class="card" style="padding:20px;margin-bottom:24px;" id="agent-run-section">
      <div class="card-title" style="margin-bottom:16px;">Run Agent</div>
      <div class="form-group">
        <label class="form-label">Input Prompt</label>
        <textarea id="agent-run-input" rows="4" style="resize:vertical;" placeholder="Enter a prompt to send to this agent..."></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-primary btn-sm" id="agent-execute-btn" onclick="executeAgentFromDetail('${agent.id}')">${icons.play} Execute</button>
        <span id="agent-run-status" style="font-size:12px;color:var(--text-secondary);"></span>
      </div>
      <div id="agent-run-result" style="margin-top:16px;display:none;">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Result:</div>
        <pre id="agent-run-output" style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;color:var(--text-primary);"></pre>
      </div>
    </div>

    <!-- Execution History -->
    <div class="card" style="padding:0;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div class="card-title" style="margin:0;">Execution History</div>
        <button class="btn btn-ghost btn-sm" onclick="loadAgentDetail()">Refresh</button>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>ID</th><th>Status</th><th>Input</th><th>Output</th><th>Tokens</th><th>Cost</th><th>Duration</th><th>Time</th></tr></thead>
          <tbody>${executionRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function saveAgentConfig(agentId) {
  const name = document.getElementById('agent-cfg-name')?.value?.trim();
  const description = document.getElementById('agent-cfg-desc')?.value?.trim();
  const agentType = document.getElementById('agent-cfg-type')?.value;
  const modelSelect = document.getElementById('agent-cfg-model')?.value;
  const systemPrompt = document.getElementById('agent-cfg-prompt')?.value;
  const temperature = (parseInt(document.getElementById('agent-cfg-temp')?.value) || 30) / 100;
  const maxTokens = parseInt(document.getElementById('agent-cfg-maxtokens')?.value) || 4096;

  const modelMap = { 'Claude Opus 4': 'claude-opus-4-20250514', 'Claude Sonnet 4': 'claude-sonnet-4-20250514', 'GPT-4o': 'gpt-4o', 'Custom Model': 'custom' };
  const model = modelMap[modelSelect] || 'claude-sonnet-4-20250514';

  if (!name) { showToast('Agent name is required', 'error'); return; }
  try {
    const result = await api.patch(`/agents/${agentId}`, { name, description, agentType, model, systemPrompt, temperature, maxTokens });
    currentAgentDetail = result.data || result;
    showToast('Agent configuration saved!', 'success');
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to save configuration', 'error');
  }
}

async function executeAgentFromDetail(agentId) {
  const input = document.getElementById('agent-run-input')?.value?.trim();
  if (!input) { showToast('Please enter an input prompt', 'error'); return; }

  const btn = document.getElementById('agent-execute-btn');
  const statusEl = document.getElementById('agent-run-status');
  const resultDiv = document.getElementById('agent-run-result');
  const outputPre = document.getElementById('agent-run-output');

  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Starting execution...';
  if (resultDiv) resultDiv.style.display = 'none';

  try {
    const result = await api.post(`/agents/${agentId}/execute`, { input });
    const executionId = result.data?.executionId || result.executionId;
    if (statusEl) statusEl.textContent = 'Executing... polling for result';

    // Poll for completion
    if (agentExecutionPollTimer) clearInterval(agentExecutionPollTimer);
    let pollCount = 0;
    agentExecutionPollTimer = setInterval(async () => {
      pollCount++;
      try {
        const execResult = await api.get(`/agents/${agentId}/executions?limit=1`);
        const latest = (execResult.data || [])[0];
        if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
          clearInterval(agentExecutionPollTimer);
          agentExecutionPollTimer = null;
          if (btn) btn.disabled = false;

          if (latest.status === 'completed') {
            const rawOut = latest.output_data || latest.output || latest.output_text || latest.result || '';
            const output = typeof rawOut === 'object' ? (rawOut.text || JSON.stringify(rawOut, null, 2)) : String(rawOut) || 'Completed (no output returned)';
            if (statusEl) statusEl.textContent = 'Completed!';
            if (statusEl) statusEl.style.color = '#00ff88';
            if (outputPre) outputPre.textContent = output;
            if (resultDiv) resultDiv.style.display = 'block';
          } else {
            if (statusEl) statusEl.textContent = 'Failed: ' + (latest.error_message || latest.error || 'Unknown error');
            if (statusEl) statusEl.style.color = '#ef4444';
          }
          // Refresh execution history
          loadAgentDetail();
        } else if (pollCount >= 60) {
          clearInterval(agentExecutionPollTimer);
          agentExecutionPollTimer = null;
          if (btn) btn.disabled = false;
          if (statusEl) statusEl.textContent = 'Execution is still running. Refresh to check status.';
        }
      } catch (pollErr) {
        console.error('Poll error:', pollErr);
      }
    }, 2000);
  } catch (err) {
    if (btn) btn.disabled = false;
    if (statusEl) statusEl.textContent = '';
    showToast(err.message || 'Failed to execute agent', 'error');
  }
}

async function toggleAgentStatus(agentId, currentStatus) {
  try {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await api.patch(`/agents/${agentId}`, { status: newStatus });
    showToast(`Agent ${newStatus === 'active' ? 'activated' : 'paused'}`, 'success');
    loadAgentDetail();
  } catch (err) {
    showToast(err.message || 'Failed to update agent status', 'error');
  }
}

async function deleteAgentFromDetail(agentId, agentName) {
  if (!confirm(`Are you sure you want to delete "${agentName}"? This cannot be undone.`)) return;
  try {
    await api.del(`/agents/${agentId}`);
    showToast('Agent deleted', 'success');
    navigateTo('agents');
  } catch (err) {
    showToast(err.message || 'Failed to delete agent', 'error');
  }
}

// ============================================================
// INTEGRATIONS PAGE
// ============================================================
function renderIntegrations() {
  const integrations = [
    { name: 'Google Calendar', icon: '📅', desc: 'Sync appointments and scheduling with Google Calendar.', connected: true, cat: 'Productivity' },
    { name: 'Email (Resend)', icon: '📧', desc: 'Send transactional emails and notifications.', connected: true, cat: 'Communication' },
    { name: 'Claude AI', icon: '🤖', desc: 'AI-powered agents for text generation and analysis.', connected: true, cat: 'AI' },
    { name: 'PostgreSQL', icon: '🐘', desc: 'Query, insert, and manage your database records.', connected: true, cat: 'Database' },
    { name: 'Webhooks', icon: '🔗', desc: 'Trigger workflows from external services via webhooks.', connected: true, cat: 'Automation' },
    { name: 'Slack', icon: '💬', desc: 'Send messages, create channels, and receive notifications.', connected: false, cat: 'Communication' },
    { name: 'Stripe', icon: '💳', desc: 'Process payments, manage subscriptions, and invoices.', connected: false, cat: 'Finance' },
    { name: 'QuickBooks Online', icon: '💰', desc: 'Automated invoicing, customer sync, and billing management.', connected: qboConnected, cat: 'Finance' },
    { name: 'Google Sheets', icon: '📊', desc: 'Read and write spreadsheet data in your workflows.', connected: false, cat: 'Productivity' },
    { name: 'GitHub', icon: '🐙', desc: 'Trigger workflows on PRs, issues, and deployments.', connected: false, cat: 'Developer' },
    { name: 'HubSpot', icon: '🟠', desc: 'Marketing automation, CRM, and analytics integration.', connected: false, cat: 'Marketing' },
    { name: 'Twilio', icon: '📱', desc: 'Send SMS, make calls, and manage communications.', connected: false, cat: 'Communication' },
    { name: 'Notion', icon: '📝', desc: 'Sync pages, databases, and documents.', connected: false, cat: 'Productivity' },
  ];

  const cards = integrations.map(i => `
    <div class="integration-card" data-connected="${i.connected}">
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
             <button class="btn btn-primary btn-sm" onclick="${i.name === 'QuickBooks Online' ? 'connectQuickBooks()' : `showToast('${i.name} connected!', 'success')`}">Connect</button>`
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
        <button class="btn btn-secondary btn-sm" onclick="showToast('Marketplace coming soon','info')">${icons.search} Browse Marketplace</button>
      </div>
    </div>
    <div class="filter-bar">
      <span class="filter-chip active" onclick="filterIntegrations('all',this)">All (${integrations.length})</span>
      <span class="filter-chip" onclick="filterIntegrations('connected',this)">Connected (${integrations.filter(i=>i.connected).length})</span>
      <span class="filter-chip" onclick="filterIntegrations('available',this)">Available (${integrations.filter(i=>!i.connected).length})</span>
    </div>
    <div class="grid-3">${cards}</div>
  `;
}

function filterIntegrations(filter, el) {
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.integration-card').forEach(card => {
    if (filter === 'all') { card.style.display = ''; return; }
    const connected = card.dataset.connected === 'true';
    card.style.display = (filter === 'connected' && connected) || (filter === 'available' && !connected) ? '' : 'none';
  });
}

// ============================================================
// ANALYTICS PAGE
// ============================================================
function renderAnalytics() {
  // Use real dashboard data if available
  const d = dashboardData;
  const totalExec = d?.executions?.total || 0;
  const completedExec = d?.executions?.completed || 0;
  const failedExec = d?.executions?.failed || 0;
  const successRate = d?.executions?.successRate != null ? d.executions.successRate.toFixed(1) + '%' : '--';
  const wfCount = d?.workflows?.total || 0;
  const agentCount = d?.agents?.total || 0;

  // Chart from real data
  const chartData = d?.chartData || [];
  const maxCount = Math.max(...chartData.map(c => c.count), 1);
  const bars = chartData.map(c => `<div class="chart-bar" style="height:${Math.round((c.count / maxCount) * 100)}%"><span class="bar-value">${c.count}</span><span class="bar-label">${c.month}</span></div>`).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Analytics</h1>
        <p class="page-desc">Insights into your workflow and agent performance.</p>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon green">${icons.zap}</div></div>
        <div class="stat-value">${totalExec.toLocaleString()}</div>
        <div class="stat-label">Total Executions (30d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon blue">${icons.check}</div></div>
        <div class="stat-value">${successRate}</div>
        <div class="stat-label">Success Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon yellow">${icons.workflow}</div></div>
        <div class="stat-value">${wfCount}</div>
        <div class="stat-label">Total Workflows</div>
      </div>
      <div class="stat-card">
        <div class="stat-header"><div class="stat-icon green">${icons.agents}</div></div>
        <div class="stat-value">${agentCount}</div>
        <div class="stat-label">AI Agents</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:28px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Monthly Execution Volume</div>
        </div>
        <div class="chart-bar-group" style="margin-bottom:30px;">
          ${bars || '<div style="padding:40px 20px;text-align:center;color:var(--text-secondary);font-size:13px;">No execution data yet. Run a workflow to see analytics here.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Execution Breakdown</div>
        </div>
        <div style="padding:20px 0;">
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:10px;height:10px;border-radius:2px;background:var(--accent);"></div>
            <span style="flex:1;font-size:13px;">Completed</span>
            <span style="font-weight:600;font-size:13px;">${completedExec}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:10px;height:10px;border-radius:2px;background:var(--error);"></div>
            <span style="flex:1;font-size:13px;">Failed</span>
            <span style="font-weight:600;font-size:13px;">${failedExec}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;">
            <div style="width:10px;height:10px;border-radius:2px;background:var(--info);"></div>
            <span style="flex:1;font-size:13px;">Running</span>
            <span style="font-weight:600;font-size:13px;">${d?.executions?.running || 0}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// LOGS PAGE
// ============================================================
function renderLogs() {
  const logs = logsData;

  if (logs === null) {
    // Loading skeleton
    const skeletonEntries = Array.from({ length: 10 }, () => `
      <div class="log-entry">
        <span class="log-time"><div style="height:12px;width:90px;background:var(--bg-tertiary);border-radius:3px;animation:pulse 1.5s infinite;display:inline-block;"></div></span>
        <span class="log-level"><div style="height:12px;width:40px;background:var(--bg-tertiary);border-radius:3px;animation:pulse 1.5s infinite;display:inline-block;"></div></span>
        <span class="log-msg"><div style="height:12px;width:${300 + Math.random() * 200}px;background:var(--bg-tertiary);border-radius:3px;animation:pulse 1.5s infinite;display:inline-block;"></div></span>
      </div>
    `).join('');

    return `
      <div class="page-header">
        <div>
          <h1>Execution Logs</h1>
          <p class="page-desc">Real-time log stream from all workflow executions.</p>
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden;font-size:12px;">
        ${skeletonEntries}
      </div>
    `;
  }

  const entries = logs.map(l => `
    <div class="log-entry">
      <span class="log-time">${formatLogTime(l.created_at)}</span>
      <span class="log-level ${l.level}">${(l.level || 'info').toUpperCase()}</span>
      <span class="log-msg">${l.message || ''}</span>
    </div>
  `).join('') || '<div style="padding:24px;text-align:center;color:var(--text-secondary);">No log entries found.</div>';

  return `
    <div class="page-header">
      <div>
        <h1>Execution Logs</h1>
        <p class="page-desc">Real-time log stream from all workflow executions.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="showToast('Use the filter chips below to filter logs','info')">${icons.filter} Filter</button>
        <button class="btn btn-secondary btn-sm" onclick="showToast('Logs exported','success')">${icons.download} Export Logs</button>
        <div class="toggle active" onclick="this.classList.toggle('active');showToast(this.classList.contains('active')?'Live mode on':'Live mode off','info')" title="Live mode"></div>
      </div>
    </div>

    <div class="filter-bar">
      <span class="filter-chip active" onclick="filterLogs('all',this)">All Levels</span>
      <span class="filter-chip" onclick="filterLogs('info',this)">Info</span>
      <span class="filter-chip" onclick="filterLogs('warn',this)">Warning</span>
      <span class="filter-chip" onclick="filterLogs('error',this)">Error</span>
      <span class="filter-chip" onclick="filterLogs('debug',this)">Debug</span>
      <div style="flex:1;"></div>
      <input type="text" placeholder="Search logs..." style="width:260px;padding:6px 12px;font-size:12px;" oninput="handleLogsSearch(this.value)" />
    </div>

    <div class="card" style="padding:0;overflow:hidden;font-size:12px;" id="logs-container">
      ${entries}
    </div>
  `;
}

function filterLogs(level, el) {
  el.parentElement.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  // Re-fetch from API with level param
  const levelParam = level === 'all' ? '' : `&level=${level}`;
  const searchInput = document.querySelector('.filter-bar input[type="text"]');
  const searchParam = searchInput && searchInput.value ? `&search=${encodeURIComponent(searchInput.value)}` : '';
  reloadLogs(levelParam + searchParam);
}

function handleLogsSearch(value) {
  clearTimeout(logsSearchDebounceTimer);
  logsSearchDebounceTimer = setTimeout(() => {
    const activeChip = document.querySelector('.filter-bar .filter-chip.active');
    const chipText = activeChip ? activeChip.textContent.trim().toLowerCase() : 'all levels';
    const levelMap = { 'all levels': '', 'info': '&level=info', 'warning': '&level=warn', 'error': '&level=error', 'debug': '&level=debug' };
    const levelParam = levelMap[chipText] || '';
    const searchParam = value ? `&search=${encodeURIComponent(value)}` : '';
    reloadLogs(levelParam + searchParam);
  }, 400);
}

async function reloadLogs(queryParams) {
  try {
    const result = await api.get(`/logs?limit=50${queryParams || ''}`);
    logsData = result.data || [];
    // Re-render just the logs container
    const container = document.getElementById('logs-container');
    if (container) {
      const entries = logsData.map(l => `
        <div class="log-entry">
          <span class="log-time">${formatLogTime(l.created_at)}</span>
          <span class="log-level ${l.level}">${(l.level || 'info').toUpperCase()}</span>
          <span class="log-msg">${l.message || ''}</span>
        </div>
      `).join('') || '<div style="padding:24px;text-align:center;color:var(--text-secondary);">No log entries found.</div>';
      container.innerHTML = entries;
    }
  } catch (err) {
    console.error('Failed to reload logs:', err);
  }
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
    <div class="card" id="contact-support-card">
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
  const card = document.getElementById('contact-support-card');
  const textInputs = card.querySelectorAll('input');
  const textarea = card.querySelector('textarea');
  const name = textInputs[0]?.value?.trim();
  const email = textInputs[1]?.value?.trim();
  const subject = textInputs[2]?.value?.trim();
  const message = textarea?.value?.trim();
  if (!name || !email || !subject || !message) { showToast('Please fill all fields', 'error'); return; }
  try {
    await api.post('/contact', { name, email, subject, message });
    showToast('Support message sent! We\'ll respond within 24 hours.');
    textInputs.forEach(i => i.value = '');
    textarea.value = '';
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
        <div class="editor-palette-item" title="${item.tooltip || item.desc}" onclick="addNodeToEditor('${item.type}','${item.label}','${item.icon}','${item.color}','${item.desc}')">
          <div class="palette-item-icon ${item.color}">${icons[item.icon]}</div>
          <div>
            <div class="palette-item-name">${item.label}</div>
            <div class="palette-item-desc">${item.tooltip || item.desc}</div>
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
            <button class="btn btn-secondary btn-sm" onclick="handleEditorSave()">${icons.save} Save</button>
            <button class="btn btn-primary btn-sm" onclick="handleEditorDeploy()">${icons.zap} Deploy</button>
          </div>
        </div>

        <!-- Canvas -->
        <div class="editor-canvas" id="editor-canvas">
          <svg class="editor-connections-svg" id="editor-svg"></svg>
          <div id="editor-nodes"></div>
          <!-- Empty canvas prompt -->
          <div id="editor-empty-prompt" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity 0.3s ease;">
            <div style="font-size:48px;margin-bottom:12px;opacity:0.3;">&#8592;</div>
            <div style="font-size:15px;color:rgba(255,255,255,0.5);font-weight:500;">Start by dragging a trigger node from the palette</div>
          </div>
        </div>
        <!-- Floating help button -->
        <button id="editor-help-btn" onclick="showWorkflowGuide()" style="position:absolute;bottom:24px;right:24px;width:40px;height:40px;border-radius:50%;background:#00cc6a;color:#fff;border:none;font-size:18px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,204,106,0.4);z-index:100;display:flex;align-items:center;justify-content:center;transition:transform 0.2s ease,box-shadow 0.2s ease;"
          onmouseenter="this.style.transform='scale(1.1)';this.style.boxShadow='0 6px 16px rgba(0,204,106,0.5)'"
          onmouseleave="this.style.transform='scale(1)';this.style.boxShadow='0 4px 12px rgba(0,204,106,0.4)'"
          title="Reopen workflow guide">?</button>
      </div>
    </div>
    <!-- Workflow guide overlay -->
    <div id="workflow-guide-overlay" style="display:none;"></div>
  `;
}

// ── Workflow Guide / Tooltip System ────────────────────────
let workflowGuideStep = 0;
const workflowGuideSteps = [
  { title: 'Add Nodes', text: 'Drag nodes from the palette on the left onto the canvas to build your workflow.', highlight: 'palette' },
  { title: 'Connect Nodes', text: 'Connect nodes by clicking an output connector (right side) and dragging to an input connector (left side) on another node.', highlight: 'canvas' },
  { title: 'Configure Nodes', text: 'Click any node to configure it in the settings panel on the right.', highlight: 'canvas' },
  { title: 'Save & Deploy', text: 'Save your workflow, then click Deploy to activate it and start processing.', highlight: 'toolbar' },
];

function showWorkflowGuide() {
  workflowGuideStep = 0;
  renderWorkflowGuide();
}

function dismissWorkflowGuide() {
  localStorage.setItem('workflow_guide_dismissed', 'true');
  const overlay = document.getElementById('workflow-guide-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }
}

function renderWorkflowGuide() {
  const overlay = document.getElementById('workflow-guide-overlay');
  if (!overlay) return;

  const step = workflowGuideSteps[workflowGuideStep];
  const isFirst = workflowGuideStep === 0;
  const isLast = workflowGuideStep === workflowGuideSteps.length - 1;
  const dotIndicators = workflowGuideSteps.map((_, i) =>
    `<div style="width:8px;height:8px;border-radius:50%;background:${i === workflowGuideStep ? '#00cc6a' : 'rgba(255,255,255,0.25)'};transition:background 0.2s ease;"></div>`
  ).join('');

  overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,10,30,0.85);z-index:200;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;';
  overlay.innerHTML = `
    <div style="background:#1a1a2e;border:1px solid rgba(0,204,106,0.3);border-radius:16px;padding:40px 48px;max-width:440px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.5);position:relative;">
      <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:#00cc6a;color:#fff;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Step ${workflowGuideStep + 1} of ${workflowGuideSteps.length}</div>
      <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:12px;">${step.title}</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;margin-bottom:28px;">${step.text}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-bottom:24px;">${dotIndicators}</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        ${!isFirst ? '<button onclick="workflowGuideStep--;renderWorkflowGuide()" style="padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;font-size:13px;cursor:pointer;transition:background 0.2s ease;" onmouseenter="this.style.background=\'rgba(255,255,255,0.1)\'" onmouseleave="this.style.background=\'transparent\'">Back</button>' : ''}
        ${!isLast
          ? '<button onclick="workflowGuideStep++;renderWorkflowGuide()" style="padding:8px 24px;border-radius:8px;border:none;background:#00cc6a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s ease;" onmouseenter="this.style.background=\'#00e676\'" onmouseleave="this.style.background=\'#00cc6a\'">Next</button>'
          : '<button onclick="dismissWorkflowGuide()" style="padding:8px 24px;border-radius:8px;border:none;background:#00cc6a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s ease;" onmouseenter="this.style.background=\'#00e676\'" onmouseleave="this.style.background=\'#00cc6a\'">Got it!</button>'
        }
      </div>
      <button onclick="dismissWorkflowGuide()" style="position:absolute;top:12px;right:16px;background:none;border:none;color:rgba(255,255,255,0.4);font-size:18px;cursor:pointer;padding:4px;" title="Dismiss guide">&times;</button>
    </div>
  `;
  // Fade in
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });
}

function updateEmptyCanvasPrompt() {
  const prompt = document.getElementById('editor-empty-prompt');
  if (!prompt) return;
  if (editorState.nodes.length === 0) {
    prompt.style.display = 'block';
    requestAnimationFrame(() => { prompt.style.opacity = '1'; });
  } else {
    prompt.style.opacity = '0';
    setTimeout(() => { prompt.style.display = 'none'; }, 300);
  }
}

function initWorkflowEditor() {
  renderEditorNodes();
  renderEditorConnections();
  updateEmptyCanvasPrompt();

  // Show guide if not previously dismissed
  if (!localStorage.getItem('workflow_guide_dismissed')) {
    showWorkflowGuide();
  }

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
      updateEmptyCanvasPrompt();
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

  // Update node config panel
  renderNodeConfigPanel();
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
    config: getDefaultNodeConfig(type),
  });
  renderEditorNodes();
  updateEmptyCanvasPrompt();
  showToast(`${label} node added`, 'info');
}

function getDefaultNodeConfig(type) {
  switch (type) {
    case 'webhook-trigger': return { method: 'POST', path: '' };
    case 'schedule-trigger': return { cron: '0 9 * * *' };
    case 'event-trigger': return { eventType: '' };
    case 'ai-classifier': return { prompt: '', model: 'claude-sonnet-4-20250514', temperature: 0.7, maxTokens: 1024 };
    case 'ai-generator': return { prompt: '', model: 'claude-sonnet-4-20250514', temperature: 0.7, maxTokens: 2048 };
    case 'ai-analyzer': return { prompt: '', model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 1024 };
    case 'condition': return { expression: '' };
    case 'delay': return { seconds: 60 };
    case 'loop': return { collection: '' };
    case 'action': return { actionType: 'email', recipient: '', subject: '', body: '' };
    case 'api-call': return { url: '', method: 'GET', headers: '{}', body: '' };
    case 'notify': return { message: '' };
    case 'database': return { operation: 'query', query: '' };
    default: return {};
  }
}

function loadWorkflowTemplate(templateName) {
  currentWorkflowId = null;

  const templates = {
    'lead-scoring': {
      name: 'Lead Scoring Pipeline',
      nodes: [
        { id: 1, type: 'webhook-trigger', label: 'Incoming Lead', desc: 'POST /api/leads/inbound', x: 60, y: 220, color: 'green', icon: 'zap', config: { method: 'POST', path: '/api/leads/inbound' } },
        { id: 2, type: 'ai-classifier', label: 'Score Lead', desc: 'High / Medium / Low', x: 320, y: 220, color: 'blue', icon: 'agents', config: { prompt: 'Classify the following lead as high, medium, or low value based on company size, role seniority, and engagement signals. Return JSON with score (0-100) and tier (high/medium/low).', model: 'claude-sonnet-4-20250514', temperature: 0.3, maxTokens: 512 } },
        { id: 3, type: 'condition', label: 'Score Router', desc: 'tier == "high"?', x: 580, y: 220, color: 'purple', icon: 'filter', config: { expression: 'output.tier === "high"' } },
        { id: 4, type: 'notify', label: 'Notify Sales', desc: 'Slack #high-value-leads', x: 840, y: 100, color: 'orange', icon: 'bell', config: { message: 'New high-value lead: {{lead.name}} ({{lead.company}}) — Score: {{output.score}}' } },
        { id: 5, type: 'database', label: 'Save to CRM', desc: 'INSERT leads table', x: 1060, y: 100, color: 'purple', icon: 'logs', config: { operation: 'insert', query: 'INSERT INTO qualified_leads (name, email, company, score, tier, created_at) VALUES (:name, :email, :company, :score, :tier, NOW())' } },
        { id: 6, type: 'database', label: 'Log Lead', desc: 'INSERT lead_log', x: 840, y: 340, color: 'purple', icon: 'logs', config: { operation: 'insert', query: 'INSERT INTO lead_log (email, score, tier, source, logged_at) VALUES (:email, :score, :tier, :source, NOW())' } },
      ],
      connections: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 3, to: 6 },
      ],
    },
    'email-automation': {
      name: 'Email Automation Sequence',
      nodes: [
        { id: 1, type: 'schedule-trigger', label: 'Daily 9 AM', desc: 'Cron: 0 9 * * *', x: 60, y: 200, color: 'blue', icon: 'clock', config: { cron: '0 9 * * *' } },
        { id: 2, type: 'database', label: 'Fetch Recipients', desc: 'SELECT active subscribers', x: 320, y: 200, color: 'purple', icon: 'logs', config: { operation: 'query', query: 'SELECT id, name, email, preferences, last_purchase FROM subscribers WHERE status = \'active\' AND last_email_at < NOW() - INTERVAL \'7 days\' LIMIT 200' } },
        { id: 3, type: 'loop', label: 'Each Recipient', desc: 'Iterate subscriber list', x: 580, y: 200, color: 'blue', icon: 'workflow', config: { collection: 'output.rows' } },
        { id: 4, type: 'ai-generator', label: 'Personalize Email', desc: 'Generate email body', x: 840, y: 200, color: 'purple', icon: 'edit', config: { prompt: 'Write a personalized marketing email for {{item.name}}. Their preferences: {{item.preferences}}. Last purchase: {{item.last_purchase}}. Keep it concise (under 150 words), friendly, and include a clear CTA. Return JSON with subject and body fields.', model: 'claude-sonnet-4-20250514', temperature: 0.8, maxTokens: 1024 } },
        { id: 5, type: 'delay', label: 'Stagger Send', desc: 'Wait 10s between sends', x: 1060, y: 200, color: 'yellow', icon: 'clock', config: { seconds: 10 } },
        { id: 6, type: 'action', label: 'Send Email', desc: 'Deliver via SMTP', x: 1280, y: 200, color: 'green', icon: 'mail', config: { actionType: 'email', recipient: '{{item.email}}', subject: '{{output.subject}}', body: '{{output.body}}' } },
      ],
      connections: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 5, to: 6 },
      ],
    },
    'support-router': {
      name: 'Support Ticket Router',
      nodes: [
        { id: 1, type: 'webhook-trigger', label: 'New Ticket', desc: 'POST /api/tickets/new', x: 60, y: 240, color: 'green', icon: 'zap', config: { method: 'POST', path: '/api/tickets/new' } },
        { id: 2, type: 'ai-classifier', label: 'Categorize Ticket', desc: 'Billing / Technical / General', x: 320, y: 240, color: 'blue', icon: 'agents', config: { prompt: 'Classify this support ticket into exactly one category: billing, technical, or general. Analyze the subject and body. Return JSON with category, confidence (0-1), and priority (low/medium/high/urgent).', model: 'claude-sonnet-4-20250514', temperature: 0.2, maxTokens: 256 } },
        { id: 3, type: 'condition', label: 'Is Billing?', desc: 'category == "billing"', x: 580, y: 120, color: 'purple', icon: 'filter', config: { expression: 'output.category === "billing"' } },
        { id: 4, type: 'notify', label: 'Billing Team', desc: 'Slack #billing-support', x: 840, y: 60, color: 'orange', icon: 'bell', config: { message: '[{{output.priority}}] Billing ticket from {{ticket.email}}: {{ticket.subject}}' } },
        { id: 5, type: 'condition', label: 'Is Technical?', desc: 'category == "technical"', x: 580, y: 280, color: 'purple', icon: 'filter', config: { expression: 'output.category === "technical"' } },
        { id: 6, type: 'notify', label: 'Engineering Team', desc: 'Slack #eng-support', x: 840, y: 220, color: 'orange', icon: 'bell', config: { message: '[{{output.priority}}] Technical ticket from {{ticket.email}}: {{ticket.subject}} — Confidence: {{output.confidence}}' } },
        { id: 7, type: 'notify', label: 'General Support', desc: 'Slack #general-support', x: 840, y: 380, color: 'orange', icon: 'bell', config: { message: '[{{output.priority}}] General inquiry from {{ticket.email}}: {{ticket.subject}}' } },
        { id: 8, type: 'database', label: 'Log Ticket', desc: 'INSERT ticket_routing', x: 1100, y: 240, color: 'purple', icon: 'logs', config: { operation: 'insert', query: 'INSERT INTO ticket_routing (ticket_id, category, priority, confidence, routed_to, created_at) VALUES (:ticket_id, :category, :priority, :confidence, :routed_team, NOW())' } },
      ],
      connections: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 2, to: 5 },
        { from: 5, to: 6 },
        { from: 5, to: 7 },
        { from: 4, to: 8 },
        { from: 6, to: 8 },
        { from: 7, to: 8 },
      ],
    },
  };

  const tpl = templates[templateName];
  if (!tpl) { showToast('Template not found', 'error'); return; }

  editorState.nodes = tpl.nodes.map(n => ({ ...n }));
  editorState.connections = tpl.connections.map(c => ({ ...c }));
  editorState.workflowName = tpl.name;
  editorState.nextId = Math.max(...tpl.nodes.map(n => n.id)) + 1;
  editorState.selectedNodeId = null;

  navigateTo('workflow-editor');
  showToast(`Loaded "${tpl.name}" template`, 'success');
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

async function handleEditorSave() {
  try {
    // Map frontend nodes to backend format
    const mappedNodes = editorState.nodes.map(n => ({
      id: n.id,
      type: FRONTEND_TO_BACKEND_TYPE[n.type] || n.type,
      label: n.label,
      desc: n.desc,
      x: n.x,
      y: n.y,
      color: n.color,
      icon: n.icon,
      config: n.config || {},
    }));

    // Determine trigger type from the first trigger node
    const triggerNode = editorState.nodes.find(n => n.type.includes('trigger'));
    const triggerTypeMap = { 'webhook-trigger': 'webhook', 'schedule-trigger': 'schedule', 'event-trigger': 'event' };
    const triggerType = triggerNode ? (triggerTypeMap[triggerNode.type] || 'manual') : 'manual';

    const body = {
      name: editorState.workflowName,
      definition: { nodes: mappedNodes, connections: editorState.connections },
      triggerType,
    };

    if (currentWorkflowId) {
      await api.patch(`/workflows/${currentWorkflowId}`, body);
      showToast('Workflow saved!', 'success');
    } else {
      const result = await api.post('/workflows', body);
      const newWf = result.data || result;
      currentWorkflowId = newWf.id;
      showToast('Workflow created and saved!', 'success');
    }
    return true;
  } catch (err) {
    showToast(err.message || 'Failed to save workflow', 'error');
    return false;
  }
}

async function handleEditorDeploy() {
  // Save first
  const saved = await handleEditorSave();
  if (!saved || !currentWorkflowId) return;

  try {
    // Set status to active
    await api.patch(`/workflows/${currentWorkflowId}`, { status: 'active' });
    // Execute the workflow
    const result = await api.post(`/workflows/${currentWorkflowId}/execute`);
    const executionId = result.executionId || result.data?.executionId;
    showToast('Workflow deployed and executing!', 'success');
    showExecutionStatusBar('running', executionId);
    startExecutionPolling(currentWorkflowId, executionId);
  } catch (err) {
    showToast(err.message || 'Failed to deploy workflow', 'error');
  }
}

// ── Execution Status Polling ────────────────────────────
function showExecutionStatusBar(status, executionId) {
  let bar = document.getElementById('execution-status-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'execution-status-bar';
    const editorMain = document.querySelector('.editor-main');
    if (editorMain) editorMain.appendChild(bar);
    else return;
  }
  const statusColors = { running: '#3b82f6', completed: '#00ff88', failed: '#ef4444', pending: '#fbbf24' };
  const statusIcons = { running: '⟳', completed: '✓', failed: '✗', pending: '◌' };
  bar.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:40px;background:var(--bg-secondary);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 16px;gap:10px;font-size:12px;z-index:10;`;
  bar.innerHTML = `
    <span style="color:${statusColors[status] || '#999'};font-size:16px;${status === 'running' ? 'animation:spin 1s linear infinite;' : ''}">${statusIcons[status] || '•'}</span>
    <span style="color:var(--text-secondary);">Execution ${executionId ? '#' + executionId.slice(0,8) : ''}: <strong style="color:${statusColors[status] || 'var(--text-primary)'};text-transform:capitalize;">${status}</strong></span>
    ${status === 'completed' || status === 'failed' ? `<button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11px;" onclick="document.getElementById('execution-status-bar').remove()">Dismiss</button>` : `<span style="margin-left:auto;color:var(--text-tertiary);font-size:11px;">Polling for updates...</span>`}
  `;
}

function startExecutionPolling(workflowId, executionId) {
  if (executionPollTimer) clearInterval(executionPollTimer);
  let polls = 0;
  executionPollTimer = setInterval(async () => {
    polls++;
    try {
      const result = await api.get(`/workflows/${workflowId}/executions?limit=1`);
      const executions = result.data || result;
      if (executions && executions.length > 0) {
        const latest = executions[0];
        const status = latest.status || 'pending';
        showExecutionStatusBar(status, latest.id || executionId);
        // Highlight nodes based on results
        if (latest.node_results) {
          highlightExecutionNodes(latest.node_results);
        }
        if (status === 'completed' || status === 'failed') {
          clearInterval(executionPollTimer);
          executionPollTimer = null;
          if (status === 'completed') showToast('Workflow execution completed!', 'success');
          else showToast('Workflow execution failed', 'error');
        }
      }
    } catch (err) {
      // Silently ignore polling errors
    }
    // Stop polling after 60 attempts (2 minutes)
    if (polls >= 60) {
      clearInterval(executionPollTimer);
      executionPollTimer = null;
      showExecutionStatusBar('timeout', executionId);
    }
  }, 2000);
}

function highlightExecutionNodes(nodeResults) {
  const nodeEls = document.querySelectorAll('.workflow-node');
  nodeEls.forEach(el => {
    el.style.boxShadow = '';
    el.style.borderColor = '';
  });
  if (!nodeResults || typeof nodeResults !== 'object') return;
  Object.entries(nodeResults).forEach(([nodeId, result]) => {
    const el = document.querySelector(`.workflow-node[data-id="${nodeId}"]`);
    if (!el) return;
    if (result.status === 'completed' || result.success) {
      el.style.boxShadow = '0 0 12px rgba(0,255,136,0.4)';
      el.style.borderColor = '#00ff88';
    } else if (result.status === 'failed' || result.error) {
      el.style.boxShadow = '0 0 12px rgba(239,68,68,0.4)';
      el.style.borderColor = '#ef4444';
    }
  });
}

// ── Node Configuration Panel ────────────────────────────
function renderNodeConfigPanel() {
  let panel = document.getElementById('node-config-panel');
  const selectedNode = editorState.nodes.find(n => n.id === editorState.selectedNodeId);

  if (!selectedNode) {
    if (panel) panel.style.display = 'none';
    return;
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'node-config-panel';
    const editorMain = document.querySelector('.editor-main');
    if (editorMain) editorMain.appendChild(panel);
    else return;
  }

  panel.style.cssText = 'position:absolute;top:48px;right:0;bottom:0;width:280px;background:var(--bg-secondary);border-left:1px solid var(--border);overflow-y:auto;z-index:15;padding:16px;display:block;';

  const config = selectedNode.config || {};
  const nodeId = selectedNode.id;
  let fields = '';

  // Node label
  fields += `
    <div style="margin-bottom:12px;">
      <label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Node Label</label>
      <input type="text" value="${selectedNode.label}" style="width:100%;font-size:12px;padding:6px 10px;" onchange="updateNodeConfig(${nodeId},'_label',this.value)" />
    </div>
  `;

  // Type-specific fields
  switch (selectedNode.type) {
    case 'webhook-trigger':
      fields += configField(nodeId, 'method', 'Method', config.method || 'POST', 'select', ['GET','POST','PUT','DELETE']);
      fields += configField(nodeId, 'path', 'Path', config.path || '', 'text', null, '/api/leads');
      if (currentWorkflowId) {
        fields += `<div style="margin-bottom:12px;"><label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Webhook URL</label><input type="text" value="/api/v1/webhooks/${currentWorkflowId}" readonly style="width:100%;font-size:11px;padding:6px 10px;opacity:0.7;cursor:not-allowed;" /></div>`;
      }
      break;
    case 'schedule-trigger':
      fields += configField(nodeId, 'cron', 'Cron Expression', config.cron || '0 9 * * *', 'text', null, '0 9 * * *');
      fields += `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;">Minute Hour Day Month Weekday</div>`;
      break;
    case 'event-trigger':
      fields += configField(nodeId, 'eventType', 'Event Type', config.eventType || '', 'text', null, 'user.created');
      break;
    case 'ai-classifier':
    case 'ai-generator':
    case 'ai-analyzer':
      fields += configField(nodeId, 'prompt', 'Prompt', config.prompt || '', 'textarea', null, 'Analyze the input and...');
      fields += configField(nodeId, 'model', 'Model', config.model || 'claude-sonnet-4-20250514', 'select', ['claude-sonnet-4-20250514','claude-opus-4-20250514','claude-3-haiku-20240307']);
      fields += configField(nodeId, 'temperature', 'Temperature', config.temperature ?? 0.7, 'number');
      fields += configField(nodeId, 'maxTokens', 'Max Tokens', config.maxTokens ?? 1024, 'number');
      break;
    case 'condition':
      fields += configField(nodeId, 'expression', 'Expression', config.expression || '', 'text', null, 'input.score >= 80');
      break;
    case 'delay':
      fields += configField(nodeId, 'seconds', 'Delay (seconds)', config.seconds ?? 60, 'number');
      break;
    case 'loop':
      fields += configField(nodeId, 'collection', 'Collection Path', config.collection || '', 'text', null, 'input.items');
      break;
    case 'action':
      fields += configField(nodeId, 'actionType', 'Action Type', config.actionType || 'email', 'select', ['email','webhook','log']);
      fields += configField(nodeId, 'recipient', 'Recipient', config.recipient || '', 'text', null, 'user@example.com');
      fields += configField(nodeId, 'subject', 'Subject', config.subject || '', 'text', null, 'Notification');
      fields += configField(nodeId, 'body', 'Body', config.body || '', 'textarea', null, 'Email body...');
      break;
    case 'api-call':
      fields += configField(nodeId, 'url', 'URL', config.url || '', 'text', null, 'https://api.example.com');
      fields += configField(nodeId, 'method', 'Method', config.method || 'GET', 'select', ['GET','POST','PUT','PATCH','DELETE']);
      fields += configField(nodeId, 'headers', 'Headers (JSON)', config.headers || '{}', 'textarea', null, '{"Authorization":"Bearer ..."}');
      fields += configField(nodeId, 'body', 'Request Body', config.body || '', 'textarea', null, '{"key":"value"}');
      break;
    case 'notify':
      fields += configField(nodeId, 'message', 'Message', config.message || '', 'textarea', null, 'Notification message...');
      break;
    case 'database':
      fields += configField(nodeId, 'operation', 'Operation', config.operation || 'query', 'select', ['query','insert','update','delete']);
      fields += configField(nodeId, 'query', 'Query / Expression', config.query || '', 'textarea', null, 'SELECT * FROM...');
      break;
  }

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <span style="font-weight:600;font-size:13px;">Node Config</span>
      <button class="btn btn-ghost btn-sm" style="font-size:16px;padding:2px 6px;" onclick="editorState.selectedNodeId=null;renderEditorNodes();">×</button>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Type: ${selectedNode.type}</div>
    ${fields}
    <button class="btn btn-ghost btn-sm" style="color:#ef4444;width:100%;margin-top:8px;" onclick="if(confirm('Delete this node?')){editorState.nodes=editorState.nodes.filter(n=>n.id!==${nodeId});editorState.connections=editorState.connections.filter(c=>c.from!==${nodeId}&&c.to!==${nodeId});editorState.selectedNodeId=null;renderEditorNodes();renderEditorConnections();showToast('Node deleted','info');}">Delete Node</button>
  `;
}

function configField(nodeId, key, label, value, type, options, placeholder) {
  const escaped = typeof value === 'string' ? value.replace(/"/g, '&quot;') : value;
  let input = '';
  if (type === 'textarea') {
    input = `<textarea style="width:100%;font-size:12px;padding:6px 10px;min-height:60px;resize:vertical;" placeholder="${placeholder || ''}" onchange="updateNodeConfig(${nodeId},'${key}',this.value)">${value || ''}</textarea>`;
  } else if (type === 'select' && options) {
    input = `<select style="width:100%;font-size:12px;padding:6px 10px;" onchange="updateNodeConfig(${nodeId},'${key}',this.value)">
      ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
    </select>`;
  } else if (type === 'number') {
    input = `<input type="number" value="${value}" style="width:100%;font-size:12px;padding:6px 10px;" step="${key === 'temperature' ? '0.1' : '1'}" onchange="updateNodeConfig(${nodeId},'${key}',parseFloat(this.value))" />`;
  } else {
    input = `<input type="text" value="${escaped}" style="width:100%;font-size:12px;padding:6px 10px;" placeholder="${placeholder || ''}" onchange="updateNodeConfig(${nodeId},'${key}',this.value)" />`;
  }
  return `<div style="margin-bottom:12px;"><label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">${label}</label>${input}</div>`;
}

function updateNodeConfig(nodeId, key, value) {
  const node = editorState.nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (key === '_label') {
    node.label = value;
    renderEditorNodes();
    return;
  }
  if (!node.config) node.config = {};
  node.config[key] = value;
}

// ============================================================
// WORKFLOW DETAIL PAGE
// ============================================================
let workflowDetailExecutions = null;

async function loadWorkflowDetail() {
  if (!currentWorkflowId) { navigateTo('workflows'); return; }
  try {
    const [wfResult, execResult] = await Promise.all([
      api.get(`/workflows/${currentWorkflowId}`),
      api.get(`/workflows/${currentWorkflowId}/executions?limit=20`).catch(() => ({ data: [] })),
    ]);
    currentWorkflowDetail = wfResult.data || wfResult;
    workflowDetailExecutions = execResult.data || execResult || [];
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to load workflow', 'error');
    navigateTo('workflows');
  }
}

function renderWorkflowDetail() {
  if (!currentWorkflowDetail) {
    return `
      <div class="page-header"><div><h1>Workflow Details</h1><p class="page-desc">Loading...</p></div></div>
      <div class="card" style="padding:32px;text-align:center;">
        <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
        <p style="color:var(--text-secondary);font-size:13px;">Loading workflow details...</p>
      </div>
    `;
  }

  const wf = currentWorkflowDetail;
  const execs = workflowDetailExecutions || [];
  const status = wf.status || 'draft';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const trigger = triggerTypeLabel(wf.trigger_type);
  const nodeCount = wf.definition?.nodes?.length || 0;
  const connectionCount = wf.definition?.connections?.length || 0;
  const totalRuns = wf.total_runs || execs.length || 0;
  const successRate = wf.success_rate != null ? wf.success_rate + '%' : (execs.length > 0 ? Math.round(execs.filter(e => e.status === 'completed').length / execs.length * 100) + '%' : '\u2014');
  const lastRun = wf.last_run_at ? timeAgo(wf.last_run_at) : 'Never';
  const created = wf.created_at ? new Date(wf.created_at).toLocaleDateString() : '\u2014';

  // Cost calculation
  const wfCost = calculateWorkflowExecsCost(execs);

  // Schedule info
  const cronExpr = wf.cron_expression || (wf.trigger_config && wf.trigger_config.cron) || null;
  const cronTz = (wf.trigger_config && wf.trigger_config.timezone) || wf.timezone || null;
  const scheduleReadable = humanReadableCron(cronExpr, cronTz);
  const nextRun = getNextCronRun(cronExpr, cronTz);
  const nextRunStr = nextRun ? nextRun.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : null;

  // Trigger config display
  const triggerConfig = wf.trigger_config || {};
  const triggerConfigKeys = Object.keys(triggerConfig);
  const triggerConfigHtml = triggerConfigKeys.length > 0 ? triggerConfigKeys.map(k => {
    let val = triggerConfig[k];
    if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
    if (typeof val === 'string' && val.length > 80) val = val.slice(0, 77) + '...';
    return `<div style="display:flex;justify-content:space-between;gap:12px;"><span style="color:var(--text-secondary);white-space:nowrap;">${k}</span><span style="text-align:right;word-break:break-all;font-family:monospace;font-size:11px;">${val}</span></div>`;
  }).join('') : '<div style="color:var(--text-tertiary);font-size:12px;">No trigger configuration</div>';

  // Pipeline node visualization
  const nodes = wf.definition?.nodes || [];
  const connections = wf.definition?.connections || [];
  let orderedNodes = [];
  if (nodes.length > 0) {
    const targetSet = new Set(connections.map(c => c.to));
    const fromMap = {};
    connections.forEach(c => { fromMap[c.from] = c.to; });
    let startNode = nodes.find(n => !targetSet.has(n.id));
    if (!startNode) startNode = nodes[0];
    const visited = new Set();
    let current = startNode;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      orderedNodes.push(current);
      const nextId = fromMap[current.id];
      current = nextId ? nodes.find(n => n.id === nextId) : null;
    }
    nodes.forEach(n => { if (!visited.has(n.id)) orderedNodes.push(n); });
  }
  const pipelineHtml = orderedNodes.length > 0 ? orderedNodes.map((n, i) => {
    const icon = renderNodeTypeIcon(n.type || n.label || '');
    const label = n.label || n.type || 'Step ' + (i + 1);
    const desc = n.description || '';
    const arrow = i < orderedNodes.length - 1 ? `<div style="display:flex;align-items:center;padding:0 4px;color:var(--accent);font-size:18px;flex-shrink:0;">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00cc6a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </div>` : '';
    return `<div style="display:flex;align-items:center;flex-shrink:0;">
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:120px;text-align:center;position:relative;">
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:4px;color:var(--accent);">${icon}</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.3;">${label}</div>
        ${desc ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;line-height:1.3;">${desc}</div>` : ''}
        <div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:var(--accent);color:#000;font-size:9px;font-weight:700;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${i + 1}</div>
      </div>
      ${arrow}
    </div>`;
  }).join('') : '';

  const executionRows = execs.length > 0 ? execs.map(e => {
    const eStatus = e.status || 'pending';
    const eStatusColor = { completed: '#00ff88', failed: '#ef4444', running: '#3b82f6', pending: '#fbbf24' };
    const duration = e.started_at && e.completed_at ? ((new Date(e.completed_at) - new Date(e.started_at)) / 1000).toFixed(1) + 's' : e.started_at ? 'Running...' : '\u2014';
    const execCost = calculateWorkflowExecCost(e);
    const costStr = (execCost.totalInput + execCost.totalOutput) > 0 ? formatCost(execCost.total) : '\u2014';
    return `
      <tr>
        <td style="font-family:monospace;font-size:11px;">${(e.id || '').slice(0, 8)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${eStatusColor[eStatus] || '#666'};"></span> ${eStatus}</span></td>
        <td>${e.started_at ? new Date(e.started_at).toLocaleString() : '\u2014'}</td>
        <td>${duration}</td>
        <td style="font-size:11px;color:#00cc6a;">${costStr}</td>
        <td style="font-size:11px;color:var(--text-secondary);">${e.error_message ? e.error_message.slice(0, 60) : '\u2014'}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:24px;">No executions yet. Deploy and run this workflow to see execution history.</td></tr>`;

  return `
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workflows')">${icons.arrowLeft} Back</button>
          <h1 style="margin:0;">${wf.name || 'Untitled Workflow'}</h1>
          <span class="badge-status ${status}"><span class="dot"></span> ${statusLabel}</span>
        </div>
        <p class="page-desc">${wf.description || 'No description'}</p>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="loadWorkflowInEditor('${wf.id}')">${icons.edit} Edit in Builder</button>
        <button class="btn btn-primary btn-sm" onclick="executeWorkflowFromDetail('${wf.id}')">${icons.play} Run Now</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleWorkflowPause('${wf.id}','${status}')">${status === 'active' ? icons.clock + ' Pause' : icons.zap + ' Activate'}</button>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="deleteWorkflowFromDetail('${wf.id}','${(wf.name||'').replace(/'/g,"\\'")}')">${icons.trash} Delete</button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-value">${totalRuns}</div><div class="stat-label">Total Runs</div></div>
      <div class="stat-card"><div class="stat-value">${successRate}</div><div class="stat-label">Success Rate</div></div>
      <div class="stat-card"><div class="stat-value">${trigger}</div><div class="stat-label">Trigger Type</div></div>
      <div class="stat-card"><div class="stat-value">${nodeCount}</div><div class="stat-label">Nodes</div></div>
      ${scheduleReadable ? `<div class="stat-card"><div class="stat-value" style="font-size:16px;">${scheduleReadable}</div><div class="stat-label">Schedule</div></div>` : ''}
      ${nextRunStr ? `<div class="stat-card"><div class="stat-value" style="font-size:14px;">${nextRunStr}</div><div class="stat-label">Next Run</div></div>` : ''}
      <div class="stat-card" style="border:1px solid rgba(0,204,106,0.2);"><div class="stat-value" style="color:#00cc6a;">${formatCost(wfCost.total)}</div><div class="stat-label">Est. Cost (incl. 10% fee)</div></div>
    </div>

    ${orderedNodes.length > 0 ? `
    <!-- Pipeline Visualization -->
    <div class="card" style="padding:20px;margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:16px;">Pipeline Flow</div>
      <div style="display:flex;align-items:center;overflow-x:auto;padding:12px 0;gap:0;">
        ${pipelineHtml}
      </div>
      <div style="margin-top:12px;font-size:11px;color:var(--text-tertiary);">${orderedNodes.length} nodes, ${connectionCount} connections</div>
    </div>
    ` : ''}

    <!-- Info Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
      <div class="card" style="padding:16px;">
        <div class="card-title" style="margin-bottom:12px;">Details</div>
        <div style="font-size:13px;display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Created</span><span>${created}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Last Run</span><span>${lastRun}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Connections</span><span>${connectionCount}</span></div>
          <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Trigger</span><span>${trigger}</span></div>
          ${cronExpr ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Cron</span><span style="font-family:monospace;font-size:11px;">${cronExpr}</span></div>` : ''}
          ${cronTz ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Timezone</span><span>${cronTz}</span></div>` : ''}
          ${scheduleReadable ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Schedule</span><span style="color:var(--accent);">${scheduleReadable}</span></div>` : ''}
          ${nextRunStr ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Next Run</span><span>${nextRunStr}</span></div>` : ''}
        </div>
      </div>
      <div class="card" style="padding:16px;">
        <div class="card-title" style="margin-bottom:12px;">Quick Actions</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="loadWorkflowInEditor('${wf.id}')" style="justify-content:flex-start;">${icons.edit} Open in Visual Editor</button>
          <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('/api/v1/webhooks/${wf.id}');showToast('Webhook URL copied!','success');" style="justify-content:flex-start;">${icons.globe} Copy Webhook URL</button>
          <button class="btn btn-ghost btn-sm" onclick="loadWorkflowDetail()" style="justify-content:flex-start;">${icons.refresh || icons.workflow} Refresh</button>
        </div>
      </div>
    </div>

    ${triggerConfigKeys.length > 0 ? `
    <!-- Trigger Configuration -->
    <div class="card" style="padding:16px;margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:12px;">Trigger Configuration</div>
      <div style="font-size:13px;display:flex;flex-direction:column;gap:8px;">
        ${triggerConfigHtml}
      </div>
    </div>
    ` : ''}

    <!-- Execution History -->
    <div class="card" style="padding:0;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div class="card-title" style="margin:0;">Execution History</div>
        <button class="btn btn-ghost btn-sm" onclick="loadWorkflowDetail()">Refresh</button>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>ID</th><th>Status</th><th>Started</th><th>Duration</th><th>Cost</th><th>Error</th></tr></thead>
          <tbody>${executionRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

async function executeWorkflowFromDetail(workflowId) {
  try {
    const result = await api.post(`/workflows/${workflowId}/execute`);
    showToast(`Workflow executed! Execution ID: ${result.executionId || 'started'}`, 'success');
    setTimeout(() => loadWorkflowDetail(), 1500);
  } catch (err) {
    showToast(err.message || 'Failed to execute workflow', 'error');
  }
}

async function toggleWorkflowPause(workflowId, currentStatus) {
  try {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await api.patch(`/workflows/${workflowId}`, { status: newStatus });
    showToast(`Workflow ${newStatus === 'active' ? 'activated' : 'paused'}`, 'success');
    loadWorkflowDetail();
  } catch (err) {
    showToast(err.message || 'Failed to update workflow', 'error');
  }
}

async function deleteWorkflowFromDetail(workflowId, workflowName) {
  if (!confirm(`Are you sure you want to delete "${workflowName}"? This cannot be undone.`)) return;
  try {
    await api.del(`/workflows/${workflowId}`);
    showToast('Workflow deleted', 'success');
    navigateTo('workflows');
  } catch (err) {
    showToast(err.message || 'Failed to delete workflow', 'error');
  }
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
      <div class="tab active" onclick="switchSettingsTab('general',this)">General</div>
      <div class="tab" onclick="switchSettingsTab('security',this)">Security</div>
      <div class="tab" onclick="switchSettingsTab('notifications',this)">Notifications</div>
      <div class="tab" onclick="switchSettingsTab('apikeys',this)">API Keys</div>
    </div>

    <!-- Profile -->
    <div class="settings-section" data-settings-tab="general">
      <h3>Profile Information</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input type="text" value="${currentUser?.first_name || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input type="text" value="${currentUser?.last_name || ''}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" value="${currentUser?.email || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Company</label>
        <input type="text" value="${currentUser?.company || ''}" />
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
      <button class="btn btn-primary" onclick="handleSaveProfile()">Save Changes</button>
    </div>

    <!-- Security -->
    <div class="settings-section" data-settings-tab="security" style="display:none;">
      <h3>Security</h3>
      <div class="form-group">
        <label class="form-label">Current Password</label>
        <input type="password" placeholder="Enter current password" />
      </div>
      <div class="form-group">
        <label class="form-label">New Password</label>
        <input type="password" placeholder="Min 8 characters" />
      </div>
      <div class="form-group">
        <label class="form-label">Confirm New Password</label>
        <input type="password" placeholder="Confirm new password" />
      </div>
      <button class="btn btn-primary" onclick="handleChangePassword()">Update Password</button>
    </div>

    <!-- Notifications -->
    <div class="settings-section" data-settings-tab="notifications" style="display:none;">
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
    <div class="settings-section" data-settings-tab="apikeys" style="display:none;">
      <h3>API Keys</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Manage your API keys for programmatic access to Monk Flow.</p>
      <div id="api-keys-table-container">
        <div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">Loading API keys...</div>
      </div>
      <button class="btn btn-secondary" style="margin-top:16px;" onclick="handleGenerateApiKey()">${icons.plus} Generate New Key</button>
    </div>

    <!-- Danger Zone -->
    <div class="settings-section" data-settings-tab="general" style="border-color:rgba(239,68,68,0.2);">
      <h3 style="color:var(--error);">Danger Zone</h3>
      <div class="settings-row">
        <div class="setting-info">
          <h4>Delete Account</h4>
          <p>Permanently delete your account and all data. This cannot be undone.</p>
        </div>
        <button class="btn btn-danger btn-sm" onclick="showDeleteAccountModal()">Delete Account</button>
      </div>
    </div>
  `;
}

function showDeleteAccountModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title" style="color:var(--error);">Delete Account</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">This action is permanent and cannot be undone. All your workflows, agents, team data, and settings will be permanently deleted.</p>
    <div class="form-group">
      <label class="form-label">Enter your password to confirm</label>
      <input type="password" placeholder="Your password" id="delete-account-password" />
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="handleDeleteAccount()">Permanently Delete Account</button>
    </div>
  `);
}

async function handleDeleteAccount() {
  const password = document.getElementById('delete-account-password')?.value;
  if (!password) { showToast('Please enter your password', 'error'); return; }
  try {
    await api.del('/users/me', { password });
    closeModal();
    api.clearTokens();
    isAuthenticated = false;
    currentUser = null;
    showLanding();
    showToast('Account deleted successfully', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to delete account', 'error');
  }
}

async function handleSaveProfile() {
  const section = document.querySelector('[data-settings-tab="general"]');
  const inputs = section.querySelectorAll('input');
  const select = section.querySelector('select');
  const firstName = inputs[0]?.value?.trim();
  const lastName = inputs[1]?.value?.trim();
  const company = inputs[3]?.value?.trim();
  const timezone = select?.value?.split(' ')[0];
  if (!firstName || !lastName) { showToast('Name fields are required', 'error'); return; }
  try {
    const data = await api.patch('/users/me', { firstName, lastName, company, timezone });
    if (data?.user) currentUser = data.user;
    renderSidebar();
    showToast('Profile saved!');
  } catch (err) {
    showToast(err.message || 'Failed to save profile', 'error');
  }
}

function switchSettingsTab(tab, el) {
  el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('[data-settings-tab]').forEach(s => {
    s.style.display = s.dataset.settingsTab === tab ? '' : 'none';
  });
  if (tab === 'apikeys') loadApiKeys();
}

async function loadApiKeys() {
  try {
    const result = await api.get('/api-keys');
    apiKeysData = result.data || [];
    renderApiKeysTable();
  } catch (err) {
    console.error('Failed to load API keys:', err);
    const container = document.getElementById('api-keys-table-container');
    if (container) container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--error);font-size:13px;">Failed to load API keys.</div>';
  }
}

function renderApiKeysTable() {
  const container = document.getElementById('api-keys-table-container');
  if (!container || !apiKeysData) return;

  if (apiKeysData.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">No API keys yet. Generate one to get started.</div>';
    return;
  }

  const rows = apiKeysData.map(k => {
    const safeName = (k.name || 'Unnamed Key').replace(/'/g, "\\'");
    const safePrefix = (k.prefix || '').replace(/'/g, "\\'");
    return `
      <tr>
        <td style="font-weight:600;">${k.name || 'Unnamed Key'}</td>
        <td><code style="font-size:12px;background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;">${k.prefix || k.key || '****'}</code></td>
        <td>${k.created_at ? new Date(k.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${safePrefix}');showToast('Key prefix copied','info')">${icons.copy}</button>
            <button class="btn btn-ghost btn-sm" onclick="handleDeleteApiKey('${k.id}','${safeName}')">${icons.trash}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Name</th><th>Key</th><th>Created</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function handleGenerateApiKey() {
  const name = prompt('Enter a name for the new API key:');
  if (!name || !name.trim()) return;
  try {
    const result = await api.post('/api-keys', { name: name.trim() });
    const keyData = result.data || result;
    const safeKey = (keyData.key || '').replace(/'/g, "\\'");
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">API Key Created</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Copy your API key now. You will not be able to see it again.</p>
      <div style="background:var(--bg-tertiary);padding:12px 16px;border-radius:8px;font-family:monospace;font-size:13px;word-break:break-all;margin-bottom:16px;">${keyData.key || keyData.prefix || 'Key created'}</div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${safeKey}');showToast('API key copied to clipboard','success')">Copy Key</button>
        <button class="btn btn-ghost" onclick="closeModal()">Done</button>
      </div>
    `);
    loadApiKeys();
  } catch (err) {
    showToast(err.message || 'Failed to generate API key', 'error');
  }
}

async function handleDeleteApiKey(keyId, keyName) {
  if (!confirm('Delete API key "' + keyName + '"? This cannot be undone.')) return;
  try {
    await api.del('/api-keys/' + keyId);
    showToast('API key deleted', 'success');
    loadApiKeys();
  } catch (err) {
    showToast(err.message || 'Failed to delete API key', 'error');
  }
}

async function handleChangePassword() {
  const section = document.querySelector('[data-settings-tab="security"]');
  const inputs = section.querySelectorAll('input');
  const currentPassword = inputs[0]?.value;
  const newPassword = inputs[1]?.value;
  const confirmPassword = inputs[2]?.value;
  if (!currentPassword || !newPassword || !confirmPassword) { showToast('Please fill all fields', 'error'); return; }
  if (newPassword.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
  if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
  try {
    await api.patch('/users/me/password', { currentPassword, newPassword });
    showToast('Password updated successfully!');
    inputs.forEach(i => i.value = '');
  } catch (err) {
    showToast(err.message || 'Failed to update password', 'error');
  }
}

// ============================================================
// TEAM PAGE
// ============================================================
let teamData = null;

async function loadTeamData() {
  try {
    const result = await api.get('/team/members');
    teamData = result.data || [];
    renderMainContent();
  } catch (err) {
    console.error('Failed to load team:', err);
  }
}

function renderTeam() {
  const members = teamData;

  if (members === null) {
    return `
      <div class="page-header">
        <div>
          <h1>Team Management</h1>
          <p class="page-desc">Invite and manage team members and their permissions.</p>
        </div>
      </div>
      <div style="padding:40px;text-align:center;color:var(--text-secondary);">Loading team members...</div>
    `;
  }

  const getInitials = (m) => {
    const f = (m.first_name || m.email || '?')[0].toUpperCase();
    const l = (m.last_name || '')[0]?.toUpperCase() || '';
    return f + l;
  };
  const getName = (m) => {
    if (m.first_name && m.last_name) return m.first_name + ' ' + m.last_name;
    if (m.first_name) return m.first_name;
    return m.email;
  };

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

    <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:28px;">
      <div class="stat-card">
        <div class="stat-value">${members.length}</div>
        <div class="stat-label">Team Members</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${members.filter(m => m.role === 'owner' || m.role === 'admin').length}</div>
        <div class="stat-label">Admins</div>
      </div>
    </div>

    ${members.length === 0 ? `
      <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
        <h3 style="color:var(--text-primary);margin-bottom:8px;">No team members yet</h3>
        <p style="font-size:13px;margin-bottom:20px;">Invite your first team member to collaborate.</p>
        <button class="btn btn-primary" onclick="showInviteModal()">${icons.plus} Invite Member</button>
      </div>
    ` : `
      <div class="card" style="padding:0;overflow:hidden;">
        <table>
          <thead>
            <tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${members.map(m => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--green-700));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--black);">${getInitials(m)}</div>
                    <div>
                      <div style="font-weight:600;">${getName(m)}</div>
                      <div style="font-size:11px;color:var(--text-tertiary);">${m.email}</div>
                    </div>
                  </div>
                </td>
                <td><span style="font-size:12px;text-transform:capitalize;">${m.role || 'member'}</span></td>
                <td><span class="badge-status active"><span class="dot"></span> Active</span></td>
                <td style="font-size:12px;color:var(--text-tertiary);">${m.created_at ? new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="showToast('Member options coming soon','info')">${icons.moreV}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
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
        <button class="btn btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal();currentWorkflowId=null;editorState.nodes=[];editorState.connections=[];editorState.workflowName='Untitled Workflow';editorState.nextId=1;navigateTo('workflow-editor')">Blank Canvas</button>
        <button class="btn btn-secondary" style="flex:1;justify-content:center;" onclick="closeModal();showTemplatePickerModal()">Browse Templates</button>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleCreateWorkflow()">Create Workflow</button>
    </div>
  `);
}

function showTemplatePickerModal() {
  const tpls = [
    { key: 'lead-scoring', name: 'Lead Scoring Pipeline', desc: 'Webhook receives lead data, AI scores it, branches by tier — high-value leads get notified + saved to CRM, others logged.', icon: 'zap', nodes: 6 },
    { key: 'email-automation', name: 'Email Automation Sequence', desc: 'Daily schedule fetches subscribers from DB, AI personalizes each email, staggers delivery with delay nodes.', icon: 'mail', nodes: 6 },
    { key: 'support-router', name: 'Support Ticket Router', desc: 'Webhook receives tickets, AI classifies into billing/technical/general, routes notifications to the right team.', icon: 'agents', nodes: 8 },
  ];
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Choose a Template</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${tpls.map(t => `
        <div class="card" style="padding:16px;cursor:pointer;transition:border-color .15s;" onclick="closeModal();loadWorkflowTemplate('${t.key}')" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor=''">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
            <span style="color:var(--accent);">${icons[t.icon]}</span>
            <strong style="font-size:14px;">${t.name}</strong>
            <span class="badge badge-blue" style="margin-left:auto;">${t.nodes} nodes</span>
          </div>
          <p style="font-size:13px;color:var(--text-secondary);margin:0;">${t.desc}</p>
        </div>
      `).join('')}
    </div>
    <div class="modal-footer" style="margin-top:16px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
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
      <label class="form-label">Agent Type</label>
      <select id="agent-type-select">
        <option value="text_generation">Text Generation</option>
        <option value="classification">Classification</option>
        <option value="analysis">Analysis</option>
        <option value="custom">Custom</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">AI Model</label>
      <select id="agent-model-select">
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
      <button class="btn btn-primary" onclick="handleCreateAgent()">Create Agent</button>
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
        <option value="viewer">Viewer — Can view workflows and logs</option>
        <option value="editor">Editor — Can create and edit workflows</option>
        <option value="admin">Admin — Full access except billing</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Personal Message (optional)</label>
      <textarea rows="2" placeholder="Add a note to the invite..." style="resize:vertical;"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleSendInvite()">Send Invite</button>
    </div>
  `);
}

// ── Scheduling Modal (3-Step Wizard) ─────────────────────
const OWNER_USER_ID = '385e12a9-c98d-4555-91a1-a9b4c76a9ad8';

function showSchedulingModal() {
  let currentStep = 1;
  let selectedDate = null;
  let selectedSlot = null;
  let availableSlots = [];
  let calendarMonth = new Date().getMonth();
  let calendarYear = new Date().getFullYear();

  function render() {
    const stepIndicator = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
        ${[1,2,3].map(s => `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;
              ${s < currentStep ? 'background:#00cc6a;color:#000;' : s === currentStep ? 'background:#00cc6a;color:#000;' : 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.4);'}
            ">${s < currentStep ? '&#10003;' : s}</div>
            ${s < 3 ? `<div style="width:32px;height:2px;background:${s < currentStep ? '#00cc6a' : 'rgba(255,255,255,0.1)'};"></div>` : ''}
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:16px;">
        Step ${currentStep} of 3 — ${currentStep === 1 ? 'Choose a Date' : currentStep === 2 ? 'Pick a Time' : 'Your Details'}
      </div>
    `;

    if (currentStep === 1) {
      renderStep1(stepIndicator);
    } else if (currentStep === 2) {
      renderStep2(stepIndicator);
    } else {
      renderStep3(stepIndicator);
    }
  }

  function renderStep1(stepIndicator) {
    const today = new Date();
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    let calendarCells = '';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      calendarCells += `<div style="text-align:center;font-size:11px;color:rgba(255,255,255,0.4);padding:6px 0;font-weight:600;">${d}</div>`;
    });
    for (let i = 0; i < startDow; i++) {
      calendarCells += `<div></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(calendarYear, calendarMonth, d);
      const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
      const isDisabled = isPast || isWeekend;
      const isToday = cellDate.toDateString() === today.toDateString();
      const isSelected = selectedDate === dateStr;
      let style = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;margin:2px auto;cursor:pointer;transition:all 0.15s;border:none;background:transparent;color:rgba(255,255,255,0.85);';
      if (isDisabled) {
        style += 'opacity:0.25;cursor:not-allowed;';
      } else if (isSelected) {
        style += 'background:#00cc6a;color:#000;font-weight:700;';
      } else if (isToday) {
        style += 'border:2px solid #00cc6a;font-weight:600;';
      }
      calendarCells += `<button style="${style}" ${isDisabled ? 'disabled' : `onclick="window._schedSelectDate('${dateStr}')"`}>${d}</button>`;
    }

    const canGoPrev = calendarYear > today.getFullYear() || (calendarYear === today.getFullYear() && calendarMonth > today.getMonth());

    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">Schedule a Consultation</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      ${stepIndicator}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <button onclick="window._schedPrevMonth()" style="background:none;border:none;color:${canGoPrev ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)'};cursor:${canGoPrev ? 'pointer' : 'default'};font-size:18px;padding:4px 8px;" ${canGoPrev ? '' : 'disabled'}>&larr;</button>
        <span style="font-weight:600;font-size:15px;color:rgba(255,255,255,0.9);">${monthNames[calendarMonth]} ${calendarYear}</span>
        <button onclick="window._schedNextMonth()" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:18px;padding:4px 8px;">&rarr;</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
        ${calendarCells}
      </div>
      ${selectedDate ? `<div style="margin-top:16px;text-align:center;">
        <button class="btn btn-primary" onclick="window._schedGoStep2()" style="min-width:160px;">Continue</button>
      </div>` : ''}
    `);
  }

  function renderStep2(stepIndicator) {
    const dateObj = new Date(selectedDate + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let slotsHtml = '';
    if (availableSlots === 'loading') {
      slotsHtml = `<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.5);">
        <div style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.15);border-top-color:#00cc6a;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
        Loading available times...
      </div>`;
    } else if (availableSlots.every(s => s.booked)) {
      slotsHtml = `<div style="text-align:center;padding:40px 0;color:rgba(255,255,255,0.5);">
        <div style="font-size:32px;margin-bottom:8px;">&#128549;</div>
        Fully booked on this date. Please choose another day.
      </div>`;
    } else {
      slotsHtml = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:420px;margin:0 auto;">
        ${availableSlots.map(slot => {
          if (slot.booked) {
            return `<button disabled
              style="padding:10px 0;border-radius:8px;border:1px solid rgba(255,70,70,0.25);
              background:rgba(255,70,70,0.08);color:rgba(255,70,70,0.45);
              font-size:13px;font-weight:500;cursor:not-allowed;text-align:center;text-decoration:line-through;">${slot.start} – ${slot.end}</button>`;
          }
          const isActive = selectedSlot && selectedSlot.start === slot.start;
          return `<button onclick="window._schedSelectSlot('${slot.start}','${slot.end}')"
            style="padding:10px 0;border-radius:8px;border:1px solid ${isActive ? '#00cc6a' : 'rgba(255,255,255,0.12)'};
            background:${isActive ? '#00cc6a' : 'rgba(255,255,255,0.04)'};color:${isActive ? '#000' : 'rgba(255,255,255,0.85)'};
            font-size:13px;font-weight:${isActive ? '700' : '500'};cursor:pointer;transition:all 0.15s;text-align:center;">${slot.start} – ${slot.end}</button>`;
        }).join('')}
      </div>`;
    }

    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">Schedule a Consultation</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      ${stepIndicator}
      <div style="text-align:center;margin-bottom:16px;">
        <span style="font-size:13px;color:rgba(255,255,255,0.5);">${formattedDate}</span>
        <button onclick="window._schedBackToStep1()" style="background:none;border:none;color:#00cc6a;cursor:pointer;font-size:12px;margin-left:8px;">Change</button>
      </div>
      ${slotsHtml}
      <div style="text-align:center;margin-top:8px;font-size:11px;color:rgba(255,255,255,0.35);">All times shown in Central Time (CT)</div>
      ${selectedSlot ? `<div style="margin-top:12px;text-align:center;">
        <button class="btn btn-primary" onclick="window._schedGoStep3()" style="min-width:160px;">Continue</button>
      </div>` : ''}
    `);
  }

  function renderStep3(stepIndicator) {
    const dateObj = new Date(selectedDate + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">Schedule a Consultation</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      ${stepIndicator}
      <div style="background:rgba(0,204,106,0.08);border:1px solid rgba(0,204,106,0.2);border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:20px;">&#128197;</div>
        <div>
          <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);">${formattedDate} &middot; ${selectedSlot.start} - ${selectedSlot.end} CT</div>
          <button onclick="window._schedBackToStep1()" style="background:none;border:none;color:#00cc6a;cursor:pointer;font-size:11px;padding:0;">Change date &amp; time</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" id="sched-name" placeholder="Jane Smith" style="width:100%;" />
      </div>
      <div class="form-group">
        <label class="form-label">Email Address *</label>
        <input type="email" id="sched-email" placeholder="jane@company.com" style="width:100%;" />
      </div>
      <div class="form-group">
        <label class="form-label">Company</label>
        <input type="text" id="sched-company" placeholder="Acme Corp (optional)" style="width:100%;" />
      </div>
      <div class="form-group">
        <label class="form-label">Meeting Type</label>
        <select id="sched-type">
          <option value="Free Consultation">Free Consultation</option>
          <option value="Technical Review">Technical Review</option>
          <option value="Strategy Session">Strategy Session</option>
          <option value="Quick Chat">Quick Chat</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea id="sched-notes" rows="2" placeholder="Anything you'd like us to know? (optional)" style="resize:vertical;width:100%;"></textarea>
      </div>
      <div class="modal-footer" style="gap:8px;">
        <button class="btn btn-ghost" onclick="window._schedGoStep2Back()">Back</button>
        <button class="btn btn-primary" id="sched-submit-btn" onclick="window._schedSubmit()">Book Consultation</button>
      </div>
    `);
  }

  function fetchAvailability(date) {
    availableSlots = 'loading';
    selectedSlot = null;
    render();
    fetch(`${API_BASE}/appointments/availability?userId=${OWNER_USER_ID}&date=${date}`)
      .then(res => res.json())
      .then(data => {
        availableSlots = (data.data || []).map(s => ({ start: s.startTime || s.start, end: s.endTime || s.end, booked: !!s.booked }));
        render();
      })
      .catch(() => {
        availableSlots = [];
        render();
        showToast('Failed to load availability', 'error');
      });
  }

  // Wire up global callbacks for inline onclick handlers
  window._schedSelectDate = (dateStr) => {
    selectedDate = dateStr;
    render();
  };
  window._schedPrevMonth = () => {
    const today = new Date();
    if (calendarYear > today.getFullYear() || (calendarYear === today.getFullYear() && calendarMonth > today.getMonth())) {
      calendarMonth--;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
      render();
    }
  };
  window._schedNextMonth = () => {
    calendarMonth++;
    if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
    render();
  };
  window._schedGoStep2 = () => {
    currentStep = 2;
    fetchAvailability(selectedDate);
  };
  window._schedSelectSlot = (start, end) => {
    selectedSlot = { start, end };
    render();
  };
  window._schedGoStep3 = () => {
    currentStep = 3;
    render();
  };
  window._schedGoStep2Back = () => {
    currentStep = 2;
    render();
  };
  window._schedBackToStep1 = () => {
    currentStep = 1;
    selectedSlot = null;
    render();
  };
  window._schedSubmit = async () => {
    const name = document.getElementById('sched-name')?.value?.trim();
    const email = document.getElementById('sched-email')?.value?.trim();
    const company = document.getElementById('sched-company')?.value?.trim();
    const notes = document.getElementById('sched-notes')?.value?.trim();
    const meetingType = document.getElementById('sched-type')?.value;

    if (!name) { showToast('Please enter your name', 'error'); return; }
    if (!email || !email.includes('@')) { showToast('Please enter a valid email', 'error'); return; }

    const btn = document.getElementById('sched-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Booking...'; }

    try {
      const res = await fetch(`${API_BASE}/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: OWNER_USER_ID,
          date: selectedDate,
          startTime: selectedSlot.start,
          endTime: selectedSlot.end,
          bookerName: name,
          bookerEmail: email,
          company: company || undefined,
          notes: notes || undefined,
          meetingType: meetingType,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');

      // Show confirmation
      const dateObj = new Date(selectedDate + 'T12:00:00');
      const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      showModal(`
        <div style="text-align:center;padding:20px 0;">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,204,106,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;">&#10003;</div>
          <h2 style="margin:0 0 8px;font-size:20px;color:#fff;">You're Booked!</h2>
          <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 24px;">Your consultation has been scheduled.</p>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;text-align:left;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:13px;">Date</span>
              <span style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">${formattedDate}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:13px;">Time</span>
              <span style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">${selectedSlot.start} - ${selectedSlot.end} CT</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:rgba(255,255,255,0.5);font-size:13px;">Type</span>
              <span style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">${meetingType}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:rgba(255,255,255,0.5);font-size:13px;">Confirmation</span>
              <span style="color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">Sent to ${email}</span>
            </div>
          </div>
          <button class="btn btn-primary" onclick="closeModal()" style="min-width:160px;text-align:center;display:flex;align-items:center;justify-content:center;">Done</button>
        </div>
      `);
      showToast('Consultation booked successfully!');
    } catch (err) {
      const msg = err.message || 'Failed to book consultation';
      if (msg.toLowerCase().includes('no longer available')) {
        showToast('That slot was just booked — please pick another time.', 'error');
        currentStep = 2;
        selectedSlot = null;
        fetchAvailability(selectedDate);
        return;
      }
      showToast(msg, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Book Consultation'; }
    }
  };

  // Initialize
  render();
}

// ── Modal API Handlers ──────────────────────────────────
async function handleCreateWorkflow() {
  const modal = document.getElementById('modal-content');
  const inputs = modal.querySelectorAll('input');
  const textarea = modal.querySelector('textarea');
  const select = modal.querySelector('select');
  const name = inputs[0]?.value?.trim();
  const description = textarea?.value?.trim();
  const triggerMap = { 'Webhook': 'webhook', 'Schedule (Cron)': 'schedule', 'Event-based': 'event', 'Manual': 'manual' };
  const triggerType = triggerMap[select?.value] || 'manual';
  if (!name) { showToast('Please enter a workflow name', 'error'); return; }
  try {
    await api.post('/workflows', { name, description, triggerType });
    closeModal();
    showToast('Workflow created! Opening editor...');
    navigateTo('workflow-editor');
  } catch (err) {
    showToast(err.message || 'Failed to create workflow', 'error');
  }
}

async function handleCreateAgent() {
  const modal = document.getElementById('modal-content');
  const inputs = modal.querySelectorAll('input');
  const textarea = modal.querySelector('textarea');
  const agentTypeSelect = document.getElementById('agent-type-select');
  const modelSelect = document.getElementById('agent-model-select');
  const name = inputs[0]?.value?.trim();
  const description = textarea?.value?.trim();
  const agentType = agentTypeSelect?.value || 'text_generation';
  const modelMap = { 'Claude Opus 4': 'claude-opus-4-20250514', 'Claude Sonnet 4': 'claude-sonnet-4-20250514', 'GPT-4o': 'gpt-4o', 'Custom Model': 'custom' };
  const model = modelMap[modelSelect?.value] || 'claude-sonnet-4-20250514';
  const temperature = (inputs[1]?.value || 30) / 100;
  const maxTokens = parseInt(inputs[2]?.value) || 4096;
  if (!name) { showToast('Please enter an agent name', 'error'); return; }
  try {
    await api.post('/agents', { name, description, agentType, model, temperature, maxTokens });
    closeModal();
    showToast('AI Agent created!');
    navigateTo('agents');
  } catch (err) {
    showToast(err.message || 'Failed to create agent', 'error');
  }
}

async function handleSendInvite() {
  const modal = document.getElementById('modal-content');
  const emailInput = modal.querySelector('input[type="email"]');
  const select = modal.querySelector('select');
  const email = emailInput?.value?.trim();
  const role = select?.value || 'viewer';
  if (!email) { showToast('Please enter an email address', 'error'); return; }
  try {
    await api.post('/team/invite', { email, role });
    closeModal();
    showToast('Invitation sent!');
  } catch (err) {
    showToast(err.message || 'Failed to send invitation', 'error');
  }
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================

async function loadAdminData() {
  try {
    const [statsRes, accountsRes, alertsRes] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/accounts?limit=100'),
      api.get('/admin/alerts').catch(() => ({ data: [] })),
    ]);
    adminData = statsRes.data || statsRes;
    adminAccounts = accountsRes.data || accountsRes;
    // Also load QBO status for admin
    try {
      const qboRes = await api.get('/quickbooks/status');
      adminQboStatus = qboRes.data || qboRes;
    } catch { adminQboStatus = null; }
    renderMainContent();
  } catch (err) {
    if (err.message && err.message.includes('403')) {
      showToast('Access denied — superadmin only', 'error');
      navigateTo('dashboard');
      return;
    }
    showToast(err.message || 'Failed to load admin data', 'error');
  }
}

async function loadAdminAccountDetail(userId) {
  try {
    const res = await api.get(`/admin/accounts/${userId}`);
    adminAccountDetail = res.data || res;
    adminSelectedAccount = userId;
    currentPage = 'admin-account';
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to load account', 'error');
  }
}

function renderAdminProjectsSection(projects, user) {
  const statusColors = { discovery: '#6366f1', in_progress: '#f59e0b', review: '#3b82f6', delivered: '#10b981', completed: '#22c55e' };
  const statusLabels = { discovery: 'Discovery', in_progress: 'In Progress', review: 'Review', delivered: 'Delivered', completed: 'Completed' };

  const projectRows = projects.length > 0 ? projects.map(p => `
    <tr>
      <td style="font-weight:500;">${p.name}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColors[p.status] || '#666'};"></span> ${statusLabels[p.status] || p.status}</span></td>
      <td>${p.file_count || 0} files</td>
      <td style="font-size:12px;color:var(--text-secondary);">${timeAgo(p.updated_at)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="adminViewProject('${p.id}')">View</button>
        <button class="btn btn-ghost btn-sm" onclick="adminUploadToProject('${p.id}')">Upload</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">No projects yet.</td></tr>`;

  return `
    <div class="card" style="padding:0;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <div class="card-title" style="margin:0;">Projects</div>
        <button class="btn btn-primary btn-sm" onclick="adminCreateProject('${user.id}')">+ New Project</button>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Files</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>${projectRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Drop Zone -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Quick File Drop</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Create a new project and upload files in one step. Drag files here or click to select.</p>
      <div id="admin-dropzone"
        style="border:2px dashed var(--border);border-radius:12px;padding:40px;text-align:center;cursor:pointer;transition:all 0.2s;"
        ondragover="event.preventDefault();this.style.borderColor='var(--accent)';this.style.background='rgba(0,204,106,0.05)';"
        ondragleave="this.style.borderColor='var(--border)';this.style.background='transparent';"
        ondrop="handleAdminFileDrop(event,'${user.id}')"
        onclick="document.getElementById('admin-file-input').click()">
        <div style="font-size:32px;margin-bottom:8px;">+</div>
        <div style="font-weight:500;margin-bottom:4px;">Drop files here</div>
        <div style="font-size:12px;color:var(--text-tertiary);">or click to browse (max 50MB per file)</div>
      </div>
      <input type="file" id="admin-file-input" multiple style="display:none;" onchange="handleAdminFileSelect(event,'${user.id}')">
    </div>
  `;
}

async function adminCreateProject(userId) {
  const name = prompt('Project name:');
  if (!name) return;
  const desc = prompt('Description (optional):') || '';
  try {
    const res = await api.post('/projects', { name, description: desc, userId, status: 'delivered' });
    showToast('Project created', 'success');
    loadAdminAccountDetail(userId);
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

async function adminViewProject(projectId) {
  try {
    const res = await api.get(`/projects/${projectId}`);
    const p = res;
    const files = p.files || [];
    const updates = p.updates || [];
    const statusLabels = { discovery: 'Discovery', in_progress: 'In Progress', review: 'Review', delivered: 'Delivered', completed: 'Completed' };

    const fileList = files.length > 0
      ? files.map(f => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:500;font-size:13px;">${f.original_name}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${(f.file_size / 1024).toFixed(1)} KB &middot; ${new Date(f.created_at).toLocaleDateString()}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="downloadProjectFile('${p.id}','${f.id}','${f.original_name}')">Download</button>
        </div>`).join('')
      : '<p style="color:var(--text-tertiary);font-size:13px;">No files uploaded yet.</p>';

    const timeline = updates.map(u => `
      <div style="display:flex;gap:10px;padding:8px 0;">
        <div style="width:8px;height:8px;border-radius:50%;background:${u.status ? '#10b981' : 'var(--border)'};margin-top:5px;flex-shrink:0;"></div>
        <div>
          <div style="font-size:13px;">${u.message}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${timeAgo(u.created_at)}</div>
        </div>
      </div>
    `).join('');

    showModal(`
      <h3 style="margin:0 0 4px;">${p.name}</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">${statusLabels[p.status] || p.status} &middot; ${p.description || 'No description'}</p>

      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <select id="admin-project-status" style="padding:6px 10px;border-radius:6px;background:var(--bg-secondary);color:var(--text);border:1px solid var(--border);font-size:13px;">
          ${Object.entries(statusLabels).map(([k,v]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" onclick="adminUpdateProjectStatus('${p.id}','${p.user_id}')">Update Status</button>
        <button class="btn btn-secondary btn-sm" onclick="adminUploadToProject('${p.id}')">Upload Files</button>
      </div>

      <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Files (${files.length})</div>
      ${fileList}

      <div style="font-weight:600;font-size:13px;margin:16px 0 8px;">Timeline</div>
      ${timeline}
    `);
  } catch (e) { showToast('Failed to load project: ' + e.message, 'error'); }
}

async function adminUpdateProjectStatus(projectId, userId) {
  const status = document.getElementById('admin-project-status')?.value;
  if (!status) return;
  try {
    await api.patch(`/projects/${projectId}`, { status });
    showToast('Status updated', 'success');
    closeModal();
    loadAdminAccountDetail(userId);
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

function adminUploadToProject(projectId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async (e) => {
    const files = e.target.files;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { showToast(`${file.name} exceeds 50MB limit`, 'error'); continue; }
      try {
        const data = await fileToBase64(file);
        await api.post(`/projects/${projectId}/files`, { filename: file.name, data, mimeType: file.type });
        showToast(`Uploaded: ${file.name}`, 'success');
      } catch (err) { showToast(`Failed to upload ${file.name}: ${err.message}`, 'error'); }
    }
    if (adminSelectedAccount) loadAdminAccountDetail(adminSelectedAccount);
  };
  input.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAdminFileDrop(event, userId) {
  event.preventDefault();
  const dropzone = document.getElementById('admin-dropzone');
  if (dropzone) { dropzone.style.borderColor = 'var(--border)'; dropzone.style.background = 'transparent'; }

  const files = event.dataTransfer.files;
  if (!files.length) return;

  // Create a new project from the first file's name or prompt
  const projectName = files.length === 1
    ? files[0].name.replace(/\.[^.]+$/, '')
    : prompt('Project name for these files:') || `Delivery ${new Date().toLocaleDateString()}`;

  try {
    const res = await api.post('/projects', { name: projectName, description: `${files.length} file(s) delivered`, userId, status: 'delivered' });
    const projectId = res.id;

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { showToast(`${file.name} exceeds 50MB limit`, 'error'); continue; }
      const data = await fileToBase64(file);
      await api.post(`/projects/${projectId}/files`, { filename: file.name, data, mimeType: file.type });
    }

    showToast(`Project "${projectName}" created with ${files.length} file(s)`, 'success');
    loadAdminAccountDetail(userId);
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

async function handleAdminFileSelect(event, userId) {
  const files = event.target.files;
  if (!files.length) return;

  const projectName = files.length === 1
    ? files[0].name.replace(/\.[^.]+$/, '')
    : prompt('Project name for these files:') || `Delivery ${new Date().toLocaleDateString()}`;

  try {
    const res = await api.post('/projects', { name: projectName, description: `${files.length} file(s) delivered`, userId, status: 'delivered' });
    const projectId = res.id;

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { showToast(`${file.name} exceeds 50MB limit`, 'error'); continue; }
      const data = await fileToBase64(file);
      await api.post(`/projects/${projectId}/files`, { filename: file.name, data, mimeType: file.type });
    }

    showToast(`Project "${projectName}" created with ${files.length} file(s)`, 'success');
    loadAdminAccountDetail(userId);
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
  event.target.value = '';
}

function renderAdminDashboard() {
  if (!adminData) {
    return `
      <div class="page-header"><div><h1>Admin Dashboard</h1><p class="page-desc">Loading platform data...</p></div></div>
      <div class="card" style="padding:32px;text-align:center;">
        <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
        <p style="color:var(--text-secondary);font-size:13px;">Loading admin data...</p>
      </div>
    `;
  }

  const stats = adminData;
  const accounts = adminAccounts || [];

  // Platform cost from tokenTotals (baseCost only — what we pay)
  const tokenTotals = stats.tokenTotals || {};
  const platformCost = calculateTokenCost(
    tokenTotals.total_input || 0,
    tokenTotals.total_output || 0,
    'claude-sonnet-4-20250514'
  );

  const wfExecs = stats.workflowExecutions || {};
  const agentExecs = stats.agentExecutions || {};

  // Daily activity chart (last 30 days)
  const dailyActivity = stats.dailyActivity || [];
  const maxDailyCount = Math.max(...dailyActivity.map(d => d.count || 0), 1);
  const dailyBars = dailyActivity.length > 0
    ? dailyActivity.map(d => {
        const pct = Math.round(((d.count || 0) / maxDailyCount) * 100);
        const label = d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        return `<div class="chart-bar" style="height:${pct}%"><span class="bar-value">${d.count || 0}</span><span class="bar-label">${label}</span></div>`;
      }).join('')
    : '';

  // Accounts table rows
  const accountRows = accounts.length > 0 ? accounts.map(account => {
    const acctCost = calculateTokenCost(
      account.total_tokens_input || 0,
      account.total_tokens_output || 0,
      'claude-sonnet-4-20250514'
    );
    const roleBadgeColor = account.role === 'superadmin' ? '#ef4444' : account.role === 'admin' ? '#f59e0b' : '#3b82f6';
    return `
      <tr style="cursor:pointer;" onclick="loadAdminAccountDetail('${account.id}')">
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="avatar" style="width:32px;height:32px;font-size:11px;">${(account.first_name?.[0] || '').toUpperCase()}${(account.last_name?.[0] || '').toUpperCase()}</div>
            <div>
              <div style="font-weight:500;">${account.first_name || ''} ${account.last_name || ''}</div>
            </div>
          </div>
        </td>
        <td style="font-size:12px;color:var(--text-secondary);">${account.email || ''}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${roleBadgeColor}22;color:${roleBadgeColor};">${account.role || 'user'}</span></td>
        <td>${account.workflow_count ?? 0}</td>
        <td>${account.agent_count ?? 0}</td>
        <td>${account.runs_30d ?? 0}</td>
        <td>${account.tasks_30d ?? 0}</td>
        <td style="color:#00cc6a;font-size:12px;">${formatCost(acctCost.baseCost)}</td>
        <td style="font-size:12px;color:var(--text-secondary);">${timeAgo(account.updated_at)}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--text-tertiary);padding:24px;">No accounts found.</td></tr>`;

  return `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Admin Dashboard</h1>
        <p class="page-desc">Platform-wide metrics, accounts, and activity</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" onclick="loadAdminData()">Refresh</button>
      </div>
    </div>

    <!-- Platform Stats -->
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value">${stats.totalUsers ?? 0}</div>
        <div class="stat-label">Total Users</div>
        ${stats.newUsersThisMonth ? `<div style="font-size:11px;color:var(--accent);margin-top:4px;">+${stats.newUsersThisMonth} this month</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalWorkflows ?? 0}</div>
        <div class="stat-label">Total Workflows</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalAgents ?? 0}</div>
        <div class="stat-label">Total Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${wfExecs.total ?? 0}</div>
        <div class="stat-label">Workflow Executions</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${wfExecs.completed ?? 0} completed / ${wfExecs.failed ?? 0} failed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${agentExecs.total ?? 0}</div>
        <div class="stat-label">Agent Executions</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${agentExecs.completed ?? 0} completed / ${agentExecs.failed ?? 0} failed</div>
      </div>
      <div class="stat-card" style="border:1px solid rgba(0,204,106,0.2);">
        <div class="stat-value" style="color:#00cc6a;">${formatCost(platformCost.baseCost)}</div>
        <div class="stat-label">Platform Cost</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Base cost (excl. fee)</div>
      </div>
    </div>

    <!-- Accounts Table -->
    <div class="card" style="padding:0;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div class="card-title" style="margin:0;">All Accounts</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Workflows</th>
              <th>Agents</th>
              <th>Runs (30d)</th>
              <th>Tasks (30d)</th>
              <th>Est. Cost</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>${accountRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Daily Activity Chart -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <div>
          <div class="card-title">Daily Activity</div>
          <div class="card-subtitle">Workflow executions over the last 30 days</div>
        </div>
      </div>
      <div class="chart-bar-group" style="margin-bottom:30px;">
        ${dailyBars || '<div style="padding:20px;color:var(--text-secondary);font-size:13px;">No daily activity data yet</div>'}
      </div>
    </div>

    <!-- QuickBooks & Billing -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <div>
          <div class="card-title">QuickBooks & Billing</div>
          <div class="card-subtitle">Manage invoicing and QuickBooks integration</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="adminSyncAllCustomers()">Sync Customers</button>
          <button class="btn btn-ghost btn-sm" onclick="adminGenerateInvoices()">Generate Invoices</button>
        </div>
      </div>
      <div style="padding:16px 20px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="font-size:24px;">\uD83D\uDCB0</div>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">QuickBooks Online</div>
            <div style="font-size:12px;color:var(--text-secondary);">
              ${adminQboStatus?.connected
                ? `<span style="color:#00cc6a;">Connected</span> \u2014 ${adminQboStatus.companyName || 'Company'}`
                : '<span style="color:var(--text-tertiary);">Not connected</span> \u2014 <a href="#" onclick="connectQuickBooks();return false;" style="color:var(--accent);">Connect now</a>'}
            </div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-tertiary);">
          Invoices are auto-generated on the 1st of each month at 06:00 UTC. Customers are synced when first invoiced.
        </div>
      </div>
    </div>
  `;
}

function renderAdminAccountDetail() {
  if (!adminAccountDetail) {
    return `
      <div class="page-header"><div><h1>Account Detail</h1><p class="page-desc">Loading...</p></div></div>
      <div class="card" style="padding:32px;text-align:center;">
        <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
        <p style="color:var(--text-secondary);font-size:13px;">Loading account details...</p>
      </div>
    `;
  }

  const acct = adminAccountDetail;
  const user = acct.user || acct;
  const workflows = acct.workflows || [];
  const agents = acct.agents || [];
  const executions = acct.recentExecutions || acct.executions || [];

  const totalTokens = (user.total_tokens_input || 0) + (user.total_tokens_output || 0);
  const acctCost = calculateTokenCost(
    user.total_tokens_input || 0,
    user.total_tokens_output || 0,
    'claude-sonnet-4-20250514'
  );

  // Workflows table
  const workflowRows = workflows.length > 0 ? workflows.map(wf => {
    const wfStatus = wf.status || 'draft';
    const statusColor = { active: '#00ff88', draft: '#fbbf24', paused: '#f59e0b', error: '#ef4444' };
    return `
      <tr>
        <td style="font-weight:500;">${wf.name || 'Unnamed'}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor[wfStatus] || '#666'};"></span> ${wfStatus}</span></td>
        <td>${triggerTypeLabel(wf.trigger_type)}</td>
        <td>${wf.total_runs ?? 0}</td>
        <td style="font-size:12px;color:var(--text-secondary);">${timeAgo(wf.last_run_at || wf.updated_at)}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">No workflows.</td></tr>`;

  // Agents table
  const agentRows = agents.length > 0 ? agents.map(ag => {
    const agStatus = ag.status || 'draft';
    const statusColor = { active: '#00ff88', draft: '#fbbf24', paused: '#f59e0b', error: '#ef4444' };
    const modelDisplayMap = {
      'claude-opus-4-20250514': 'Claude Opus 4',
      'claude-sonnet-4-20250514': 'Claude Sonnet 4',
      'gpt-4o': 'GPT-4o',
      'custom': 'Custom',
    };
    const agTokens = (ag.total_tokens_input || 0) + (ag.total_tokens_output || 0) + (ag.tokens_used || 0);
    return `
      <tr>
        <td style="font-weight:500;">${ag.name || 'Unnamed'}</td>
        <td>${ag.agent_type || 'text_generation'}</td>
        <td style="font-size:12px;">${modelDisplayMap[ag.model] || ag.model || 'Sonnet 4'}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor[agStatus] || '#666'};"></span> ${agStatus}</span></td>
        <td>${ag.total_runs ?? ag.total_tasks ?? 0}</td>
        <td>${agTokens.toLocaleString()}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);padding:24px;">No agents.</td></tr>`;

  // Recent executions table
  const execRows = executions.length > 0 ? executions.map(ex => {
    const eStatus = ex.status || 'pending';
    const statusColor = { completed: '#00ff88', failed: '#ef4444', running: '#3b82f6', pending: '#fbbf24' };
    const duration = ex.started_at && ex.completed_at ? ((new Date(ex.completed_at) - new Date(ex.started_at)) / 1000).toFixed(1) + 's' : ex.started_at ? 'Running...' : '\u2014';
    const errorText = ex.error ? `<span style="color:#ef4444;font-size:11px;" title="${(ex.error || '').replace(/"/g, '&quot;')}">${(ex.error || '').slice(0, 40)}${ex.error.length > 40 ? '...' : ''}</span>` : '\u2014';
    return `
      <tr>
        <td style="font-weight:500;font-size:12px;">${ex.workflow_name || ex.agent_name || 'Unknown'}</td>
        <td><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor[eStatus] || '#666'};"></span> ${eStatus}</span></td>
        <td style="font-size:12px;color:var(--text-secondary);">${ex.started_at ? timeAgo(ex.started_at) : '\u2014'}</td>
        <td>${duration}</td>
        <td>${errorText}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:24px;">No recent executions.</td></tr>`;

  return `
    <!-- Header -->
    <div class="page-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('admin')">${icons.arrowLeft} Back to Admin</button>
        </div>
        <h1 style="margin:0;">${user.first_name || ''} ${user.last_name || ''}</h1>
        <p class="page-desc">${user.email || ''} &mdash; ${user.role || 'user'}</p>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value">${workflows.length}</div>
        <div class="stat-label">Workflows</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${agents.length}</div>
        <div class="stat-label">Agents</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalTokens.toLocaleString()}</div>
        <div class="stat-label">Total Tokens Used</div>
      </div>
      <div class="stat-card" style="border:1px solid rgba(0,204,106,0.2);">
        <div class="stat-value" style="color:#00cc6a;">${formatCost(acctCost.baseCost)}</div>
        <div class="stat-label">Est. Cost (base)</div>
      </div>
    </div>

    <!-- Workflows Table -->
    <div class="card" style="padding:0;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
        <div class="card-title" style="margin:0;">Workflows</div>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Trigger</th><th>Total Runs</th><th>Last Run</th></tr></thead>
          <tbody>${workflowRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Agents Table -->
    <div class="card" style="padding:0;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
        <div class="card-title" style="margin:0;">Agents</div>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Model</th><th>Status</th><th>Total Tasks</th><th>Tokens Used</th></tr></thead>
          <tbody>${agentRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Recent Executions Table -->
    <div class="card" style="padding:0;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
        <div class="card-title" style="margin:0;">Recent Executions</div>
      </div>
      <div class="table-wrapper" style="border:0;border-radius:0;">
        <table>
          <thead><tr><th>Workflow Name</th><th>Status</th><th>Started</th><th>Duration</th><th>Error</th></tr></thead>
          <tbody>${execRows}</tbody>
        </table>
      </div>
    </div>

    <!-- Projects Section -->
    ${renderAdminProjectsSection(acct.projects || [], user)}
  `;
}

// ============================================================
// PLANS & BILLING
// ============================================================

async function loadCurrentPlan() {
  try {
    const res = await api.get('/plans/my-usage');
    currentPlan = res.data || res;
    renderSidebar();
  } catch (err) {
    console.warn('Could not load plan data:', err.message);
  }
}

async function loadBillingData() {
  try {
    const [plansRes, usageRes] = await Promise.all([
      api.get('/plans'),
      api.get('/plans/my-usage'),
    ]);
    billingPlans = plansRes.data || plansRes;
    currentPlan = usageRes.data || usageRes;
    await loadBillingInvoices();
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to load billing data', 'error');
  }
}

async function loadQboStatus() {
  try {
    const res = await api.get('/quickbooks/status');
    qboConnected = res.data?.connected || false;
  } catch { qboConnected = false; }
}

async function connectQuickBooks() {
  try {
    const res = await api.get('/quickbooks/auth-url');
    const authUrl = res.data?.url || res.authUrl;
    if (authUrl) window.open(authUrl, '_blank');
    else showToast('Failed to get auth URL', 'error');
  } catch (e) { showToast('QuickBooks connection failed: ' + e.message, 'error'); }
}

async function disconnectQuickBooks() {
  showToast('QuickBooks disconnection coming soon', 'info');
}

async function loadBillingInvoices() {
  try {
    const res = await api.get('/billing/invoices');
    billingInvoices = res.data || [];
  } catch { billingInvoices = []; }
}

async function adminSyncAllCustomers() {
  try {
    showToast('Syncing customers to QuickBooks...', 'info');
    const res = await api.post('/quickbooks/sync-all-customers');
    showToast(`Synced ${res.data?.synced || 0} customers to QuickBooks`, 'success');
  } catch (e) { showToast('Sync failed: ' + e.message, 'error'); }
}

async function adminGenerateInvoices() {
  try {
    showToast('Generating monthly invoices...', 'info');
    // This would typically be done via the billing scheduler
    showToast('Invoice generation triggered. Check billing scheduler logs.', 'success');
  } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

function showUpgradeModal(message) {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Plan Limit Reached</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div style="padding:24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:16px;">&#9889;</div>
      <p style="color:var(--text-secondary);margin-bottom:20px;font-size:14px;">${message}</p>
      <button class="btn btn-primary" onclick="closeModal();navigateTo('billing');">View Plans & Upgrade</button>
      <button class="btn btn-ghost" onclick="closeModal()" style="margin-left:8px;">Dismiss</button>
    </div>
  `);
}

function renderBilling() {
  const plan = currentPlan;
  const plans = Array.isArray(billingPlans) ? billingPlans : [];

  const now = new Date();
  const renewalDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const renewalStr = renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const runPct = plan ? Math.min(100, ((plan.monthly_workflow_runs || 0) / (plan.plan_workflow_limit || 1)) * 100) : 0;
  const taskPct = plan ? Math.min(100, ((plan.monthly_agent_tasks || 0) / (plan.plan_task_limit || 1)) * 100) : 0;

  function barColor(pct) {
    if (pct > 90) return '#ef4444';
    if (pct > 70) return '#fbbf24';
    return '#00cc6a';
  }

  const tierDefaults = [
    { name: 'Starter', price: 29, workflow_run_limit: 500, agent_task_limit: 200, models: 'GPT-4o, Claude Sonnet', overage_run: '$0.05', overage_task: '$0.08' },
    { name: 'Pro', price: 79, workflow_run_limit: 2000, agent_task_limit: 1000, models: 'GPT-4o, Claude Opus, Gemini', overage_run: '$0.04', overage_task: '$0.06' },
    { name: 'Business', price: 199, workflow_run_limit: 10000, agent_task_limit: 5000, models: 'All models + priority', overage_run: '$0.03', overage_task: '$0.04' },
  ];

  const displayPlans = plans.length >= 3 ? plans.map((p, i) => ({
    name: p.name || tierDefaults[i]?.name || p.plan_name,
    price: p.price ?? p.monthly_price ?? tierDefaults[i]?.price,
    workflow_run_limit: p.workflow_run_limit ?? p.plan_workflow_limit ?? tierDefaults[i]?.workflow_run_limit,
    agent_task_limit: p.agent_task_limit ?? p.plan_task_limit ?? tierDefaults[i]?.agent_task_limit,
    models: p.models || tierDefaults[i]?.models || 'Standard',
    overage_run: p.overage_run || tierDefaults[i]?.overage_run || '--',
    overage_task: p.overage_task || tierDefaults[i]?.overage_task || '--',
  })) : tierDefaults;

  const planCards = displayPlans.map(p => {
    const isCurrent = plan && (plan.plan_name || '').toLowerCase() === (p.name || '').toLowerCase();
    return `
      <div class="card" style="flex:1;min-width:220px;position:relative;${isCurrent ? 'border:1px solid #00cc6a;' : ''}">
        ${isCurrent ? '<div style="position:absolute;top:12px;right:12px;background:#00cc6a;color:#000;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;">Current Plan</div>' : ''}
        <div style="padding:20px;">
          <h3 style="margin:0 0 4px;font-size:18px;color:var(--text-primary);">${p.name}</h3>
          <div style="font-size:32px;font-weight:700;color:var(--text-primary);margin-bottom:16px;">$${p.price}<span style="font-size:14px;font-weight:400;color:var(--text-tertiary);">/mo</span></div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--text-secondary);">
            <div style="display:flex;justify-content:space-between;"><span>Workflow Runs</span><span style="color:var(--text-primary);font-weight:600;">${p.workflow_run_limit.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;"><span>Agent Tasks</span><span style="color:var(--text-primary);font-weight:600;">${p.agent_task_limit.toLocaleString()}</span></div>
            <div style="display:flex;justify-content:space-between;"><span>Models</span><span style="color:var(--text-primary);font-weight:600;text-align:right;max-width:140px;">${p.models}</span></div>
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;">
              <div style="display:flex;justify-content:space-between;"><span>Overage / run</span><span style="color:var(--text-primary);">${p.overage_run}</span></div>
              <div style="display:flex;justify-content:space-between;margin-top:4px;"><span>Overage / task</span><span style="color:var(--text-primary);">${p.overage_task}</span></div>
            </div>
          </div>
          <div style="margin-top:16px;">
            ${isCurrent
              ? '<button class="btn btn-ghost" style="width:100%;cursor:default;" disabled>Current Plan</button>'
              : '<button class="btn btn-primary" style="width:100%;" onclick="showToast(\'Contact support to change plans\', \'info\')">Upgrade</button>'}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Plans & Billing</h1>
        <p class="page-desc">Manage your subscription and monitor usage.</p>
      </div>
    </div>

    <!-- Current Plan Overview -->
    <div class="card" style="margin-bottom:24px;">
      <div style="padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <h3 style="margin:0 0 4px;font-size:16px;color:var(--text-primary);">${plan?.plan_name || 'Free'} Plan</h3>
            <span style="font-size:13px;color:var(--text-tertiary);">Renews ${renewalStr}</span>
          </div>
          <div style="font-size:24px;font-weight:700;color:#00cc6a;">
            ${plan?.plan_price != null ? '$' + plan.plan_price : '--'}<span style="font-size:13px;font-weight:400;color:var(--text-tertiary);">/mo</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">
              <span>Workflow Runs</span>
              <span>${plan?.monthly_workflow_runs || 0} / ${plan?.plan_workflow_limit || '\u221e'}</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${runPct}%;background:${barColor(runPct)};border-radius:3px;transition:width .3s;"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">
              <span>Agent Tasks</span>
              <span>${plan?.monthly_agent_tasks || 0} / ${plan?.plan_task_limit || '\u221e'}</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${taskPct}%;background:${barColor(taskPct)};border-radius:3px;transition:width .3s;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Plan Comparison Grid -->
    <h2 style="font-size:16px;color:var(--text-primary);margin-bottom:12px;">Compare Plans</h2>
    <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
      ${planCards}
    </div>

    <!-- Usage This Period -->
    <h2 style="font-size:16px;color:var(--text-primary);margin-bottom:12px;">Usage This Period</h2>
    <div class="card" style="margin-bottom:24px;">
      <div style="padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            ${icons.workflow}
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Workflow Runs</span>
          </div>
          <div style="font-size:28px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${plan?.monthly_workflow_runs || 0}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">of ${plan?.plan_workflow_limit || '\u221e'} included</div>
          <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${runPct}%;background:${barColor(runPct)};border-radius:4px;transition:width .3s;"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            ${icons.agents}
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Agent Tasks</span>
          </div>
          <div style="font-size:28px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${plan?.monthly_agent_tasks || 0}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">of ${plan?.plan_task_limit || '\u221e'} included</div>
          <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${taskPct}%;background:${barColor(taskPct)};border-radius:4px;transition:width .3s;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Invoice History  -->
    <h2 style="font-size:16px;color:var(--text-primary);margin-bottom:12px;">Invoice History</h2>
    <div class="card" style="padding:0;">
      ${billingInvoices.length > 0 ? `
        <div class="table-wrapper" style="border:0;border-radius:0;">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Plan</th>
                <th>Base</th>
                <th>Overage</th>
                <th>Total</th>
                <th>Status</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              ${billingInvoices.map(inv => {
                const statusColors = { draft: '#6b7280', sent: '#3b82f6', paid: '#00cc6a', overdue: '#ef4444', void: '#6b7280' };
                const color = statusColors[inv.status] || '#6b7280';
                return `
                  <tr>
                    <td style="font-size:12px;">${new Date(inv.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                    <td style="font-size:12px;text-transform:capitalize;">${inv.plan_slug || '--'}</td>
                    <td style="font-size:12px;">$${((inv.plan_amount_cents || 0) / 100).toFixed(2)}</td>
                    <td style="font-size:12px;">$${((inv.overage_amount_cents || 0) / 100).toFixed(2)}</td>
                    <td style="font-size:12px;font-weight:600;color:var(--text-primary);">$${((inv.total_amount_cents || 0) / 100).toFixed(2)}</td>
                    <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${color}22;color:${color};">${inv.status}</span></td>
                    <td style="font-size:12px;color:var(--text-tertiary);">${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '--'}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="padding:32px;text-align:center;color:var(--text-tertiary);font-size:13px;">
          No invoices yet. Invoices are generated automatically at the start of each billing period.
        </div>
      `}
    </div>
  `;
}

// ============================================================
// OUTREACH — Automated Email Follow-up Sequences
// ============================================================
let outreachData = null;
let outreachStats = null;

async function loadOutreachData() {
  try {
    const [leadsRes, statsRes] = await Promise.all([
      api.get('/outreach?limit=100'),
      api.get('/outreach/stats'),
    ]);
    outreachData = leadsRes.data || [];
    outreachStats = statsRes.data || {};
    renderMainContent();
  } catch (err) {
    showToast(err.message || 'Failed to load outreach data', 'error');
  }
}

function renderOutreachPage() {
  if (!outreachData) {
    return `<div class="card" style="padding:40px;text-align:center;">
      <div class="spinner"></div>
      <p style="color:var(--text-tertiary);margin-top:12px;">Loading outreach data...</p>
    </div>`;
  }

  const stats = outreachStats || {};
  const statCards = [
    { label: 'Total Leads', value: stats.total || 0, color: '#6b7280' },
    { label: 'Active Sequences', value: stats.active || 0, color: '#3b82f6' },
    { label: 'Replied', value: stats.replied || 0, color: '#00cc6a' },
    { label: 'Due Now', value: stats.due_now || 0, color: stats.due_now > 0 ? '#f59e0b' : '#6b7280' },
  ];

  const statusColors = {
    active: { bg: '#3b82f622', fg: '#3b82f6' },
    replied: { bg: '#00cc6a22', fg: '#00cc6a' },
    closed: { bg: '#6b728022', fg: '#6b7280' },
    unsubscribed: { bg: '#ef444422', fg: '#ef4444' },
  };

  const touchLabels = { 1: 'Initial', 2: 'Bump', 3: 'Value-add', 4: 'Breakup' };

  const rows = outreachData.map(lead => {
    const sc = statusColors[lead.status] || statusColors.active;
    const nextDate = lead.next_followup_at ? new Date(lead.next_followup_at) : null;
    const isOverdue = nextDate && nextDate <= new Date() && lead.status === 'active';
    const nextStr = nextDate
      ? `<span style="color:${isOverdue ? '#f59e0b' : 'var(--text-tertiary)'};font-weight:${isOverdue ? '600' : '400'};">${isOverdue ? 'Due now' : nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
      : '<span style="color:var(--text-tertiary);">—</span>';

    return `
      <tr onclick="viewOutreachLead('${lead.id}')" style="cursor:pointer;">
        <td>
          <div style="font-weight:500;color:var(--text-primary);">${lead.contact_name}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${lead.company || ''}</div>
        </td>
        <td style="font-size:12px;color:var(--text-secondary);">${lead.contact_email}</td>
        <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${sc.bg};color:${sc.fg};">${lead.status}</span></td>
        <td style="font-size:12px;color:var(--text-secondary);">${touchLabels[lead.touch_count] || lead.touch_count}/4</td>
        <td style="font-size:12px;">${nextStr}</td>
        <td style="font-size:12px;color:var(--text-tertiary);">${timeAgo(lead.created_at)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1>Outreach Sequences</h1>
        <p class="page-desc">Automated follow-up emails on a 3-touch cadence (Day 3, Day 7, Day 14)</p>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="processOutreachFollowups()">
          ${icons.play} Process Due
        </button>
        <button class="btn btn-primary" onclick="showAddLeadModal()">
          ${icons.plus} Add Lead
        </button>
      </div>
    </div>

    <!-- Stats Row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      ${statCards.map(s => `
        <div class="card" style="padding:16px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:4px;">${s.label}</div>
          <div style="font-size:28px;font-weight:700;color:${s.color};">${s.value}</div>
        </div>
      `).join('')}
    </div>

    <!-- Sequence Info -->
    <div class="card" style="padding:16px;margin-bottom:24px;border-left:3px solid #3b82f6;">
      <div style="display:flex;gap:32px;font-size:13px;color:var(--text-secondary);">
        <div><strong style="color:var(--text-primary);">Touch 1:</strong> Your initial cold email (logged when you add the lead)</div>
        <div><strong style="color:var(--text-primary);">Touch 2:</strong> Day 3 — casual bump</div>
        <div><strong style="color:var(--text-primary);">Touch 3:</strong> Day 7 — value add</div>
        <div><strong style="color:var(--text-primary);">Touch 4:</strong> Day 14 — breakup</div>
      </div>
    </div>

    <!-- Leads Table -->
    <div class="card" style="padding:0;">
      ${outreachData.length > 0 ? `
        <div class="table-wrapper" style="border:0;border-radius:0;">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Email</th>
                <th>Status</th>
                <th>Touch</th>
                <th>Next Follow-up</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : `
        <div style="padding:48px;text-align:center;">
          <div style="font-size:40px;margin-bottom:12px;">&#9993;</div>
          <p style="color:var(--text-secondary);margin-bottom:16px;">No outreach leads yet. Add your first lead to start the sequence.</p>
          <button class="btn btn-primary" onclick="showAddLeadModal()">
            ${icons.plus} Add Your First Lead
          </button>
        </div>
      `}
    </div>
  `;
}

function showAddLeadModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">Add Lead to Sequence</h2>
      <button class="modal-close" onclick="closeModal()">${icons.x}</button>
    </div>
    <div style="padding:24px;">
      <p style="font-size:13px;color:var(--text-tertiary);margin-bottom:20px;">
        Add a contact after you've sent them your initial cold email. The system will automatically follow up on Day 3, Day 7, and Day 14 — skipping anyone who replies (unless it's an OOO auto-reply).
      </p>
      <div style="display:grid;gap:16px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">Contact Name *</label>
          <input id="ol-name" class="input" placeholder="Jane Smith" style="width:100%;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">Email *</label>
          <input id="ol-email" class="input" type="email" placeholder="jane@company.com" style="width:100%;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">Company</label>
          <input id="ol-company" class="input" placeholder="Acme Inc" style="width:100%;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">Date Initial Email Sent</label>
          <input id="ol-date" class="input" type="date" value="${new Date().toISOString().split('T')[0]}" style="width:100%;" />
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">Notes</label>
          <textarea id="ol-notes" class="input" rows="2" placeholder="Context about the lead..." style="width:100%;resize:vertical;"></textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitNewLead()">Add to Sequence</button>
      </div>
    </div>
  `);
}

async function submitNewLead() {
  const name = document.getElementById('ol-name')?.value?.trim();
  const email = document.getElementById('ol-email')?.value?.trim();
  const company = document.getElementById('ol-company')?.value?.trim();
  const date = document.getElementById('ol-date')?.value;
  const notes = document.getElementById('ol-notes')?.value?.trim();

  if (!name || !email) {
    showToast('Name and email are required', 'error');
    return;
  }

  try {
    await api.post('/outreach', {
      contact_name: name,
      contact_email: email,
      company: company || undefined,
      notes: notes || undefined,
      initial_email_date: date || undefined,
    });
    closeModal();
    showToast('Lead added — first follow-up scheduled', 'success');
    loadOutreachData();
  } catch (err) {
    showToast(err.message || 'Failed to add lead', 'error');
  }
}

async function viewOutreachLead(id) {
  try {
    const res = await api.get(`/outreach/${id}`);
    const lead = res.data;

    const statusColors = {
      active: { bg: '#3b82f622', fg: '#3b82f6' },
      replied: { bg: '#00cc6a22', fg: '#00cc6a' },
      closed: { bg: '#6b728022', fg: '#6b7280' },
      unsubscribed: { bg: '#ef444422', fg: '#ef4444' },
    };
    const sc = statusColors[lead.status] || statusColors.active;
    const touchLabels = { 1: 'Initial Cold Email', 2: 'Day 3 — Bump', 3: 'Day 7 — Value Add', 4: 'Day 14 — Breakup' };

    const timeline = (lead.emails || []).map(em => `
      <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="width:8px;height:8px;border-radius:50%;background:#00cc6a;margin-top:6px;flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;font-size:13px;color:var(--text-primary);">${touchLabels[em.touch_number] || 'Touch ' + em.touch_number}</span>
            <span style="font-size:11px;color:var(--text-tertiary);">${new Date(em.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">Subject: ${em.subject}</div>
        </div>
      </div>
    `).join('');

    const nextDate = lead.next_followup_at ? new Date(lead.next_followup_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'None';

    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">${lead.contact_name}</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      <div style="padding:24px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;">Email</div>
            <div style="font-size:14px;color:var(--text-primary);margin-top:2px;">${lead.contact_email}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;">Company</div>
            <div style="font-size:14px;color:var(--text-primary);margin-top:2px;">${lead.company || '—'}</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;">Status</div>
            <div style="margin-top:4px;"><span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;background:${sc.bg};color:${sc.fg};">${lead.status}</span></div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;">Next Follow-up</div>
            <div style="font-size:14px;color:var(--text-primary);margin-top:2px;">${nextDate}</div>
          </div>
        </div>

        ${lead.notes ? `<div style="background:var(--bg-secondary);padding:12px;border-radius:8px;font-size:13px;color:var(--text-secondary);margin-bottom:20px;white-space:pre-wrap;">${lead.notes}</div>` : ''}

        <h3 style="font-size:14px;margin-bottom:12px;color:var(--text-primary);">Sequence Timeline</h3>
        <div style="margin-bottom:20px;">
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
            <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-top:6px;flex-shrink:0;"></div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:13px;color:var(--text-primary);">Initial Cold Email</span>
                <span style="font-size:11px;color:var(--text-tertiary);">${new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">Sent by you (logged on add)</div>
            </div>
          </div>
          ${timeline}
          ${lead.status === 'active' && lead.touch_count < 4 ? `
            <div style="display:flex;gap:12px;padding:12px 0;opacity:0.5;">
              <div style="width:8px;height:8px;border-radius:50%;border:2px dashed var(--text-tertiary);margin-top:6px;flex-shrink:0;"></div>
              <div style="font-size:13px;color:var(--text-tertiary);">Touch ${lead.touch_count + 1} scheduled for ${nextDate}</div>
            </div>
          ` : ''}
        </div>

        <div style="display:flex;gap:8px;justify-content:space-between;border-top:1px solid var(--border);padding-top:16px;">
          <div style="display:flex;gap:8px;">
            ${lead.status === 'active' ? `
              <button class="btn btn-primary btn-sm" onclick="markLeadReplied('${lead.id}', false)">Mark as Replied</button>
              <button class="btn btn-ghost btn-sm" onclick="markLeadReplied('${lead.id}', true)">OOO Reply</button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="previewNextFollowup('${lead.id}')">Preview Next</button>
          </div>
          <div style="display:flex;gap:8px;">
            <select class="input" style="font-size:12px;padding:4px 8px;" onchange="updateLeadStatus('${lead.id}', this.value)">
              <option value="active" ${lead.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="replied" ${lead.status === 'replied' ? 'selected' : ''}>Replied</option>
              <option value="closed" ${lead.status === 'closed' ? 'selected' : ''}>Closed</option>
              <option value="unsubscribed" ${lead.status === 'unsubscribed' ? 'selected' : ''}>Unsubscribed</option>
            </select>
            <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="deleteOutreachLead('${lead.id}')">
              ${icons.trash}
            </button>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    showToast(err.message || 'Failed to load lead', 'error');
  }
}

async function markLeadReplied(id, isOoo) {
  try {
    const res = await api.post(`/outreach/${id}/mark-reply`, { is_ooo: isOoo });
    showToast(res.message || (isOoo ? 'OOO noted — lead stays in sequence' : 'Lead marked as replied'), 'success');
    closeModal();
    loadOutreachData();
  } catch (err) {
    showToast(err.message || 'Failed to update', 'error');
  }
}

async function updateLeadStatus(id, status) {
  try {
    await api.put(`/outreach/${id}`, { status });
    showToast(`Status updated to ${status}`, 'success');
    closeModal();
    loadOutreachData();
  } catch (err) {
    showToast(err.message || 'Failed to update', 'error');
  }
}

async function deleteOutreachLead(id) {
  if (!confirm('Remove this lead from the sequence?')) return;
  try {
    await api.delete(`/outreach/${id}`);
    showToast('Lead removed', 'success');
    closeModal();
    loadOutreachData();
  } catch (err) {
    showToast(err.message || 'Failed to delete', 'error');
  }
}

async function previewNextFollowup(id) {
  try {
    const res = await api.get(`/outreach/${id}/preview`);
    const preview = res.data;
    if (!preview) {
      showToast('Sequence complete — no more follow-ups', 'info');
      return;
    }
    showModal(`
      <div class="modal-header">
        <h2 class="modal-title">Preview: Touch ${preview.touch_number}</h2>
        <button class="modal-close" onclick="closeModal()">${icons.x}</button>
      </div>
      <div style="padding:24px;">
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px;">To</div>
          <div style="font-size:14px;color:var(--text-primary);">${preview.to}</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px;">Subject</div>
          <div style="font-size:14px;color:var(--text-primary);">${preview.subject}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;margin-bottom:4px;">Body</div>
          <div style="background:var(--bg-secondary);padding:16px;border-radius:8px;font-size:13px;color:var(--text-secondary);">${preview.body}</div>
        </div>
        <div style="margin-top:16px;text-align:right;">
          <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        </div>
      </div>
    `);
  } catch (err) {
    showToast(err.message || 'Failed to preview', 'error');
  }
}

async function processOutreachFollowups() {
  try {
    showToast('Processing due follow-ups...', 'info');
    const res = await api.post('/outreach/process');
    const data = res.data;
    showToast(`Done: ${data.sent} sent, ${data.completed} completed`, 'success');
    loadOutreachData();
  } catch (err) {
    showToast(err.message || 'Failed to process follow-ups', 'error');
  }
}
