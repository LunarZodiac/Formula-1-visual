-- Run once in the Supabase SQL Editor as the table owner. The atlas migration
-- runner uses the database owner and does not require Data API role access.
BEGIN;
ALTER TABLE public.atlas_schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.atlas_schema_migrations FROM PUBLIC, anon, authenticated;
COMMIT;

-- RLS must be true and every effective Data API privilege false. TRUNCATE is
-- especially important because it bypasses row-level security.
SELECT c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid,
         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS anon_has_privilege,
       has_table_privilege('authenticated', c.oid,
         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') AS authenticated_has_privilege
FROM pg_class AS c
WHERE c.oid = 'public.atlas_schema_migrations'::regclass;
