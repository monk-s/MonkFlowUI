// Auto-refresh dashboard every 10 seconds
const REFRESH_MS = 10000;
let equityChart = null;
let drawdownChart = null;
let gridPnlChart = null;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'equity') refreshEquity();
    if (tab.dataset.tab === 'logs') refreshLogs();
    if (tab.dataset.tab === 'grid') refreshGrid();
  });
});

function fmt(n, decimals = 2) {
  if (n == null) return '--';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pnlClass(n) { return n >= 0 ? 'green' : 'red'; }
function pnlSign(n) { return n >= 0 ? '+' : ''; }

// Defensive HTML escape for any string that may originate from external sources
// (Coinbase API error messages, exchange-side reject reasons, indicator snapshots).
// Bot-generated strings are normally safe, but error paths can include arbitrary
// upstream content -- escape everything that goes into innerHTML.
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      <div class="breaker-label">${escapeHtml(cb.period)}</div>
      <div class="breaker-value" style="color:var(--red)">${escapeHtml(cb.threshold)}%</div>
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
    <td style="color:${p.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight:700">${escapeHtml(p.direction.toUpperCase())}</td>
    <td>${escapeHtml(p.strategy)}</td>
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
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(t.strategy || '--')}</td>
      <td style="color:${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight:700">${escapeHtml((t.direction || '--').toUpperCase())}</td>
      <td>${escapeHtml(t.status)}</td>
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
    // Escape level/component/message: these may include upstream error text
    // (e.g. Coinbase API error bodies) that could contain HTML or scripts.
    const level = escapeHtml(l.level || 'info');
    return `<div class="log-entry">
      <span class="time">${escapeHtml(time)}</span>
      <span class="level-${level}">[${level.toUpperCase()}]</span>
      <span class="comp">${escapeHtml(l.component)}</span>
      ${escapeHtml(l.message)}
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
      return Object.entries(v).map(([sk, sv]) => `<div class="config-row"><span class="config-key">${escapeHtml(k + '.' + sk)}</span><span class="config-val">${escapeHtml(sv)}</span></div>`).join('');
    }
    return `<div class="config-row"><span class="config-key">${escapeHtml(k)}</span><span class="config-val">${escapeHtml(v)}</span></div>`;
  }).join('');
  el.innerHTML = '<div class="config-grid">' + rows + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════
// Grid Monitor (v3)
// ═══════════════════════════════════════════════════════════════════════

async function refreshGrid() {
  const state = await api('/api/grid/state');
  if (!state) return;
  if (!state.initialized) {
    document.getElementById('g-range-info').textContent = 'Grid not initialized — waiting for first recenter';
    return;
  }

  // Stat cards
  document.getElementById('g-inv').textContent = fmt(state.inventory_qty, 4) + ' BTC';
  const avg = state.inventory_avg_cost;
  document.getElementById('g-avg').textContent = avg ? '$' + fmt(avg, 0) : '--';
  const realizedEl = document.getElementById('g-realized');
  realizedEl.textContent = pnlSign(state.realized_pnl_total) + '$' + fmt(Math.abs(state.realized_pnl_total));
  realizedEl.className = 'stat-value ' + pnlClass(state.realized_pnl_total);
  document.getElementById('g-active').textContent = state.active_orders_count;
  document.getElementById('g-fills').textContent = `${state.n_buy_fills} / ${state.n_sell_fills}`;
  const prebuyEl = document.getElementById('g-prebuy');
  prebuyEl.textContent = state.prebuy_status || 'not started';
  prebuyEl.className = 'stat-value ' + (state.prebuy_status === 'complete' ? 'green' : state.prebuy_status === 'failed' ? 'red' : '');

  // Range info
  document.getElementById('g-range-info').innerHTML = state.range_low != null ? (
    `Range <strong>$${fmt(state.range_low, 0)}</strong> – <strong>$${fmt(state.range_high, 0)}</strong> | ` +
    `${state.num_levels} levels | recentered: ${state.last_recenter_at ? new Date(state.last_recenter_at).toLocaleString() : 'never'}`
  ) : 'No active range';

  // Render SVG range visualization
  await renderGridRangeSvg(state);

  // Active orders table
  const ordersHtml = (state.active_orders || []).length === 0
    ? '<p class="empty">No active orders</p>'
    : `<table class="data-table">
        <thead><tr><th>Level</th><th>Price</th><th>Side</th><th>Qty (BTC)</th><th>Age</th></tr></thead>
        <tbody>${(state.active_orders || []).map(o => {
          const ageMin = o.created_at ? Math.floor((Date.now() - new Date(o.created_at)) / 60000) : 0;
          return `<tr>
            <td>${o.level_index}</td>
            <td>$${fmt(o.level_price, 0)}</td>
            <td class="${o.side === 'buy' ? 'green' : 'red'}">${o.side.toUpperCase()}</td>
            <td>${fmt(o.qty, 4)}</td>
            <td>${ageMin}m</td>
          </tr>`;
        }).join('')}</tbody>
       </table>`;
  document.getElementById('g-orders-content').innerHTML = ordersHtml;

  // Daily P&L chart
  await renderGridPnlChart();

  // Recent fills
  const fills = await api('/api/grid/fills?limit=20');
  const fillsList = fills?.fills || [];
  document.getElementById('g-fills-content').innerHTML = fillsList.length === 0
    ? '<p class="empty">No fills yet</p>'
    : `<table class="data-table">
        <thead><tr><th>Time</th><th>Side</th><th>Lvl</th><th>Price</th><th>Qty</th><th>P&L</th></tr></thead>
        <tbody>${fillsList.map(f => `<tr>
          <td>${new Date(f.created_at).toLocaleTimeString()}</td>
          <td class="${f.side === 'buy' ? 'green' : 'red'}">${f.side.toUpperCase()}</td>
          <td>${f.level_index}</td>
          <td>$${fmt(f.fill_price, 0)}</td>
          <td>${fmt(f.fill_qty, 4)}</td>
          <td class="${pnlClass(f.realized_pnl)}">${pnlSign(f.realized_pnl)}$${fmt(Math.abs(f.realized_pnl))}</td>
        </tr>`).join('')}</tbody>
       </table>`;
}

async function renderGridRangeSvg(state) {
  // Need current price for the price-line overlay — get from overview
  const ov = await api('/api/overview');
  // The /api/overview doesn't return BTC price directly; we use the avg_cost or
  // last fill price as a proxy. Or just call /api/grid/fills?limit=1.
  const recent = await api('/api/grid/fills?limit=1');
  let currentPrice = null;
  if (recent?.fills?.length) {
    currentPrice = recent.fills[0].fill_price;
  } else if (state.prebuy_avg_price) {
    currentPrice = state.prebuy_avg_price;
  } else if (state.range_low != null) {
    currentPrice = (state.range_low + state.range_high) / 2;
  }

  const svg = document.getElementById('g-range-svg');
  if (!svg) return;
  svg.innerHTML = '';
  if (state.range_low == null || state.range_high == null) return;

  const lo = state.range_low, hi = state.range_high;
  const w = svg.clientWidth || 800;
  const h = 280;
  const padX = 80, padY = 20;

  // Build level set
  const n = state.num_levels;
  const levels = [];
  if (n >= 2) {
    const step = (hi - lo) / (n - 1);
    for (let i = 0; i < n; i++) levels.push({ idx: i, price: lo + i * step });
  }

  function yFor(price) {
    return padY + (1 - (price - lo) / (hi - lo)) * (h - 2 * padY);
  }

  // Buy + sell side maps from active orders
  const ordersByLevel = {};
  (state.active_orders || []).forEach(o => {
    ordersByLevel[o.level_index] = o.side;
  });

  // Draw level lines
  for (const lvl of levels) {
    const y = yFor(lvl.price);
    const side = ordersByLevel[lvl.idx];
    const stroke = side === 'buy' ? '#27c93f'
                   : side === 'sell' ? '#ff5f56'
                   : '#444';
    const dasharray = side ? '0' : '4 4';
    svg.insertAdjacentHTML('beforeend',
      `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="${stroke}" stroke-dasharray="${dasharray}" stroke-width="${side ? 2 : 1}" />`
    );
    if (side) {
      svg.insertAdjacentHTML('beforeend',
        `<circle cx="${w - padX + 10}" cy="${y}" r="4" fill="${stroke}" />`
      );
    }
    // Label
    svg.insertAdjacentHTML('beforeend',
      `<text x="${padX - 8}" y="${y + 4}" font-size="11" fill="#999" text-anchor="end">$${Math.round(lvl.price).toLocaleString()}</text>`
    );
  }

  // Current price line
  if (currentPrice != null && currentPrice >= lo && currentPrice <= hi) {
    const y = yFor(currentPrice);
    svg.insertAdjacentHTML('beforeend',
      `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="#ffd166" stroke-width="2" />` +
      `<text x="${w - padX + 5}" y="${y - 4}" font-size="12" fill="#ffd166">$${Math.round(currentPrice).toLocaleString()} (last)</text>`
    );
  }
}

async function renderGridPnlChart() {
  const d = await api('/api/grid/metrics?period=30d');
  if (!d) return;
  const metrics = (d.metrics || []).slice().reverse(); // oldest → newest

  const ctx = document.getElementById('g-pnl-chart');
  if (!ctx) return;
  if (gridPnlChart) gridPnlChart.destroy();
  gridPnlChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: metrics.map(m => new Date(m.date).toLocaleDateString()),
      datasets: [{
        label: 'Net P&L ($)',
        data: metrics.map(m => m.net_pnl),
        backgroundColor: metrics.map(m => m.net_pnl >= 0 ? 'rgba(39,201,63,0.6)' : 'rgba(255,95,86,0.6)'),
        borderColor: metrics.map(m => m.net_pnl >= 0 ? '#27c93f' : '#ff5f56'),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#aaa' } },
        x: { ticks: { color: '#aaa', maxRotation: 45 } },
      },
    },
  });
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
  // Only refresh grid if the tab is visible (saves bandwidth)
  if (document.getElementById('tab-grid')?.classList.contains('active')) {
    await refreshGrid();
  }
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);
