import assert from "node:assert/strict";
import {
  asRecord,
  callAction,
  expectActionError,
  integrationTest,
  saveCategoryDraft,
  seedActor,
  database,
} from "./helpers.ts";

async function createIssue(
  actor: Awaited<ReturnType<typeof seedActor>>,
  category: "public-issues" | "rights-maintenance",
  label: string,
) {
  const result = asRecord(await callAction("createIssue", {
    category,
    content: `Integration content ${label}`,
    title: `Test ${label}`.slice(0, 30),
  }, actor.auth));
  return asRecord(result.issue);
}

integrationTest("own proposal search filters content without accepting another user's scope", async () => {
  const owner = await seedActor("own-search-owner");
  const stranger = await seedActor("own-search-stranger");
  const own = await createIssue(owner, "public-issues", "search-needle");
  await createIssue(owner, "public-issues", "ordinary");
  await createIssue(stranger, "public-issues", "search-needle");
  const search = asRecord(await callAction("listUserIssues", {
    uid: stranger.auth.uid,
    titleQuery: "content search-needle",
    statusBucket: "active",
    sort: "latest",
    pageSize: 20,
  }, owner.auth));
  assert.deepEqual((search.issues as Array<{ id: string }>).map(issue => issue.id), [own.id]);
  const wildcard = asRecord(await callAction("listUserIssues", { titleQuery: "%" }, owner.auth));
  assert.deepEqual(wildcard.issues, []);
  const all = asRecord(await callAction("listUserIssues", { titleQuery: "" }, owner.auth));
  assert.equal((all.issues as unknown[]).length, 2);

  await database.sql`update app_private.issues set created_at = '2026-01-01T00:00:00.123456Z'::timestamptz
    where author_uid = ${owner.auth.uid}`;
  const firstPage = asRecord(await callAction("listUserIssues", { titleQuery: "content", pageSize: 1 }, owner.auth));
  assert.equal(firstPage.hasMore, true);
  const nextPage = asRecord(await callAction("listUserIssues", {
    titleQuery: "content", pageSize: 1, cursor: firstPage.cursor,
  }, owner.auth));
  assert.equal((nextPage.issues as unknown[]).length, 1);
  assert.notEqual(asRecord((nextPage.issues as unknown[])[0]).id, asRecord((firstPage.issues as unknown[])[0]).id);
});

integrationTest("issue reads, scoped moderation, support, comments, and deletion", async () => {
  const admin = await seedActor("issue-admin", { roles: ["platform-admin"] });
  const owner = await seedActor("issue-owner");
  const user = await seedActor("issue-user");
  const stranger = await seedActor("issue-stranger");
  const publicManager = await seedActor("issue-public-manager", {
    categoryIds: ["public-issues"],
  });
  const rightsManager = await seedActor("issue-rights-manager", {
    categoryIds: ["rights-maintenance"],
  });

  assert.ok(publicManager.auth.permissions.includes("proposal.manage"));
  assert.deepEqual(publicManager.auth.managedIssueCategoryIds, ["public-issues"]);

  const publicIssue = await createIssue(owner, "public-issues", "public");
  const publicIssueId = String(publicIssue.id);
  assert.equal(publicIssue.status, "under-review");
  assert.equal(publicIssue.readAccess, "reviewed-school");

  const categoryManagement = asRecord(await callAction("getCategoryManagement", {}, admin.auth));
  const originalPublicCategory = asRecord((categoryManagement.issueCategories as unknown[])
    .find((category) => asRecord(category).id === "public-issues"));
  const nextSupportGoal = Number(originalPublicCategory.supportGoal) + 1;
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [{
      ...originalPublicCategory,
      commentsEnabled: false,
      supportGoal: nextSupportGoal,
    }],
  });
  const futureDefaultsIssue = await createIssue(owner, "public-issues", "future-defaults");
  assert.equal(futureDefaultsIssue.commentsEnabled, false);
  assert.equal(futureDefaultsIssue.supportGoal, nextSupportGoal);
  const unchangedExistingIssue = asRecord(asRecord(await callAction(
    "getIssue",
    { issueId: publicIssueId },
    owner.auth,
  )).issue);
  assert.equal(unchangedExistingIssue.commentsEnabled, false);
  assert.equal(unchangedExistingIssue.supportGoal, publicIssue.supportGoal);
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [originalPublicCategory],
  });
  const stillClosedAfterCategoryReopen = asRecord(asRecord(await callAction(
    "getIssue",
    { issueId: publicIssueId },
    owner.auth,
  )).issue);
  assert.equal(stillClosedAfterCategoryReopen.commentsEnabled, true);

  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [{ ...originalPublicCategory, commentsEnabled: false }],
  });
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [originalPublicCategory],
  });
  const reopenedAfterCategoryCycle = asRecord(asRecord(await callAction(
    "getIssue",
    { issueId: publicIssueId },
    owner.auth,
  )).issue);
  assert.equal(reopenedAfterCategoryCycle.commentsEnabled, true);

  await assert.rejects(
    () => database.sql`update app_private.issues set read_access = 'school' where id = ${publicIssueId}`,
    /immutable-category-policy/u,
  );

  const ownerRead = asRecord(await callAction(
    "getIssue",
    { issueId: publicIssueId },
    owner.auth,
  ));
  assert.equal(asRecord(ownerRead.issue).id, publicIssueId);
  assert.equal(asRecord(ownerRead.issue).canManageIssue, false);
  await expectActionError(
    "not-found",
    () => callAction("getIssue", { issueId: publicIssueId }, user.auth),
  );

  const hiddenList = asRecord(await callAction("listIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
  }, user.auth));
  assert.equal(
    (hiddenList.issues as Array<Record<string, unknown>>)
      .some((issue) => issue.id === publicIssueId),
    false,
  );
  assert.equal(asRecord(hiddenList.statusCounts)["under-review"], 2);
  assert.equal(typeof hiddenList.version, "number");
  const managerList = asRecord(await callAction("listIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
  }, publicManager.auth));
  const managerIssue = (managerList.issues as JsonRecord[]).find((issue) => issue.id === publicIssueId);
  assert.ok(managerIssue);
  assert.equal("content" in managerIssue, false);
  // The counts describe the category, so a manager and a member read the same numbers
  // even though the manager is the only one who can open the proposals behind them.
  assert.equal(asRecord(managerList.statusCounts)["under-review"], 2);

  const firstPage = asRecord(await callAction("listIssues", {
    activeFilter: "public-issues",
    pageSize: 1,
    sort: "latest",
    statusBucket: "active",
  }, publicManager.auth));
  assert.ok(firstPage.cursor);
  const secondPage = asRecord(await callAction("listIssues", {
    activeFilter: "public-issues",
    cursor: firstPage.cursor,
    pageSize: 1,
    sort: "latest",
    statusBucket: "active",
  }, publicManager.auth));
  assert.deepEqual(secondPage.statusCounts, {});
  const searched = asRecord(await callAction("searchIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
    titleQuery: "public",
  }, publicManager.auth));
  assert.ok((searched.issues as JsonRecord[]).some((issue) => issue.id === publicIssueId));
  assert.equal(typeof searched.version, "number");
  const ownIssues = asRecord(await callAction("listUserIssues", {
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
  }, owner.auth));
  const ownIssue = (ownIssues.issues as JsonRecord[]).find((issue) => issue.id === publicIssueId);
  assert.ok(ownIssue);
  assert.equal("content" in ownIssue, false);
  assert.equal(typeof ownIssues.version, "number");

  await expectActionError(
    "not-found",
    () => callAction("listComments", {
      issueId: publicIssueId,
      pageSize: 30,
    }, publicManager.auth),
  );

  await expectActionError(
    "permission-denied",
    () => callAction("moderateIssueStatus", {
      issueId: publicIssueId,
      status: "pending",
    }, user.auth),
  );
  await expectActionError(
    "permission-denied",
    () => callAction("moderateIssueStatus", {
      issueId: publicIssueId,
      status: "pending",
    }, rightsManager.auth),
  );
  const approved = asRecord(await callAction("moderateIssueStatus", {
    issueId: publicIssueId,
    status: "pending",
  }, publicManager.auth));
  assert.equal(asRecord(approved.issue).status, "pending");
  const reopenedAfterCategoryEnabled = asRecord(asRecord(await callAction("getIssue", {
    issueId: publicIssueId,
  }, owner.auth)).issue);
  assert.equal(reopenedAfterCategoryEnabled.commentsEnabled, true);

  // A search reaches the body, not only the title.
  const bodyMatch = asRecord(await callAction("searchIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
    titleQuery: "content public",
  }, user.auth));
  assert.ok((bodyMatch.issues as JsonRecord[]).some((issue) => issue.id === publicIssueId));
  // The author's name is searchable exactly for whoever may see the author.
  // public-issues hides it from members, so a member searching that name finds
  // nothing there, while the author and the category's manager both do.
  const strangerAuthorMatch = asRecord(await callAction("searchIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
    titleQuery: "Integration issue-owner",
  }, user.auth));
  assert.equal(
    (strangerAuthorMatch.issues as JsonRecord[]).some((issue) => issue.id === publicIssueId),
    false,
  );
  const ownAuthorMatch = asRecord(await callAction("searchIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
    titleQuery: "Integration issue-owner",
  }, owner.auth));
  assert.ok((ownAuthorMatch.issues as JsonRecord[]).some((issue) => issue.id === publicIssueId));
  const managerAuthorMatch = asRecord(await callAction("searchIssues", {
    activeFilter: "public-issues",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
    titleQuery: "Integration issue-owner",
  }, publicManager.auth));
  assert.ok((managerAuthorMatch.issues as JsonRecord[]).some((issue) => issue.id === publicIssueId));

  await expectActionError(
    "permission-denied",
    () => callAction("updateIssueResult", {
      issueId: publicIssueId,
      resultContent: "Not allowed",
    }, user.auth),
  );
  const resultWrite = asRecord(await callAction("updateIssueResult", {
    issueId: publicIssueId,
    resultContent: "Integration result",
  }, publicManager.auth));
  assert.equal(asRecord(resultWrite.issue).resultContent, "Integration result");

  await expectActionError(
    "support-not-available",
    () => callAction("toggleSupport", {
      issueId: publicIssueId,
    }, owner.auth),
  );
  const supported = asRecord(await callAction("toggleSupport", {
    issueId: publicIssueId,
  }, user.auth));
  assert.equal(supported.supported, true);
  // The author's own support is part of the count, so a second supporter makes
  // two and withdrawing leaves the author's one behind rather than zero.
  assert.equal(supported.supportCount, 2);
  const supporterLists = await Promise.all([
    callAction("listIssueSupporters", { issueId: publicIssueId }, owner.auth),
    callAction("listIssueSupporters", { issueId: publicIssueId }, publicManager.auth),
    callAction("listIssueSupporters", { issueId: publicIssueId }, admin.auth),
  ]);
  for (const response of supporterLists) {
    const supporters = asRecord(response).supporters as Array<Record<string, unknown>>;
    assert.deepEqual(supporters.map((entry) => entry.uid), [owner.auth.uid, user.auth.uid]);
    assert.equal(supporters[0]?.isAuthor, true);
    assert.equal(supporters[1]?.isAuthor, false);
  }
  await expectActionError(
    "permission-denied",
    () => callAction("listIssueSupporters", { issueId: publicIssueId }, user.auth),
  );
  await expectActionError(
    "permission-denied",
    () => callAction("listIssueSupporters", { issueId: publicIssueId }, rightsManager.auth),
  );
  const removed = asRecord(await callAction("removeSupport", {
    issueId: publicIssueId,
  }, user.auth));
  assert.equal(removed.supported, false);
  assert.equal(removed.supportCount, 1);

  // Reaching the threshold moves a proposal on to being worked on, and that is
  // not a cap: it stays open to support until its deadline.
  await callAction("moderateIssueStatus", {
    issueId: publicIssueId,
    status: "processing",
  }, publicManager.auth);
  const supportedWhileProcessing = asRecord(await callAction("toggleSupport", {
    issueId: publicIssueId,
  }, user.auth));
  assert.equal(supportedWhileProcessing.supported, true);
  assert.equal(supportedWhileProcessing.supportCount, 2);
  const withdrawnWhileProcessing = asRecord(await callAction("removeSupport", {
    issueId: publicIssueId,
  }, user.auth));
  assert.equal(withdrawnWhileProcessing.supportCount, 1);
  await callAction("moderateIssueStatus", {
    issueId: publicIssueId,
    status: "pending",
  }, publicManager.auth);

  // The support goal is frozen onto a proposal at creation, so change its
  // category default first and restore it before crossing the threshold.
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [{
      ...originalPublicCategory,
      supportGoal: 2,
    }],
  });
  const goalIssue = await createIssue(owner, "public-issues", "support-goal");
  const goalIssueId = String(goalIssue.id);
  assert.equal(goalIssue.supportGoal, 2);
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [originalPublicCategory],
  });
  await callAction("moderateIssueStatus", {
    issueId: goalIssueId,
    status: "pending",
  }, publicManager.auth);
  const goalSupport = asRecord(await callAction("toggleSupport", {
    issueId: goalIssueId,
  }, user.auth));
  assert.equal(goalSupport.supported, true);
  assert.equal(goalSupport.supportCount, 2);
  assert.equal(goalSupport.goalMet, true);
  const goalIssueAfterSupport = asRecord(asRecord(await callAction("getIssue", {
    issueId: goalIssueId,
  }, owner.auth)).issue);
  assert.equal(goalIssueAfterSupport.status, "processing");
  assert.equal(Object.hasOwn(goalIssueAfterSupport, "responseDeadlineAt"), false);
  assert.ok(goalIssueAfterSupport.supportMetAt);
  assert.ok(goalIssueAfterSupport.supportDeadlineAt);

  const commentWrite = asRecord(await callAction("createComment", {
    content: "Integration issue comment",
    issueId: publicIssueId,
  }, user.auth));
  const commentId = String(asRecord(commentWrite.comment).id);
  const secondCommentWrite = asRecord(await callAction("createComment", {
    content: "Second integration issue comment",
    issueId: publicIssueId,
  }, user.auth));
  const secondCommentId = String(asRecord(secondCommentWrite.comment).id);
  const comments = asRecord(await callAction("listComments", {
    issueId: publicIssueId,
    pageSize: 30,
    sort: "newest",
  }, stranger.auth));
  assert.ok(JSON.stringify(comments).includes(commentId));
  assert.equal(typeof comments.version, "number");
  const newestIds = (comments.comments as Array<Record<string, unknown>>).map((comment) => String(comment.id));
  const oldestComments = asRecord(await callAction("listComments", {
    issueId: publicIssueId,
    pageSize: 30,
    sort: "oldest",
  }, stranger.auth));
  const oldestIds = (oldestComments.comments as Array<Record<string, unknown>>).map((comment) => String(comment.id));
  assert.deepEqual(oldestIds, [...newestIds].reverse());
  await expectActionError(
    "permission-denied",
    () => callAction("deleteComment", {
      commentId,
    }, stranger.auth),
  );
  await callAction("deleteComment", {
    commentId,
  }, user.auth);
  await callAction("deleteComment", {
    commentId: secondCommentId,
  }, user.auth);

  const managedCommentWrite = asRecord(await callAction("createComment", {
    content: "Manager removable comment",
    issueId: publicIssueId,
  }, stranger.auth));
  await callAction("deleteComment", {
    commentId: String(asRecord(managedCommentWrite.comment).id),
  }, publicManager.auth);

  const completedIssue = asRecord(await callAction("moderateIssueStatus", {
    issueId: publicIssueId,
    status: "completed",
  }, publicManager.auth));
  assert.equal(asRecord(completedIssue.issue).commentsEnabled, false);
  await expectActionError(
    "comments-disabled",
    () => callAction("createComment", {
      content: "Must be rejected after proposal closes",
      issueId: publicIssueId,
    }, user.auth),
  );

  const privateIssue = await createIssue(owner, "rights-maintenance", "private");
  const privateIssueId = String(privateIssue.id);
  await expectActionError(
    "not-found",
    () => callAction("getIssue", { issueId: privateIssueId }, stranger.auth),
  );
  await expectActionError(
    "permission-denied",
    () => callAction("moderateIssueStatus", {
      issueId: privateIssueId,
      status: "processing",
    }, publicManager.auth),
  );
  const privateManaged = asRecord(await callAction("moderateIssueStatus", {
    issueId: privateIssueId,
    status: "processing",
  }, rightsManager.auth));
  assert.equal(asRecord(privateManaged.issue).status, "processing");

  const strangerPrivateList = asRecord(await callAction("listIssues", {
    activeFilter: "rights-maintenance",
    pageSize: 20,
    sort: "latest",
    statusBucket: "active",
  }, stranger.auth));
  assert.deepEqual(strangerPrivateList.issues, []);
  // A private category still reports how much work it holds: the volume is the point,
  // and no proposal of it is readable here.
  assert.equal(asRecord(strangerPrivateList.statusCounts).processing, 1);

  const managerDeleteIssue = await createIssue(owner, "rights-maintenance", "manager-delete");
  await callAction("deleteIssue", {
    issueId: String(managerDeleteIssue.id),
  }, rightsManager.auth);

  const ownerDeleteIssue = await createIssue(owner, "rights-maintenance", "owner-delete");
  await expectActionError(
    "permission-denied",
    () => callAction("deleteIssue", {
      issueId: String(ownerDeleteIssue.id),
    }, stranger.auth),
  );
  const ownerDeleteBeforePolicy = asRecord(await callAction("getIssue", {
    issueId: String(ownerDeleteIssue.id),
  }, owner.auth));
  assert.equal(asRecord(ownerDeleteBeforePolicy.issue).canDeleteIssue, false);
  await expectActionError(
    "permission-denied",
    () => callAction("deleteIssue", {
      issueId: String(ownerDeleteIssue.id),
    }, owner.auth),
  );
  const deletionManagement = asRecord(await callAction("getCategoryManagement", {}, admin.auth));
  const rightsCategory = asRecord((deletionManagement.issueCategories as unknown[])
    .find((category) => asRecord(category).id === "rights-maintenance"));
  await saveCategoryDraft(admin.auth, {
    upsertIssueCategories: [{ ...rightsCategory, authorDeleteEnabled: true }],
  });
  const ownerDeleteAfterPolicy = asRecord(await callAction("getIssue", {
    issueId: String(ownerDeleteIssue.id),
  }, owner.auth));
  assert.equal(asRecord(ownerDeleteAfterPolicy.issue).canDeleteIssue, true);
  await callAction("deleteIssue", {
    issueId: String(ownerDeleteIssue.id),
  }, owner.auth);
  await callAction("deleteIssue", {
    issueId: String(futureDefaultsIssue.id),
  }, admin.auth);
  await callAction("deleteIssue", {
    issueId: publicIssueId,
  }, admin.auth);
});

type JsonRecord = Record<string, unknown>;
