-- schema-patch-003.sql
-- Update handle_new_user() to read display_name from signup metadata.
-- The signUp() call passes data: { display_name } which lands in raw_user_meta_data.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), '')
  );
  RETURN NEW;
END;
$$;
