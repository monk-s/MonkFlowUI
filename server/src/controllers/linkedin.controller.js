const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { query } = require('../config/database');
const linkedinService = require('../services/linkedin-outreach.service');
const unipile = require('../services/unipile.client');
const pushover = require('../services/pushover.client');
const env = require('../config/env');
const logger = require('../utils/logger');

// ── POST /linkedin/run — manual trigger (superadmin) ──
const runNow = catchAsync(async (req, res) => {
  const dryRun = req.query.dryRun === 'true';
  // ?repersonalize=true flips all still-unsent leads back to 'enriched' so the run
  // regenerates their connect note + DM with the current prompt. Useful after prompt tweaks.
  if (req.query.repersonalize === 'true') {
    const { rowCount } = await query(
      `UPDATE linkedin_leads SET status='enriched', connect_note=NULL, first_dm=NULL, updated_at=NOW() WHERE status='personalized'`
    );
    logger.info({ rowCount }, '[linkedin] repersonalize flip');
  }
  const result = await linkedinService.runDailyLinkedInRun({ dryRun });
  res.json(result);
});

// ── GET /linkedin/leads ──
const listLeads = catchAsync(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const status = req.query.status || null;
  const params = [limit];
  let sql = `SELECT id, business_name, contact_name, contact_title, business_city, status, score, connect_sent_at, connected_at, dm_sent_at, replied_at, linkedin_url, last_touch_at, connect_note, first_dm, recent_post_snippet, profile_picture_url FROM linkedin_leads`;
  if (status) {
    sql += ` WHERE status = $2`;
    params.push(status);
  }
  sql += ` ORDER BY created_at DESC LIMIT $1`;
  const { rows } = await query(sql, params);
  res.json({ data: rows });
});

// ── GET /linkedin/stats ──
const getStats = catchAsync(async (req, res) => {
  const [byStatus, today, last7, warming] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS count FROM linkedin_leads GROUP BY status`),
    query(`SELECT * FROM linkedin_daily_limits WHERE date = CURRENT_DATE`),
    query(`SELECT * FROM linkedin_daily_limits WHERE date >= CURRENT_DATE - 7 ORDER BY date DESC`),
    linkedinService.getWarmingLimits(),
  ]);
  res.json({
    data: {
      byStatus: Object.fromEntries(byStatus.rows.map(r => [r.status, r.count])),
      today: today.rows[0] || null,
      last7: last7.rows,
      caps: { connects: warming.connects, dms: warming.dms },
      warming,
    },
  });
});

// ── POST /linkedin/webhook (public, signature-verified) ──
// Unipile sends connection_accepted, message_received, etc.
const webhook = catchAsync(async (req, res) => {
  const sig = req.get('X-Unipile-Signature') || req.get('x-unipile-signature');
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  if (!unipile.verifyWebhookSignature(rawBody, sig)) {
    throw new ApiError(401, 'Invalid signature');
  }

  const event = req.body || {};
  const type = event.event || event.type || '';
  const providerId = event.provider_id || event.user_id || null;
  const chatId = event.chat_id || null;

  logger.info({ type, providerId, chatId }, '[linkedin] webhook received');

  if (!providerId && !chatId) return res.json({ ok: true, ignored: true });

  // Match the lead
  const { rows } = await query(
    `SELECT * FROM linkedin_leads WHERE linkedin_provider_id = $1 OR unipile_chat_id = $2 LIMIT 1`,
    [providerId, chatId]
  );
  const lead = rows[0];
  if (!lead) return res.json({ ok: true, matched: false });

  if (type === 'connection_accepted' || type === 'invite_accepted') {
    await query(
      `UPDATE linkedin_leads SET status='connected', connected_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [lead.id]
    );
    await query(`UPDATE linkedin_daily_limits SET accepts_received = accepts_received + 1 WHERE date = CURRENT_DATE`);
    pushover.sendPush({
      title: '🤝 LinkedIn accept',
      message: `${lead.contact_name || lead.business_name} accepted your connection`,
      url: `${env.frontendUrl}/admin`,
      priority: 0,
    }).catch(() => {});
  } else if (type === 'message_received' || type === 'reply') {
    const replyText = event.text || event.message || '';
    await query(
      `UPDATE linkedin_leads SET status='replied', replied_at=COALESCE(replied_at, NOW()), reply_body=$2, unipile_chat_id=COALESCE(unipile_chat_id, $3), updated_at=NOW() WHERE id=$1`,
      [lead.id, replyText.slice(0, 4000), chatId]
    );
    await query(`UPDATE linkedin_daily_limits SET replies_received = replies_received + 1 WHERE date = CURRENT_DATE`);
    pushover.sendPush({
      title: '🔥 LinkedIn reply',
      message: `${lead.contact_name || lead.business_name}: ${replyText.slice(0, 200)}`,
      url: `${env.frontendUrl}/admin`,
      priority: 1,
    }).catch(() => {});
  }

  res.json({ ok: true });
});

module.exports = { runNow, listLeads, getStats, webhook };
