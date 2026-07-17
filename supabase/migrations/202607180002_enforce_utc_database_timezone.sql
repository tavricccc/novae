-- timestamptz stores an absolute instant, but PostgreSQL renders and parses it
-- through the session time zone. Keep every new database session on UTC so
-- API boundaries cannot depend on infrastructure locale settings.
do $$
begin
  execute format(
    'alter database %I set timezone to %L',
    current_database(),
    'UTC'
  );
end
$$;

set timezone to 'UTC';
