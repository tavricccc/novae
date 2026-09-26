"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import * as React from "react";
import { ChevronDown, MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { timing } from "@/lib/motion-timing";
import type { CommentSortOption, DiscussionCommentRecord } from "@/types";
import { useDiscussionProfiles } from "@/hooks/use-public-profiles";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StaggerItem, StaggerList } from "@/components/motion/stagger";
import { ContentTransition, StateTransition } from "@/components/motion/state-transition";
import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentThread } from "@/components/comments/comment-thread";
import { useDiscussionComposer } from "@/hooks/use-discussion-composer";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/ui/skeleton-rows";
import { ChoiceSelect } from "@/components/ui/choice-select";

interface ReplyTarget {
  authorUid: string;
  content: string;
  parentCommentId: string;
}

function getReplyExcerpt(content: string) {
  const characters = Array.from(content.trim().replace(/\s+/gu, " "));
  const excerpt = characters.slice(0, 20).join("");
  return characters.length > 20 ? `${excerpt}…` : excerpt;
}

export function Discussion({
  comments,
  enabled = true,
  hasMore = false,
  loading,
  loadingMore = false,
  onCreate,
  onDelete,
  onLoadMore,
  onSortChange,
  sort,
  targetKey,
}: {
  comments: DiscussionCommentRecord[];
  enabled?: boolean;
  hasMore?: boolean;
  loading: boolean;
  loadingMore?: boolean;
  onCreate: (content: string, parentCommentId: string | null) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLoadMore?: () => Promise<void>;
  onSortChange: (sort: CommentSortOption) => void;
  sort: CommentSortOption;
  targetKey: string;
}) {
  useLocaleSubscription();
  const session = useSession();
  const [replyTarget, setReplyTarget] = React.useState<ReplyTarget | null>(null);
  const composer = useDiscussionComposer(session.user?.uid, targetKey, replyTarget?.parentCommentId ?? null, onCreate);
  const profiles = useDiscussionProfiles(comments);
  const composerDockRef = React.useRef<HTMLDivElement>(null);
  const view = !enabled ? "disabled" : loading && !comments.length ? "loading" : "content";

  React.useLayoutEffect(() => {
    if (!enabled || !composerDockRef.current) return;
    const root = document.documentElement;
    const dock = composerDockRef.current;
    const updateClearance = () => {
      root.style.setProperty(
        "--discussion-composer-height",
        `${Math.ceil(dock.getBoundingClientRect().height)}px`,
      );
    };
    updateClearance();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateClearance);
    observer?.observe(dock);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--discussion-composer-height");
    };
  }, [enabled]);

  return (
    <section aria-labelledby="discussion-title">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center gap-2 px-5 py-4 sm:px-7">
          <MessageCircle className="size-4 text-muted-foreground" />
          <h2 className="font-semibold" id="discussion-title">{translate("ui.discussion.title")}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{comments.length}</span>
          <ChoiceSelect
            ariaLabel={translate("ui.discussion.sort")}
            className="ml-auto h-8 w-auto min-w-28 gap-1.5 px-2.5"
            onValueChange={(value) => onSortChange(value as CommentSortOption)}
            options={[
              { label: translate("ui.discussion.newest"), value: "newest" },
              { label: translate("ui.discussion.oldest"), value: "oldest" },
            ]}
            title={translate("ui.discussion.sort")}
            value={sort}
          />
        </div>

        <StateTransition identity={view}>
          <ContentTransition identity={view}>
            {!enabled ? (
              <p className="bg-muted/20 px-5 py-4 text-sm text-muted-foreground sm:px-7">{translate("ui.discussion.disabled")}</p>
            ) : null}

            {view === "loading" ? (
              <SkeletonRows rows={2} />
            ) : comments.length > 0 ? (
              <StaggerList className="divide-y">
                {comments.map((comment) => (
                  <StaggerItem key={comment.id}>
                    <CommentThread
                      comment={comment}
                      currentUid={session.user?.uid}
                      onDelete={onDelete}
                      onReply={(target, parentCommentId) => {
                        setReplyTarget({
                          authorUid: target.author_uid,
                          content: target.content,
                          parentCommentId,
                        });
                      }}
                      profile={profiles[comment.author_uid]}
                      replyActive={replyTarget?.parentCommentId === comment.id}
                      replyProfiles={profiles}
                    />
                  </StaggerItem>
                ))}
              </StaggerList>
            ) : null}
          </ContentTransition>
        </StateTransition>

        {hasMore && onLoadMore ? (
          <div className="flex justify-center px-5 py-4 sm:px-7">
            <Button disabled={loadingMore} onClick={() => void onLoadMore()} size="sm" variant="outline">
              {loadingMore ? <LoadingSpinner /> : <ChevronDown />}
              {loadingMore ? translate("ui.common.loadingMore") : translate("ui.discussion.loadMore")}
            </Button>
          </div>
        ) : null}
      </Card>

      {enabled ? (
        <div className="discussion-composer-dock" ref={composerDockRef}>
          <div className="mx-auto w-full max-w-2xl rounded-[2rem] border bg-background p-2 shadow-[var(--shadow-floating)]">
            <AnimatePresence initial={false}>
            {replyTarget ? (
              <motion.div
                className="mb-1 flex items-start gap-3 overflow-hidden border-b px-2 pb-2 pt-1"
                initial={{ height: 0, opacity: 0, y: 8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: 8 }}
                transition={timing("control")}
              >
                <div className="min-w-0 flex-1 text-xs leading-5">
                  {profiles[replyTarget.authorUid] ? (
                    <p className="font-medium text-foreground">
                      {translate("ui.discussion.replying", {
                        name: profiles[replyTarget.authorUid].displayName,
                      })}
                    </p>
                  ) : <Skeleton className="h-3 w-24" />}
                  <p className="truncate text-muted-foreground">{getReplyExcerpt(replyTarget.content)}</p>
                </div>
                <Button
                  aria-label={translate("ui.common.cancel")}
                  className="shrink-0"
                  onClick={() => {
                    setReplyTarget(null);
                  }}
                  size="icon-xs"
                  variant="ghost"
                >
                  <X />
                </Button>
              </motion.div>
            ) : null}
            </AnimatePresence>
            <CommentComposer
              busy={composer.busy}
              content={composer.content}
              draftStatus={composer.status}
              feedbackState={composer.feedbackState}
              onChange={composer.update}
              onSubmit={composer.submit}
              reply={Boolean(replyTarget)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
