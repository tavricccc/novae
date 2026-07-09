create or replace function app_api.backend_set_announcement_like(
  announcement_id uuid,
  actor_uid text,
  liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = app_private, app_api, public
as $$
declare
  next_like_count integer;
begin
  if liked then
    insert into app_private.announcement_likes(announcement_id, uid)
    values (
      backend_set_announcement_like.announcement_id,
      backend_set_announcement_like.actor_uid
    )
    on conflict on constraint announcement_likes_pkey do nothing;
  else
    delete from app_private.announcement_likes
    where announcement_likes.announcement_id = backend_set_announcement_like.announcement_id
      and announcement_likes.uid = backend_set_announcement_like.actor_uid;
  end if;

  select announcements.like_count into next_like_count
  from app_private.announcements
  where announcements.id = backend_set_announcement_like.announcement_id;

  if not found then
    raise exception 'not-found';
  end if;

  return jsonb_build_object('liked', liked, 'like_count', coalesce(next_like_count, 0));
end;
$$;

revoke all on function app_api.backend_set_announcement_like(uuid,text,boolean) from public, anon, authenticated;
grant execute on function app_api.backend_set_announcement_like(uuid,text,boolean) to service_role;
