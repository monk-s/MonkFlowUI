-- Fix: assign Lead Generation Pipeline to the correct user (nate@thelinders.com)
-- Migration 014 used the first user by created_at, which may not be the active account.

UPDATE workflows
SET user_id = (SELECT id FROM users WHERE email = 'nate@thelinders.com' LIMIT 1),
    updated_at = NOW()
WHERE name = 'Lead Generation Pipeline'
  AND (SELECT id FROM users WHERE email = 'nate@thelinders.com' LIMIT 1) IS NOT NULL;
