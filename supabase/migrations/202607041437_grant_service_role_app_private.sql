grant usage on schema app_api to service_role;
grant usage on schema app_private to service_role;

grant all privileges on all tables in schema app_private to service_role;
grant usage, select, update on all sequences in schema app_private to service_role;

alter default privileges in schema app_private
grant all privileges on tables to service_role;

alter default privileges in schema app_private
grant usage, select, update on sequences to service_role;
