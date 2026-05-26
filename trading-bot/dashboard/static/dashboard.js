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

  // Separate v3 grid-managed positions from v1 trade records. Grid positions
  // get a dedicated detail card; v1 trades use the existing tabular view.
  const gridPositions = d.positions.filter(p => p.managed_by === 'grid');
  const v1Trades      = d.positions.filter(p => p.managed_by !== 'grid');

  const parts = [];

  for (const p of gridPositions) {
    const dir = p.direction.toUpperCase();
    const dirColor = p.direction === 'long' ? 'var(--green)' : 'var(--red)';
    const sizeUsd = p.size_btc * p.current_price;
    const pctChange = p.entry_price ? ((p.current_price - p.entry_price) / p.entry_price * 100) : 0;
    const aboveFloor = p.inventory_above_floor_qty || 0;
    const totalFills = (p.n_buy_fills || 0) + (p.n_sell_fills || 0);
    parts.push(`
      <div class="position-card grid-managed">
        <div class="position-card-header">
          <div>
            <span class="pill" style="background:${dirColor}; color:#000">${escapeHtml(dir)}</span>
            <span class="pill pill-muted">grid-managed</span>
            <span class="pill pill-muted">${escapeHtml(p.prebuy_status || 'unknown status')}</span>
          </div>
          <div class="position-card-meta">
            Entered ${p.entry_at ? new Date(p.entry_at).toLocaleString() : '–'}
          </div>
        </div>
        <div class="position-grid-stats">
          <div class="pg-stat">
            <div class="pg-label">Size</div>
            <div class="pg-value">${fmt(p.size_btc, 4)} BTC</div>
            <div class="pg-sub">≈ $${fmt(sizeUsd, 0)}</div>
          </div>
          <div class="pg-stat">
            <div class="pg-label">Avg Cost</div>
            <div class="pg-value">$${fmt(p.entry_price, 0)}</div>
            <div class="pg-sub">Mark: $${fmt(p.current_price, 0)}</div>
          </div>
          <div class="pg-stat">
            <div class="pg-label">Unrealized P&L</div>
            <div class="pg-value ${pnlClass(p.unrealized_pnl)}">${pnlSign(p.unrealized_pnl)}$${fmt(Math.abs(p.unrealized_pnl))}</div>
            <div class="pg-sub ${pnlClass(pctChange)}">${pnlSign(pctChange)}${fmt(pctChange, 2)}%</div>
          </div>
          <div class="pg-stat">
            <div class="pg-label">Inventory Floor</div>
            <div class="pg-value">${fmt(p.inventory_floor_qty || 0, 4)}</div>
            <div class="pg-sub">+${fmt(aboveFloor, 4)} above</div>
          </div>
          <div class="pg-stat">
            <div class="pg-label">Realized P&L</div>
            <div class="pg-value ${pnlClass(p.realized_pnl_total)}">${pnlSign(p.realized_pnl_total)}$${fmt(Math.abs(p.realized_pnl_total))}</div>
            <div class="pg-sub">Fees: $${fmt(p.fees_paid_total)}</div>
          </div>
          <div class="pg-stat">
            <div class="pg-label">Fills</div>
            <div class="pg-value">${totalFills}</div>
            <div class="pg-sub">${p.n_buy_fills || 0} buys · ${p.n_sell_fills || 0} sells</div>
          </div>
        </div>
        <div class="position-card-footer">
          No fixed stop or target — exit conditions managed by 40% drawdown circuit breaker.
          <a href="#" onclick="document.querySelector('.tab[data-tab=grid]').click(); return false;">Open Grid tab for full state →</a>
        </div>
      </div>
    `);
  }

  if (v1Trades.length > 0) {
    parts.push(`<h3 style="margin-top:20px;font-size:13px;color:var(--muted)">Strategy trades (v1)</h3>`);
    parts.push(`<table><thead><tr>
      <th>Dir</th><th>Strategy</th><th>Entry</th><th>Current</th><th>Stop</th><th>Target</th><th>Size</th><th>P&L</th><th>R</th>
    </tr></thead><tbody>${v1Trades.map(p => `<tr>
      <td style="color:${p.direction === 'long' ? 'var(--green)' : 'var(--red)'}; font-weight:700">${escapeHtml(p.direction.toUpperCase())}</td>
      <td>${escapeHtml(p.strategy)}</td>
      <td>$${fmt(p.entry_price)}</td>
      <td>$${fmt(p.current_price)}</td>
      <td>$${fmt(p.stop_price)}</td>
      <td>$${fmt(p.target_price)}</td>
      <td>${fmt(p.size_btc, 4)}</td>
      <td style="color:${pnlClass(p.unrealized_pnl)}">${pnlSign(p.unrealized_pnl)}$${fmt(Math.abs(p.unrealized_pnl))}</td>
      <td style="color:${pnlClass(p.r_multiple)}">${pnlSign(p.r_multiple)}${fmt(p.r_multiple, 1)}R</td>
    </tr>`).join('')}</tbody></table>`);
  }

  el.innerHTML = parts.join('');
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
// Grid Monitor (v3) — full rewrite for clarity + empty-state handling
// ═══════════════════════════════════════════════════════════════════════

// Cache the latest known prices so we can show $-value next to BTC qty
let _lastBtcPrice = null;

function _humanAge(iso) {
  if (!iso) return '–';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m ago`;
  return `${Math.floor(sec/86400)}d ago`;
}

function _fmtMoney(n, decimals = 0) {
  if (n == null || !isFinite(n)) return '–';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function refreshGrid() {
  // Fire all three API calls in parallel for snappiness
  const [state, overview, fillsResp] = await Promise.all([
    api('/api/grid/state'),
    api('/api/overview'),
    api('/api/grid/fills?limit=20'),
  ]);
  if (!state) return;

  // Resolve current BTC price (used as fallback when no fills exist)
  if (fillsResp?.fills?.length) {
    _lastBtcPrice = fillsResp.fills[0].fill_price;
  } else if (state.prebuy_avg_price) {
    _lastBtcPrice = state.prebuy_avg_price;
  }

  _renderGridStatusBanner(state, overview);
  _renderGridStatCards(state, overview);

  if (!state.initialized) {
    document.getElementById('g-range-info').textContent = 'Grid not initialized — waiting for first recenter';
    document.getElementById('g-range-meta').textContent = '';
    document.getElementById('g-orders-meta').textContent = '0 orders';
    document.getElementById('g-fills-meta').textContent = '0 fills';
    return;
  }

  _renderGridRangeCard(state);
  _renderGridActiveOrders(state);
  _renderGridRecentFills(fillsResp);
  await _renderGridPnlChart();
}

function _renderGridStatusBanner(state, overview) {
  const banner = document.getElementById('g-status-banner');
  const textEl = document.getElementById('g-status-text');
  const subEl = document.getElementById('g-status-sub');
  const halted = overview?.status === 'HALTED';
  const mode = (overview?.status || 'paper').toLowerCase();
  const lastFill = state?.active_orders?.length || state?.n_buy_fills || state?.n_sell_fills ? null : null;

  banner.classList.remove('healthy', 'halted', 'warning');
  if (halted) {
    banner.classList.add('halted');
    textEl.textContent = `HALTED — ${overview?.halt_reason || 'unknown reason'}`;
    subEl.textContent = 'Manual unhalt + 50d MA re-arm required';
    return;
  }
  // Drawdown warning at 25% (CB trips at 40%)
  const dd = overview?.drawdown_pct || 0;
  if (dd <= -25) {
    banner.classList.add('warning');
    textEl.textContent = `Drawdown ${dd.toFixed(1)}% — approaching CB threshold (-40%)`;
    subEl.textContent = `Last heartbeat: ${_humanAge(overview.last_heartbeat)}`;
    return;
  }
  banner.classList.add('healthy');
  const fills = (state?.n_buy_fills || 0) + (state?.n_sell_fills || 0);
  const prebuy = state?.prebuy_status || 'not started';
  textEl.textContent = `Bot HEALTHY · ${mode.toUpperCase()} mode · prebuy ${prebuy}`;
  const heartbeatAge = overview?.last_heartbeat ? _humanAge(overview.last_heartbeat) : '–';
  subEl.textContent = `${fills} lifetime fills · last heartbeat ${heartbeatAge}`;
}

function _renderGridStatCards(state, overview) {
  // Equity
  const equity = overview?.equity ?? 0;
  const peak = overview?.peak_equity ?? equity;
  const dd = overview?.drawdown_pct ?? 0;
  document.getElementById('g-equity').textContent = _fmtMoney(equity, 2);
  const eqSub = document.getElementById('g-equity-sub');
  eqSub.textContent = `Peak: ${_fmtMoney(peak, 0)}`;

  // Inventory — show BTC + $-value
  const invQty = state?.inventory_qty || 0;
  document.getElementById('g-inv').textContent = invQty > 0 ? fmt(invQty, 4) + ' BTC' : '0 BTC';
  const invValue = _lastBtcPrice ? invQty * _lastBtcPrice : null;
  document.getElementById('g-inv-sub').textContent = invValue != null ? `≈ ${_fmtMoney(invValue, 0)}` : ' ';

  // Avg cost + distance to current price
  const avg = state?.inventory_avg_cost;
  document.getElementById('g-avg').textContent = avg ? _fmtMoney(avg, 0) : '–';
  if (avg && _lastBtcPrice) {
    const pct = ((_lastBtcPrice - avg) / avg) * 100;
    const sub = document.getElementById('g-avg-sub');
    sub.textContent = `Mark: ${_fmtMoney(_lastBtcPrice, 0)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
    sub.className = 'stat-sub ' + (pct >= 0 ? 'green' : 'red');
  } else {
    document.getElementById('g-avg-sub').textContent = ' ';
  }

  // Realized P&L
  const realized = state?.realized_pnl_total || 0;
  const realizedEl = document.getElementById('g-realized');
  realizedEl.textContent = (realized >= 0 ? '+' : '–') + _fmtMoney(Math.abs(realized), 2);
  realizedEl.className = 'stat-value ' + pnlClass(realized);
  const fees = state?.fees_paid_total || 0;
  document.getElementById('g-realized-sub').textContent = `Fees paid: ${_fmtMoney(fees, 2)}`;

  // Drawdown — color-coded
  const ddEl = document.getElementById('g-dd');
  ddEl.textContent = (dd >= 0 ? '+' : '') + dd.toFixed(2) + '%';
  ddEl.className = 'stat-value ' + (dd <= -25 ? 'red' : dd <= -15 ? 'yellow' : '');

  // Activity — fills count + open orders
  const buyFills = state?.n_buy_fills || 0;
  const sellFills = state?.n_sell_fills || 0;
  const openOrders = state?.active_orders_count || 0;
  document.getElementById('g-activity').textContent = `${openOrders} open`;
  document.getElementById('g-activity-sub').textContent = `${buyFills + sellFills} fills (${buyFills}B / ${sellFills}S)`;
}

function _renderGridRangeCard(state) {
  const lo = state.range_low, hi = state.range_high;
  if (lo == null || hi == null) {
    document.getElementById('g-range-info').textContent = 'Range not yet computed';
    document.getElementById('g-range-meta').textContent = '';
    return;
  }
  const recentered = state.last_recenter_at ? _humanAge(state.last_recenter_at) : 'never';
  document.getElementById('g-range-info').innerHTML =
    `<strong>${_fmtMoney(lo, 0)}</strong> – <strong>${_fmtMoney(hi, 0)}</strong>  ` +
    `<span style="color:var(--muted)">· ${state.num_levels} levels · ` +
    `step ≈ ${_fmtMoney((hi - lo) / (state.num_levels - 1), 0)}</span>`;
  document.getElementById('g-range-meta').textContent = `Recentered ${recentered}`;
  _renderGridRangeSvg(state);
}

function _renderGridRangeSvg(state) {
  const svg = document.getElementById('g-range-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const lo = state.range_low, hi = state.range_high;
  if (lo == null || hi == null) return;

  const w = svg.clientWidth || 800;
  const h = 320;
  const padX = 90, padY = 24;

  // Levels
  const n = state.num_levels;
  const levels = [];
  if (n >= 2) {
    const step = (hi - lo) / (n - 1);
    for (let i = 0; i < n; i++) levels.push({ idx: i, price: lo + i * step });
  }
  const yFor = (price) => padY + (1 - (price - lo) / (hi - lo)) * (h - 2 * padY);

  // Active-order map
  const ordersByLevel = {};
  (state.active_orders || []).forEach(o => { ordersByLevel[o.level_index] = o; });

  // Background grid lines (every 4th level gets a faint horizontal line)
  for (let i = 0; i < levels.length; i++) {
    if (i % 4 !== 0) continue;
    const y = yFor(levels[i].price);
    svg.insertAdjacentHTML('beforeend',
      `<line x1="${padX}" y1="${y}" x2="${w - padX - 20}" y2="${y}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />`
    );
  }

  // Vertical center line as reference
  const cx = (w - padX - 20 + padX) / 2;
  svg.insertAdjacentHTML('beforeend',
    `<line x1="${cx}" y1="${padY}" x2="${cx}" y2="${h - padY}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />`
  );

  // Order markers (large dots positioned at the level price)
  for (const lvl of levels) {
    const y = yFor(lvl.price);
    const o = ordersByLevel[lvl.idx];

    // Level price label on the left
    svg.insertAdjacentHTML('beforeend',
      `<text x="${padX - 10}" y="${y + 4}" font-size="11" fill="#aaa" text-anchor="end" font-variant-numeric="tabular-nums">${_fmtMoney(lvl.price, 0)}</text>`
    );

    if (o) {
      const color = o.side === 'buy' ? '#27c93f' : '#ff5f56';
      // Order bar + dot
      svg.insertAdjacentHTML('beforeend',
        `<line x1="${padX}" y1="${y}" x2="${w - padX - 20}" y2="${y}" stroke="${color}" stroke-width="1.5" opacity="0.4" />` +
        `<circle cx="${cx}" cy="${y}" r="6" fill="${color}" />` +
        `<text x="${cx + 12}" y="${y + 4}" font-size="10" fill="${color}">${o.side === 'buy' ? 'BUY' : 'SELL'} ${fmt(o.qty, 4)}</text>`
      );
    } else {
      // Empty level — just a small tick
      svg.insertAdjacentHTML('beforeend',
        `<circle cx="${cx}" cy="${y}" r="2" fill="rgba(255,255,255,0.15)" />`
      );
    }
  }

  // Inventory floor line (the prebuy_qty marker)
  if (state.prebuy_avg_price && state.prebuy_avg_price >= lo && state.prebuy_avg_price <= hi) {
    const y = yFor(state.prebuy_avg_price);
    svg.insertAdjacentHTML('beforeend',
      `<line x1="${padX - 6}" y1="${y}" x2="${w - padX - 14}" y2="${y}" stroke="#58a6ff" stroke-width="1.5" stroke-dasharray="6 4" />` +
      `<text x="${w - padX - 12}" y="${y - 4}" font-size="11" fill="#58a6ff" text-anchor="end">Inventory floor (prebuy)</text>`
    );
  }

  // Current price line — always show, clamp if out of range
  if (_lastBtcPrice != null) {
    const inRange = _lastBtcPrice >= lo && _lastBtcPrice <= hi;
    const yPrice = inRange ? yFor(_lastBtcPrice)
                  : _lastBtcPrice > hi ? padY + 8 : h - padY - 8;
    svg.insertAdjacentHTML('beforeend',
      `<line x1="${padX - 10}" y1="${yPrice}" x2="${w - padX - 14}" y2="${yPrice}" stroke="#d29922" stroke-width="2" />` +
      `<text x="${padX - 14}" y="${yPrice + 4}" font-size="11" fill="#d29922" text-anchor="end" font-weight="600">${_fmtMoney(_lastBtcPrice, 0)}</text>` +
      (!inRange ? `<text x="${cx}" y="${yPrice - 6}" font-size="10" fill="#d29922" text-anchor="middle">${_lastBtcPrice > hi ? '↑ above range' : '↓ below range'}</text>` : '')
    );
  }
}

function _renderGridActiveOrders(state) {
  const orders = (state.active_orders || []).slice();
  const meta = document.getElementById('g-orders-meta');
  meta.textContent = `${orders.length} open · ${orders.filter(o => o.side==='buy').length} buy / ${orders.filter(o => o.side==='sell').length} sell`;
  if (orders.length === 0) {
    document.getElementById('g-orders-content').innerHTML =
      `<p class="empty">No active orders yet. Grid populates ~30s after recenter; sells require inventory above the prebuy floor.</p>`;
    return;
  }
  // Sort by distance from current price (nearest first)
  const currentPrice = _lastBtcPrice;
  orders.sort((a, b) => {
    const da = currentPrice ? Math.abs(a.level_price - currentPrice) : a.level_index;
    const db = currentPrice ? Math.abs(b.level_price - currentPrice) : b.level_index;
    return da - db;
  });
  const rows = orders.map(o => {
    const distPct = currentPrice ? ((o.level_price - currentPrice) / currentPrice) * 100 : 0;
    const distStr = currentPrice ? `${distPct >= 0 ? '+' : ''}${distPct.toFixed(2)}%` : '–';
    const ageStr = _humanAge(o.created_at);
    return `<tr>
      <td>${o.level_index}</td>
      <td class="${o.side === 'buy' ? 'green' : 'red'}">${o.side.toUpperCase()}</td>
      <td class="num">${_fmtMoney(o.level_price, 0)}</td>
      <td class="num">${distStr}</td>
      <td class="num">${fmt(o.qty, 4)}</td>
      <td>${ageStr}</td>
    </tr>`;
  }).join('');
  document.getElementById('g-orders-content').innerHTML =
    `<table class="data-table">
      <thead><tr><th>Lvl</th><th>Side</th><th class="num">Price</th><th class="num">vs Mark</th><th class="num">Qty</th><th>Age</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _renderGridRecentFills(fillsResp) {
  const fills = fillsResp?.fills || [];
  const meta = document.getElementById('g-fills-meta');
  meta.textContent = fills.length > 0
    ? `Showing latest ${fills.length}`
    : 'No fills yet';
  if (fills.length === 0) {
    document.getElementById('g-fills-content').innerHTML =
      `<p class="empty">No fills yet. In typical BTC volatility expect 5–15 fills/day.</p>`;
    return;
  }
  const rows = fills.map(f => `<tr>
    <td>${_humanAge(f.created_at)}</td>
    <td class="${f.side === 'buy' ? 'green' : 'red'}">${f.side.toUpperCase()}</td>
    <td>${f.level_index}</td>
    <td class="num">${_fmtMoney(f.fill_price, 0)}</td>
    <td class="num">${fmt(f.fill_qty, 4)}</td>
    <td class="num ${pnlClass(f.realized_pnl)}">${pnlSign(f.realized_pnl)}${_fmtMoney(Math.abs(f.realized_pnl), 2)}</td>
  </tr>`).join('');
  document.getElementById('g-fills-content').innerHTML =
    `<table class="data-table">
      <thead><tr><th>When</th><th>Side</th><th>Lvl</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Realized</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function _renderGridPnlChart() {
  const d = await api('/api/grid/metrics?period=30d');
  const chartEl = document.getElementById('g-pnl-chart');
  const meta = document.getElementById('g-pnl-meta');
  const wrapper = chartEl?.parentElement;
  if (!chartEl || !wrapper) return;
  const metrics = (d?.metrics || []).slice().reverse();

  if (metrics.length === 0) {
    chartEl.style.display = 'none';
    let placeholder = wrapper.querySelector('.pnl-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'pnl-placeholder';
      wrapper.appendChild(placeholder);
    }
    placeholder.textContent = 'No daily rollups yet. The first daily rollup fires at 00:05 UTC; this chart will fill in once data accumulates over several days.';
    meta.textContent = 'Rollup fires at 00:05 UTC daily';
    if (gridPnlChart) { gridPnlChart.destroy(); gridPnlChart = null; }
    return;
  }

  const placeholder = wrapper.querySelector('.pnl-placeholder');
  if (placeholder) placeholder.remove();
  chartEl.style.display = '';

  const total = metrics.reduce((s, m) => s + (Number(m.net_pnl) || 0), 0);
  meta.textContent = `${metrics.length} day${metrics.length === 1 ? '' : 's'} · Σ ${total >= 0 ? '+' : '–'}${_fmtMoney(Math.abs(total), 2)}`;

  if (gridPnlChart) gridPnlChart.destroy();
  gridPnlChart = new Chart(chartEl, {
    type: 'bar',
    data: {
      labels: metrics.map(m => new Date(m.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
      datasets: [{
        label: 'Net P&L ($)',
        data: metrics.map(m => Number(m.net_pnl)),
        backgroundColor: metrics.map(m => m.net_pnl >= 0 ? 'rgba(39,201,63,0.6)' : 'rgba(255,95,86,0.6)'),
        borderColor:     metrics.map(m => m.net_pnl >= 0 ? '#27c93f'           : '#ff5f56'),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `$${Number(ctx.parsed.y).toFixed(2)}` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#aaa', callback: v => '$' + v } },
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
