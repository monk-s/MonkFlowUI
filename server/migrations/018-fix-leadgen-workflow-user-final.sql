-- Final fix: assign Lead Generation Pipeline to nathan@monkflow.io by UUID

UPDATE workflows
SET user_id = 'e5eaf78d-5ee3-4514-bee2-54698a5f3272',
    updated_at = NOW()
WHERE name = 'Lead Generation Pipeline';
