-- Supabase Storage: private buckets and locked-down policies.
--
-- This migration only does something on a Supabase database (one that has the `storage` schema). On any
-- other PostgreSQL it does nothing, so the same migration history works everywhere.
--
-- SECURITY MODEL
--   * All four buckets are PRIVATE (public = false): no object has a public URL.
--   * The browser never talks to Storage with a user token. The application authenticates the user with its
--     own session, checks tenant + permission + scope, and only then hands out a short-lived SIGNED URL
--     (created server-side with the service-role key, which never leaves the server).
--   * So no client role (anon, authenticated) needs ANY direct access to these buckets. The policy below is
--     RESTRICTIVE: it is ANDed with every other policy, so even if someone later adds a permissive policy
--     (for example "authenticated users can read all objects") it cannot open these buckets.
--     The service role bypasses RLS and is unaffected. Signed URLs are validated by the Storage API and
--     do not depend on these policies.
--   * Each bucket also enforces a maximum file size and an allow-list of MIME types on upload.
--
-- Object key layout (built by the server, never from a client-supplied name):
--   <organization id>/<parent id>/<file id>.<ext>
DO $$
DECLARE
  photos_mime text[] := ARRAY['image/jpeg', 'image/png', 'image/webp'];
  docs_mime text[] := ARRAY[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  client_role text;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'No Supabase storage schema found: skipping storage buckets and policies.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
    ('vehicle-photos',     'vehicle-photos',     false, 10485760, photos_mime),
    ('vehicle-documents',  'vehicle-documents',  false, 26214400, docs_mime),
    ('customer-documents', 'customer-documents', false, 26214400, docs_mime),
    ('deal-documents',     'deal-documents',     false, 26214400, docs_mime)
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- One restrictive policy per client role (policy names are unique per table). A bucket outside our list is
  -- untouched. Re-running the migration replaces the policies.
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'cda_deny_' || client_role);
      EXECUTE format(
        'CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR ALL TO %I '
        || 'USING (bucket_id NOT IN (''vehicle-photos'', ''vehicle-documents'', ''customer-documents'', ''deal-documents'')) '
        || 'WITH CHECK (bucket_id NOT IN (''vehicle-photos'', ''vehicle-documents'', ''customer-documents'', ''deal-documents''))',
        'cda_deny_' || client_role,
        client_role
      );
    END IF;
  END LOOP;
END
$$;
