-- Dynamically drop the auto-named CHECK constraint on role column
DO $$ DECLARE _con text;
BEGIN
  SELECT conname INTO _con FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%role%' LIMIT 1;
  IF _con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(_con);
  END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('superadmin','owner','admin','editor','viewer'));

UPDATE users SET role = 'superadmin', updated_at = NOW()
  WHERE id = 'e5eaf78d-5ee3-4514-bee2-54698a5f3272';
