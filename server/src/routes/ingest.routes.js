/**
 * /api/v1/ingest — where MonkFlow's own pipelines deliver their output.
 *
 *   POST /api/v1/ingest/review-items
 *   Authorization: Bearer mfi_...        (one key per client workspace,
 *                                         created in the staff console)
 *   {
 *     "template": "rent_roll",           // portal/review.js TEMPLATES
 *     "title": "Rent roll, Maple Court, Oct 2026",
 *     "subject": "Maple Court Apartments", "period": "Oct 2026",
 *     "workflowId": "<uuid>",            // optional; must be this workspace's
 *     "externalRef": "run-123/doc-1",    // optional; a repeat returns the first item
 *     "retentionDays": 30,               // optional, 1-365; when the file is deleted
 *     "document": { "filename": "maple.pdf", "contentBase64": "..." },   // optional, PDF
 *     "fields": [
 *       { "group": "property", "key": "total_units", "label": "Units", "value": "48", "confidence": 0.99, "page": 1 },
 *       { "group": "units", "row": 0, "key": "rent", "label": "Rent", "value": "$1,450", "confidence": 0.97, "page": 2 }
 *     ]
 *   }
 *
 * The key decides the workspace; nothing in the body can. The file is
 * encrypted before it is stored (utils/secretBox.js) and is refused when no
 * DOCUMENT_KEY is configured.
 */
const router = require('express').Router();
const crypto = require('crypto');
const { z } = require('zod');
const catchAsync = require('../utils/catchAsync');
const { getClient, query } = require('../config/database');
const { coded } = require('../middleware/session');
const { hashToken } = require('../utils/crypto');
const { audit } = require('../portal/audit');
const { TEMPLATES } = require('../portal/review');
const secretBox = require('../utils/secretBox');

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const requireIngestKey = catchAsync(async (req, res, next) => {
  const raw = (/^Bearer (mfi_[0-9a-f_]{20,100})$/.exec(req.headers.authorization || '') || [])[1];
  const key = raw && (await query(
    'UPDATE ingest_keys SET last_used_at = NOW() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING id, org_id, name', [hashToken(raw)]
  )).rows[0];
  if (!key) throw coded(401, 'invalid_key', 'Missing or invalid ingest key.');
  req.ingestKey = key;
  next();
});

const fieldSchema = z.object({
  group: z.string().min(1).max(40),
  row: z.number().int().min(0).max(5000).nullable().optional(),
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  type: z.enum(['text', 'number', 'money', 'percent', 'date']).optional(),
  value: z.union([z.string().max(2000), z.number()]).nullable(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  page: z.number().int().min(1).max(5000).nullable().optional(),
});
const itemSchema = z.object({
  template: z.string().refine((t) => Object.prototype.hasOwnProperty.call(TEMPLATES, t), `Unknown template. Known: ${Object.keys(TEMPLATES).join(', ')}`),
  title: z.string().trim().min(2).max(200),
  subject: z.string().trim().max(200).nullable().optional(),
  period: z.string().trim().max(40).nullable().optional(),
  workflowId: z.string().uuid().nullable().optional(),
  externalRef: z.string().trim().min(1).max(200).nullable().optional(),
  retentionDays: z.number().int().min(1).max(365).optional(),
  document: z.object({ filename: z.string().trim().min(1).max(255), contentBase64: z.string().min(8) }).nullable().optional(),
  fields: z.array(fieldSchema).min(1).max(5000),
});

router.post('/review-items', requireIngestKey, catchAsync(async (req, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw coded(400, 'invalid_input', `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  const input = parsed.data;
  const orgId = req.ingestKey.org_id;

  const groups = TEMPLATES[input.template].groups.map((g) => g.key);
  const stray = input.fields.find((f) => !groups.includes(f.group));
  if (stray) throw coded(400, 'invalid_input', `Field group "${stray.group}" is not part of the ${input.template} template (${groups.join(', ')}).`);
  const fields = input.fields.map((f, i) => ({
    id: `f${i}`, group: f.group, row: f.row == null ? null : f.row, key: f.key, label: f.label, type: f.type || 'text',
    value: f.value == null ? '' : String(f.value), original: null, confidence: f.confidence == null ? null : f.confidence, page: f.page == null ? null : f.page,
  }));

  let file = null;
  if (input.document) {
    if (!secretBox.configured()) throw coded(503, 'storage_not_configured', 'Document storage is not configured on this server (DOCUMENT_KEY). Nothing was stored.');
    file = Buffer.from(input.document.contentBase64, 'base64');
    if (file.length > MAX_FILE_BYTES) throw coded(413, 'file_too_large', 'The document is larger than 20 MB.');
    if (file.subarray(0, 5).toString('latin1') !== '%PDF-') throw coded(400, 'invalid_input', 'document: only PDF files are accepted.');
  }

  if (input.workflowId) {
    const owned = (await query('SELECT 1 FROM workflows WHERE id = $1 AND org_id = $2', [input.workflowId, orgId])).rows[0];
    if (!owned) throw coded(400, 'invalid_input', 'workflowId: no such workflow in this workspace.');
  }
  if (input.externalRef) {
    const dup = (await query('SELECT id FROM review_items WHERE org_id = $1 AND external_ref = $2', [orgId, input.externalRef])).rows[0];
    if (dup) return res.status(200).json({ id: dup.id, duplicate: true });
  }

  const db = await getClient();
  try {
    await db.query('BEGIN');
    let documentId = null;
    if (file) {
      documentId = (await db.query(
        `INSERT INTO documents (org_id, filename, byte_size, sha256, content, purge_after)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval) RETURNING id`,
        [orgId, input.document.filename, file.length, crypto.createHash('sha256').update(file).digest('hex'), secretBox.seal(file, orgId), String(input.retentionDays || 30)]
      )).rows[0].id;
    }
    const item = (await db.query(
      `INSERT INTO review_items (org_id, workflow_id, document_id, template, title, subject, period, external_ref, fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [orgId, input.workflowId || null, documentId, input.template, input.title, input.subject || null, input.period || null, input.externalRef || null, JSON.stringify(fields)]
    )).rows[0];
    await audit(db, req, {
      orgId, actorUserId: null, actorEmail: null, actorRole: 'monkflow_pipeline',
      action: 'review.received', targetType: 'review_item', targetId: item.id,
      metadata: { title: input.title, template: input.template, fields: fields.length, document: !!file, key: req.ingestKey.name },
    });
    await db.query('COMMIT');
    res.status(201).json({ id: item.id, duplicate: false });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch { /* connection already gone */ }
    // Two posts of the same externalRef at once: the second loses the unique index.
    if (err.code === '23505' && input.externalRef) {
      const first = (await query('SELECT id FROM review_items WHERE org_id = $1 AND external_ref = $2', [orgId, input.externalRef])).rows[0];
      if (first) return res.status(200).json({ id: first.id, duplicate: true });
    }
    throw err;
  } finally {
    db.release();
  }
}));

/** Delete the bytes of every document past its retention date. */
async function purgeExpiredDocuments() {
  const { rowCount } = await query('UPDATE documents SET content = NULL, purged_at = NOW() WHERE content IS NOT NULL AND purge_after < NOW()');
  return rowCount;
}

module.exports = router;
module.exports.purgeExpiredDocuments = purgeExpiredDocuments;
