-- Migration: Remove category description field from issue_categories and facility_categories
alter table app_private.issue_categories drop column if exists description;
alter table app_private.facility_categories drop column if exists description;

create or replace function app_api.backend_complete_initial_setup(
  actor_uid text,
  issue_categories jsonb,
  facility_categories jsonb
)
returns jsonb language plpgsql security definer
set search_path = app_private, app_api, public as $$
declare setup_record app_private.system_setup%rowtype;
begin
  select * into setup_record from app_private.system_setup where singleton for update;
  if setup_record.completed_at is not null then raise exception 'setup-already-completed'; end if;
  if jsonb_typeof(issue_categories) <> 'array' or jsonb_array_length(issue_categories) = 0
    or jsonb_typeof(facility_categories) <> 'array' or jsonb_array_length(facility_categories) = 0 then
    raise exception 'validation-required';
  end if;

  delete from app_private.issue_categories existing where existing.created_by = 'migration'
    and not exists(select 1 from app_private.issues legacy_issue where legacy_issue.category = existing.id)
    and not exists(select 1 from app_private.user_issue_category_assignments assignment where assignment.category_id = existing.id);
  delete from app_private.facility_categories existing where existing.created_by = 'migration'
    and not exists(select 1 from app_private.facility_reports legacy_facility where legacy_facility.category_id = existing.id)
    and not exists(select 1 from app_private.user_facility_category_assignments assignment where assignment.category_id = existing.id);

  insert into app_private.issue_categories(
    id,label,read_access,author_visible,support_enabled,support_goal,
    support_deadline_days,response_deadline_days,comments_enabled,is_active,is_default,
    sort_order,created_by
  )
  select
    value->>'id', btrim(value->>'label'),
    value->>'readAccess', coalesce((value->>'authorVisible')::boolean,false),
    coalesce((value->>'supportEnabled')::boolean,false),
    nullif(value->>'supportGoal','')::integer,
    nullif(value->>'supportDeadlineDays','')::integer,
    nullif(value->>'responseDeadlineDays','')::integer,
    coalesce((value->>'commentsEnabled')::boolean,true), true, ordinal = 1,
    ordinal - 1, backend_complete_initial_setup.actor_uid
  from jsonb_array_elements(issue_categories) with ordinality as items(value, ordinal)
  on conflict (id) do update set
    label=excluded.label,
    support_enabled=excluded.support_enabled,support_goal=excluded.support_goal,
    support_deadline_days=excluded.support_deadline_days,
    response_deadline_days=excluded.response_deadline_days,
    comments_enabled=excluded.comments_enabled,is_active=true,
    is_default=excluded.is_default,sort_order=excluded.sort_order;

  insert into app_private.facility_categories(
    id,label,is_active,is_default,sort_order,created_by
  )
  select value->>'id', btrim(value->>'label'),
    true, ordinal = 1, ordinal - 1, backend_complete_initial_setup.actor_uid
  from jsonb_array_elements(facility_categories) with ordinality as items(value, ordinal)
  on conflict (id) do update set
    label=excluded.label,is_active=true,
    is_default=excluded.is_default,sort_order=excluded.sort_order;

  update app_private.system_setup set completed_at=now(),completed_by=actor_uid,updated_at=now()
  where singleton;
  insert into app_private.category_configuration_audit(domain,operation,actor_uid,after_value)
  values('setup','complete-setup',actor_uid,jsonb_build_object(
    'issueCategoryCount',jsonb_array_length(issue_categories),
    'facilityCategoryCount',jsonb_array_length(facility_categories)
  ));
  return jsonb_build_object('success',true,'setupCompleted',true);
end;
$$;
