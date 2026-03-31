-- Insert the Lead Generation Pipeline workflow record.
-- Uses a unique index on (user_id, name) to make this migration idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_user_name
  ON workflows(user_id, name);

INSERT INTO workflows (user_id, name, description, status, trigger_type, trigger_config, cron_expression, definition, total_runs, success_rate)
SELECT
  u.id,
  'Lead Generation Pipeline',
  'Automated daily pipeline that discovers local service businesses, diagnoses their web presence, generates personalized outreach emails via Claude AI, and delivers them through rotating sender addresses.',
  'active',
  'schedule',
  '{"timezone": "America/Chicago", "days": "weekdays"}'::jsonb,
  '0 8 * * 1-5',
  '{
    "nodes": [
      {
        "id": "node-1",
        "type": "trigger",
        "label": "Search",
        "description": "SerpAPI search across cities and firm types",
        "position": { "x": 100, "y": 200 }
      },
      {
        "id": "node-2",
        "type": "action",
        "label": "Diagnose & Score",
        "description": "Website diagnosis, email extraction, and lead scoring",
        "position": { "x": 350, "y": 200 }
      },
      {
        "id": "node-3",
        "type": "ai",
        "label": "Generate Emails",
        "description": "Claude AI personalized email generation",
        "position": { "x": 600, "y": 200 }
      },
      {
        "id": "node-4",
        "type": "action",
        "label": "Send Emails",
        "description": "Resend email delivery with sender rotation",
        "position": { "x": 850, "y": 200 }
      },
      {
        "id": "node-5",
        "type": "action",
        "label": "Owner Summary",
        "description": "Send summary report to owner",
        "position": { "x": 1100, "y": 200 }
      }
    ],
    "connections": [
      { "from": "node-1", "to": "node-2" },
      { "from": "node-2", "to": "node-3" },
      { "from": "node-3", "to": "node-4" },
      { "from": "node-4", "to": "node-5" }
    ]
  }'::jsonb,
  0,
  0
FROM users u
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (user_id, name) DO UPDATE SET updated_at = NOW();
