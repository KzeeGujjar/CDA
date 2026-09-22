-- The database time zone must be UTC.
--
-- Prisma (through its pg driver adapter) sends and reads timestamptz values as UTC wall-clock time and
-- does not convert. When a connection's TimeZone is anything else, the stored instants are shifted by the
-- offset relative to now() and to every SQL comparison the dashboard makes. Setting the DATABASE default
-- fixes it for every new connection, including connections made through a pooler, where per-session
-- settings do not survive. Presentation time zones (Asia/Dubai...) are applied explicitly per query
-- with AT TIME ZONE, using organizations.timezone.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'could not set the database time zone to UTC (insufficient privilege). Run: ALTER DATABASE % SET timezone TO ''UTC'';', current_database();
END
$$;
