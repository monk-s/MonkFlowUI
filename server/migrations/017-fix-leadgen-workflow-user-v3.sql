-- Fix: assign Lead Generation Pipeline to demo@monkflow.io (the actual account)

UPDATE workflows
SET user_id = (SELECT id FROM users WHERE email = 'demo@monkflow.io' LIMIT 1),
    updated_at = NOW()
WHERE name = 'Lead Generation Pipeline'
  AND (SELECT id FROM users WHERE email = 'demo@monkflow.io' LIMIT 1) IS NOT NULL;
