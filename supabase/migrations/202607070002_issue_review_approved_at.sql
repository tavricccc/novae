alter table app_private.issues
  add column if not exists review_approved_at timestamptz;

update app_private.issues
set review_approved_at = coalesce(
  review_approved_at,
  case
    when status not in ('under-review', 'review-rejected')
      and category = 'public-issues'
      and support_deadline_at is not null
      and support_enabled
    then support_deadline_at - interval '14 days'
    else null
  end
)
where review_approved_at is null;
