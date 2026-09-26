import assert from "node:assert/strict";
import { asRecord, callAction, database, integrationTest, seedActor } from "./helpers.ts";
import { normalizeNotificationCursor } from "../../src/services/notification-cursor.ts";

integrationTest("notification pages preserve microseconds and same-time ID ordering", async () => {
  const user = await seedActor("notification-pagination");
  const ids = [
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000001",
  ];
  for (const [index, id] of ids.entries()) {
    const createdAt = index < 3 ? "2026-01-01T00:00:00.123456Z" : "2026-01-01T00:00:00.123455Z";
    await database.sql`
      insert into app_private.notifications
        (id, source, recipient_uid, type, target_type, target_id, title, created_at, expires_at)
      values (${id}, 'user', ${user.auth.uid}, 'issue_comment_created', 'issue', 'test',
        'notification', ${createdAt}::timestamptz, '2099-01-01'::timestamptz)`;
  }

  const received: string[] = [];
  let cursor: unknown = null;
  for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
    const response = asRecord(await callAction("listNotificationPages", {
      requests: [{ source: "user", pageSize: 2, cursor }],
    }, user.auth));
    const page = asRecord(asRecord(response.pages).user);
    received.push(...(page.notifications as Array<{ id: string }>).map((item) => item.id));
    if (!page.hasMore) break;
    cursor = normalizeNotificationCursor(page.cursor);
    assert.ok(cursor, "A continuing notification page must provide a valid cursor");
  }
  assert.deepEqual(received, ids);
});

integrationTest("expired notifications do not occupy inbox pages or unread hints", async () => {
  const user = await seedActor("notification-expiry");
  for (const expiresAt of ["2000-01-01", "2099-01-01"]) {
    await database.sql`
      insert into app_private.notifications
        (source, recipient_uid, type, target_type, target_id, title, expires_at)
      values ('user', ${user.auth.uid}, 'issue_comment_created', 'issue', 'test',
        ${expiresAt}, ${expiresAt}::timestamptz)`;
  }
  const response = asRecord(await callAction("listNotificationPages", {
    requests: [{ source: "user", pageSize: 1 }],
  }, user.auth));
  const page = asRecord(asRecord(response.pages).user);
  assert.equal(page.hasMore, false);
  assert.equal(page.cursor, null);
  assert.deepEqual((page.notifications as Array<{ title: string }>).map((item) => item.title), ["2099-01-01"]);

  await database.sql`delete from app_private.notifications where expires_at > now()`;
  const hint = asRecord(await callAction("getNotificationUnreadHint", {}, user.auth));
  assert.equal(hint.hasUnread, false);
  const expiredOnly = asRecord(await callAction("listNotificationPages", {
    requests: [{ source: "user", pageSize: 1 }],
  }, user.auth));
  assert.deepEqual(asRecord(asRecord(expiredOnly.pages).user).notifications, []);
});

integrationTest("a delayed mark-opened request cannot make read notifications unread again", async () => {
  const user = await seedActor("notification-open-order");
  const earlier = "2026-01-01T00:00:00.000Z";
  const later = "2026-01-01T00:00:02.000Z";
  await database.sql`
    insert into app_private.notifications
      (source, recipient_uid, type, target_type, target_id, title, created_at, expires_at)
    values ('user', ${user.auth.uid}, 'issue_comment_created', 'issue', 'test',
      'already read', '2026-01-01T00:00:01Z'::timestamptz, '2099-01-01'::timestamptz)`;

  const newer = await database.call("app_api", "backend_mark_notifications_opened", {
    actor_uid: user.auth.uid, opened_at: later,
  });
  assert.ifError(newer.error);
  const delayed = await database.call("app_api", "backend_mark_notifications_opened", {
    actor_uid: user.auth.uid, opened_at: earlier,
  });
  assert.ifError(delayed.error);

  const hint = asRecord(await callAction("getNotificationUnreadHint", {}, user.auth));
  assert.equal(hint.hasUnread, false);
  const state = asRecord(asRecord(await callAction("getNotificationReadState", {}, user.auth)).state);
  for (const key of ["adminOpenedAt", "broadcastOpenedAt", "userOpenedAt"]) {
    assert.equal(Date.parse(String(state[key])), Date.parse(later));
  }
  assert.equal(asRecord(delayed.data).openedAtMs, Date.parse(later));
});
