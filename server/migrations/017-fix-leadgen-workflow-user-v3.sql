-- Fix: assign Lead Generation Pipeline directly by user UUID
-- User: nathan@monkflow.io = e5eaf78d-5ee3-4514-bee2-54698a5f3272

UPDATE workflows
SET user_id = 'e5eaf78d-5ee3-4514-bee2-54698a5f3272',
    updated_at = NOW()
WHERE name = 'Lead Generation Pipeline';
