"use client";

import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useAnnouncementDetail } from "@/hooks/use-announcement-detail";
import { formatDate } from "@/lib/format";
import { shareCurrentPage } from "@/lib/share";
import { returnToPreviousRoute } from "@/lib/navigation-memory";
import { ContentRenderer } from "@/components/content-renderer";
import { ContentAuthor } from "@/components/content-author";
import { Discussion } from "@/components/discussion";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { LikeActionButton } from "@/components/motion/like-action-button";
import { DetailLayout } from "@/components/ui/detail-layout";
import { DetailToolbar } from "@/components/detail-toolbar";
import { DetailActionsMenu } from "@/components/detail-actions-menu";
import { DetailBadge, DetailCardHeader, DetailCardBody } from "@/components/ui/detail-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";

export function AnnouncementDetail() {
  const router = useRouter();
  const { t } = useI18n();
  const detail = useAnnouncementDetail();
  const { announcement, profile } = detail;
  return (
    <DetailLayout
      kind="announcement"
      loading={!announcement && detail.loading}
      error={!announcement && !detail.loading ? detail.error || t('ui.announcement.notFound') : undefined}
      onRetry={() => void detail.load(true)}
      dock={detail.commentsEnabled}
      toolbar={announcement ? <DetailToolbar
        actions={
          detail.canManage ? (
            <DetailActionsMenu
              remove={{
                description: t("ui.announcement.deleteDescription"),
                label: t("ui.announcement.delete"),
                onConfirm: () => void detail.remove(),
                state: detail.deleteFeedbackState,
                title: t("ui.announcement.deleteTitle"),
              }}
            />
          ) : null
        }
        backLabel={t("ui.announcement.back")}
        onBack={() =>
          returnToPreviousRoute(router, "/announcements", "/announcements")
        }
        onShare={() =>
              void shareCurrentPage(announcement.title)
                .then((result) => {
                  if (result === "copied") toast.success(t("ui.common.linkCopied"));
                })
                .catch(() => toast.error(t("ui.common.shareFailed")))
        }
        shareLabel={t("ui.announcement.share")}
      /> : undefined}
      content={announcement ? <>
            <DetailCardHeader
              badges={<DetailBadge>{t("ui.announcement.badge")}</DetailBadge>}
              title={<SkeletonReveal as="div" enabled={detail.revealDetail} skeleton={<Skeleton className="h-9 w-3/5" />}><h1 className="text-balance">
                {announcement.title}
              </h1></SkeletonReveal>}
              metadata={<>
                <ContentAuthor profile={profile ?? undefined} />
                <span>·</span>
                <SkeletonReveal enabled={detail.revealDetail} skeleton={<Skeleton className="h-4 w-32" />}><span>{formatDate(announcement.published_at)}</span></SkeletonReveal>
              </>}
            />
            {announcement.content?.trim() ? (
              <DetailCardBody>
                <ContentRenderer
                  content={announcement.content}
                  fallbackAlt={announcement.title}
                  revealText={detail.revealDetail}
                />
              </DetailCardBody>
            ) : null}
      </> : undefined}
      discussion={announcement ? <Discussion
            key={`announcement:${announcement.id}`}
            targetKey={`announcement:${announcement.id}`}
            comments={detail.comments}
            sort={detail.commentSort}
            enabled={detail.commentsEnabled}
            hasMore={detail.commentsHaveMore}
            loading={detail.commentsLoading}
            loadingMore={detail.commentsLoadingMore}
            onCreate={detail.createComment}
            onDelete={detail.removeComment}
            onLoadMore={detail.loadMoreComments}
            onSortChange={detail.setCommentSort}
          /> : undefined}
      panels={announcement ? [{ key: "reaction", content:
            <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <LikeActionButton
                active={announcement.currentUserLiked}
                burst={detail.burst}
                busy={detail.liking}
                icon={Heart}
                label={
                  announcement.currentUserLiked
                    ? t("ui.announcement.liked")
                    : t("ui.announcement.like")
                }
                onClick={() => void detail.like()}
                reaction="heart"
              />
            </div>
            <SkeletonReveal as="div" enabled={detail.revealDetail} skeleton={<Skeleton className="mx-auto h-4 w-24" />}><div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <AnimatedNumber value={announcement.like_count} />
              {t("ui.announcement.peopleLiked")}
            </div></SkeletonReveal>
            </div>
      }] : undefined}
    />
  );
}
