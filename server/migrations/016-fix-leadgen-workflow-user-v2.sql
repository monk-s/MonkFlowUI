-- Fix: assign Lead Generation Pipeline to nathan@monkflow.io account

UPDATE workflows
SET user_id = (SELECT id FROM users WHERE email = 'nathan@monkflow.io' LIMIT 1),
    updated_at = NOW()
WHERE name = 'Lead Generation Pipeline'
  AND (SELECT id FROM users WHERE email = 'nathan@monkflow.io' LIMIT 1) IS NOT NULL;
