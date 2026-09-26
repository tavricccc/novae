"use client";

import { useState } from "react";
import { useI18n } from "@/i18n";
import { useIssueDetail } from "@/hooks/use-issue-detail";
import { Discussion } from "@/components/discussion";
import {
  getIssueDetailPanels,
  IssueDetailToolbar,
} from "@/components/issues/issue-detail-actions";
import { IssueDetailContent } from "@/components/issues/issue-detail-content";
import { IssueModerationSheet } from "@/components/issues/issue-moderation-sheet";
import { DetailLayout } from "@/components/ui/detail-layout";

export function IssueDetail() {
  const { t } = useI18n();
  const detail = useIssueDetail();
  const [authorHiddenForIssueId, setAuthorHiddenForIssueId] = useState<
    string | null
  >(null);
  const issue = detail.issue;
  const authorVisible = authorHiddenForIssueId !== issue?.id;
  return (
    <DetailLayout
      kind="issue"
      loading={!issue && detail.loading}
      error={!issue && !detail.loading ? detail.error || t('ui.issue.notFound') : undefined}
      onRetry={() => void detail.loadIssue(true)}
      dock={detail.commentsEnabled}
      toolbar={issue ? <IssueDetailToolbar
        canManage={detail.canManageIssue}
        authorVisible={authorVisible}
        deleteFeedbackState={detail.deleteFeedbackState}
        issue={issue}
        onAuthorVisibilityChange={(visible) =>
          setAuthorHiddenForIssueId(visible ? null : detail.issue?.id ?? null)
        }
        onBack={detail.back}
        onDelete={() => void detail.remove()}
        onManage={() => detail.setModerationOpen(true)}
      /> : undefined}
      content={issue && detail.status ? <IssueDetailContent
            issue={issue}
            profile={detail.profile}
            reveal={detail.revealDetail}
            showAuthor={authorVisible}
            status={detail.status}
          /> : undefined}
      discussion={issue && detail.commentsAvailable ? (
            <div className={detail.commentsHighlighted ? "t-panel-reveal" : ""}>
              <Discussion
                key={`issue:${issue.id}`}
                targetKey={`issue:${issue.id}`}
                comments={detail.comments}
                sort={detail.commentSort}
                enabled={detail.commentsEnabled}
                hasMore={detail.commentsHaveMore}
                loading={detail.commentsLoading}
                loadingMore={detail.commentsLoadingMore}
                onCreate={detail.createIssueComment}
                onDelete={detail.removeIssueComment}
                onLoadMore={detail.loadMoreComments}
                onSortChange={detail.setCommentSort}
              />
            </div>
          ) : null}
      panels={issue ? getIssueDetailPanels({
        burst: detail.burst,
        canViewSupporters: detail.canViewSupporters,
        issue,
        onLoadSupporters: () => void detail.loadSupporters(),
        onSupport: () => void detail.support(),
        reveal: detail.revealDetail,
        supportOpen: detail.supportOpen,
        supportProgress: detail.supportProgress,
        supporters: detail.supporters,
        supportersError: detail.supportersError,
        supportersLoading: detail.supportersLoading,
        supporting: detail.supporting,
        timeline: detail.timeline,
      }) : undefined}
      after={issue && detail.canManageIssue ? (
        <IssueModerationSheet
          issue={issue}
          onOpenChange={detail.setModerationOpen}
          onUpdated={detail.setIssue}
          open={detail.moderationOpen}
        />
      ) : null}
    />
  );
}
