// Auto-refresh dashboard every 10 seconds
const REFRESH_MS = 10000;
let equityChart = null;
let drawdownChart = null;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'equity') refreshEquity();
    if (tab.dataset.tab === 'logs') refreshLogs();
  });
});

function fmt(n, decimals = 2) {
  if (n == null) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pnlClass(n) { return n >= 0 ? 'green' : 'red'; }
function pnlSign(n) { return n >= 0 ? '+' : ''; }

// Fetch helpers
async function api(path) {
  try { return await (await fetch(path)).json(); }
  catch { return null; }
}

// Overview
async function refreshOverview() {
  const d = await api('/api/overview');
  if (!d) return;

  const modeBadge = document.getElementById('mode-badge');
  modeBadge.textContent = d.status;
  modeBadge.className = 'badge ' + d.status.toLowerCase();

  const regimeBadge = document.getElementById('regime-badge');
  const regimeMap = { trending_up: 'TREND UP', trending_down: 'TREND DOWN', ranging: 'RANGING', choppy: 'CHOPPY' };
  regimeBadge.textContent = regimeMap[d.regime] || d.regime;
  regimeBadge.className = 'badge ' + (d.regime || '').replace('_', '-');

  document.getElementById('status-dot').style.background = d.status === 'HALTED' ? 'var(--red)' : 'var(--green)';

  document.getElementById('s-equity').textContent = '$' + fmt(d.equity);
  const dailyEl = document.getElementById('s-daily');
  dailyEl.textContent = pnlSign(d.daily_pnl) + '$' + fmt(Math.abs(d.daily_pnl));
  dailyEl.className = 'stat-value ' + pnlClass(d.daily_pnl);

  const totalEl = document.getElementById('s-total');
  totalEl.textContent = pnlSign(d.total_pnl) + '$' + fmt(Math.abs(d.total_pnl));
  totalEl.className = 'stat-value ' + pnlClass(d.total_pnl);

  document.getElementById('s-open').textContent = d.open_positions;

  const wr = d.stats?.win_rate;
  document.getElementById('s-winrate').textContent = wr != null ? fmt(wr, 1) + '%' : '--';

  const ddEl = document.getElementById('s-dd');
  ddEl.textContent = fmt(d.drawdown_pct, 1) + '%';
  ddEl.className = 'stat-value ' + (d.drawdown_pct < -5 ? 'red' : '');

  // Heat bar
  const heat = Math.min(d.portfolio_heat, 8);
  const heatFill = document.getElementById('heat-fill');
  heatFill.style.width = Math.max((heat / 8) * 100, 3) + '%';
  heatFill.textContent = fmt(d.portfolio_heat, 1) + '%';
  heatFill.style.background = d.portfolio_heat < 3 ? 'var(--green)' : d.portfolio_heat < 5 ? 'var(--yellow)' : 'var(--red)';

  // Circuit breakers
  const brkEl = document.getElementById('breakers');
  brkEl.innerHTML = (d.circuit_breakers || []).map(cb => `
    <div class="breaker ${cb.tripped ? 'tripped' : ''}">
      <div class="breaker-label">${cb.period}</div>
      <div class="breaker-value" style="color:var(--red)">${cb.threshold}%</div>
      <div class="breaker-status" style="color:${cb.tripped ? 'var(--red)' : 'var(--green)'}">
        ${cb.tripped ? 'TRIPPED' : 'OK (' + fmt(cb.current, 1) + '%)'}
      </div>
    </div>
  `).join('');
}

// Positions
async function refreshPositions() {
  const d = await api('/api/positions');
  if (!d) return;
  const el = document.getElementById('positions-content');

  if (!d.positions?.length) {
    el.innerHTML = '<p class="empty">No open positions</p>';
    return;
  }

  el.innerHTML = `<table><thead><tr>
    <th>Dir</th><th>Strategy</th><th>Entry</th><th>Current</th><th>Stop</th><th>Target</th><th>Size</th><th>P&L</th><th>R</th>
  </tr></thead><tbody>${d.positions.map(p => `<tr>
    <td style="color:${p.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight:700">${p.direction.toUpperCase()}</td>
    <td>${p.strategy}</td>
    <td>$${fmt(p.entry_price)}</td>
    <td>$${fmt(p.current_price)}</td>
    <td>$${fmt(p.stop_price)}</td>
    <td>$${fmt(p.target_price)}</td>
    <td>${fmt(p.size_btc, 4)}</td>
    <td style="color:${pnlClass(p.unrealized_pnl)}">${pnlSign(p.unrealized_pnl)}$${fmt(Math.abs(p.unrealized_pnl))}</td>
    <td style="color:${pnlClass(p.r_multiple)}">${pnlSign(p.r_multiple)}${fmt(p.r_multiple, 1)}R</td>
  </tr>`).join('')}</tbody></table>`;
}

// Trade History
async function refreshHistory() {
  const d = await api('/api/trades');
  if (!d) return;
  const el = document.getElementById('history-content');
  const statsEl = document.getElementById('history-stats');

  if (d.stats) {
    statsEl.innerHTML = `
      <span>Trades: <strong>${d.stats.total_trades || 0}</strong></span>
      <span>Win Rate: <strong>${fmt(d.stats.win_rate || 0, 1)}%</strong></span>
      <span>Avg R: <strong>${fmt(d.stats.avg_r || 0, 2)}</strong></span>
      <span>Expectancy: <strong>$${fmt(d.stats.expectancy || 0)}</strong></span>
      <span>Profit Factor: <strong>${fmt(d.stats.profit_factor || 0, 2)}</strong></span>
    `;
  }

  if (!d.trades?.length) {
    el.innerHTML = '<p class="empty">No trades yet</p>';
    return;
  }

  el.innerHTML = `<table><thead><tr>
    <th>Date</th><th>Strategy</th><th>Dir</th><th>Status</th><th>Entry</th><th>Exit</th><th>P&L</th><th>R</th>
  </tr></thead><tbody>${d.trades.map(t => {
    const date = t.signal_at ? new Date(t.signal_at).toLocaleDateString() : '--';
    const pnl = t.net_pnl;
    return `<tr>
      <td>${date}</td>
      <td>${t.strategy || '--'}</td>
      <td style="color:${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight:700">${(t.direction || '--').toUpperCase()}</td>
      <td>${t.status}</td>
      <td>${t.entry_price ? '$' + fmt(t.entry_price) : '--'}</td>
      <td>${t.exit_price ? '$' + fmt(t.exit_price) : '--'}</td>
      <td style="color:${pnlClass(pnl || 0)}">${pnl != null ? pnlSign(pnl) + '$' + fmt(Math.abs(pnl)) : '--'}</td>
      <td>${t.r_multiple != null ? fmt(t.r_multiple, 1) + 'R' : '--'}</td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

// Equity Curve
async function refreshEquity() {
  const d = await api('/api/equity');
  if (!d?.points?.length) return;

  const labels = d.points.map(p => new Date(p.timestamp).toLocaleString());
  const equities = d.points.map(p => p.equity);
  const drawdowns = d.points.map(p => p.drawdown);

  if (equityChart) equityChart.destroy();
  equityChart = new Chart(document.getElementById('equity-chart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Equity', data: equities, borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
    options: { responsive: true, scales: { x: { display: false }, y: { grid: { color: '#30363d' }, ticks: { color: '#8b949e' } } }, plugins: { legend: { display: false } } }
  });

  if (drawdownChart) drawdownChart.destroy();
  drawdownChart = new Chart(document.getElementById('drawdown-chart'), {
    type: 'line',
    data: { labels, datasets: [{ label: 'Drawdown %', data: drawdowns, borderColor: '#f85149', backgroundColor: 'rgba(248,81,73,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] },
    options: { responsive: true, scales: { x: { display: false }, y: { grid: { color: '#30363d' }, ticks: { color: '#8b949e' } } }, plugins: { legend: { display: false } } }
  });
}

// Logs
async function refreshLogs() {
  const level = document.getElementById('log-level').value;
  const comp = document.getElementById('log-component').value;
  let url = '/api/logs?limit=100';
  if (level) url += '&level=' + level;
  if (comp) url += '&component=' + comp;

  const d = await api(url);
  if (!d) return;
  const el = document.getElementById('log-view');

  el.innerHTML = (d.logs || []).map(l => {
    const time = new Date(l.created_at).toLocaleTimeString();
    return `<div class="log-entry">
      <span class="time">${time}</span>
      <span class="level-${l.level}">[${l.level.toUpperCase()}]</span>
      <span class="comp">${l.component}</span>
      ${l.message}
    </div>`;
  }).join('');
}

// Config
async function refreshConfig() {
  const d = await api('/api/config');
  if (!d) return;
  const el = document.getElementById('config-content');
  const rows = Object.entries(d).map(([k, v]) => {
    if (typeof v === 'object') {
      return Object.entries(v).map(([sk, sv]) => `<div class="config-row"><span class="config-key">${k}.${sk}</span><span class="config-val">${sv}</span></div>`).join('');
    }
    return `<div class="config-row"><span class="config-key">${k}</span><span class="config-val">${v}</span></div>`;
  }).join('');
  el.innerHTML = '<div class="config-grid">' + rows + '</div>';
}

// Controls
async function haltBot() {
  if (!confirm('Halt the bot? It will stop placing new trades.')) return;
  await fetch('/api/halt', { method: 'POST' });
  refreshOverview();
}

async function resumeBot() {
  await fetch('/api/resume', { method: 'POST' });
  refreshOverview();
}

async function closeAll() {
  if (!confirm('Close ALL open positions at market? This cannot be undone.')) return;
  await fetch('/api/close-all', { method: 'POST' });
  refreshOverview();
  refreshPositions();
}

// Log filter change handlers
document.getElementById('log-level').addEventListener('change', refreshLogs);
document.getElementById('log-component').addEventListener('change', refreshLogs);

// Initial load + auto-refresh
async function refreshAll() {
  await refreshOverview();
  await refreshPositions();
  await refreshHistory();
  await refreshConfig();
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);
