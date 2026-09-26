"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  ArrowDown,
  CheckCircle2,
  ChevronRight,
  Megaphone,
  MessageCircle,
  Trash2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { useNotificationsPage } from "@/hooks/use-notifications-page";
import { formatDate } from "@/lib/format";
import { notificationTargetPath } from "@/lib/notification-target";
import type { NotificationRecord } from "@/types";
import { StaggerItem, StaggerList } from "@/components/motion/stagger";
import { ContentTransition, StateTransition } from "@/components/motion/state-transition";
import { Button } from "@/components/ui/button";
import { ListSection, RowInner, rowClass } from "@/components/ui/list";
import {
  EmptyStateContent,
  ErrorState,
  ErrorStateContent,
  PageHeader,
} from "@/components/ui/page-state";
import { NotificationRowSkeleton } from "@/components/notifications/notification-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";

const TITLE_KEYS: Record<string, string> = {
  announcement_comment_created: "ui.notification.comment",
  announcement_created: "ui.notification.announcement",
  facility_report_created: "ui.notification.facilityCreated",
  facility_status_changed: "ui.notification.facilityUpdated",
  issue_comment_created: "ui.notification.comment",
  issue_created: "ui.notification.issueCreated",
  issue_deleted: "ui.notification.issueDeleted",
  support_goal_met: "ui.notification.goalMet",
};

function notificationIcon(notification: NotificationRecord): LucideIcon {
  if (notification.type.startsWith("announcement")) return Megaphone;
  if (notification.type.startsWith("facility")) return Wrench;
  if (notification.type.includes("comment")) return MessageCircle;
  if (notification.type === "issue_deleted") return Trash2;
  return CheckCircle2;
}

const SKELETON_ROWS = 5;

function NotificationTarget({ children, notification }: { children: ReactNode; notification: NotificationRecord }) {
  const { t } = useI18n();
  const target = notificationTargetPath(notification);
  const className = `${rowClass} items-start`;
  return target ? (
    <Link className={className} href={target} prefetch={false} scroll={false}>{children}</Link>
  ) : (
    <button className={className} onClick={() => toast.info(t("ui.notification.issueGone"))} type="button">{children}</button>
  );
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const state = useNotificationsPage();
  const pending = state.loading && !state.notifications.length;
  const count = state.notifications.length || (pending ? SKELETON_ROWS : 1);
  const view = state.error && state.notifications.length === 0
    ? "error"
    : pending
      ? "loading"
      : state.notifications.length === 0
        ? "empty"
        : "content";
  return (
    <div className="space-y-5">
      <PageHeader title={t("ui.nav.notifications")} />
      {state.error && state.notifications.length > 0 ? (
        <ErrorState error={state.error} onRetry={() => void state.load()} />
      ) : null}
      <div aria-busy={state.loading} data-notification-surface>
        <ListSection className="min-w-0">
        <StateTransition identity={view}>
          {view === "error" ? (
            <ContentTransition identity="error">
              <ErrorStateContent error={state.error!} onRetry={() => void state.load()} />
            </ContentTransition>
          ) : view === "empty" ? (
            <ContentTransition identity="empty">
              <EmptyStateContent
                description={t("ui.notification.emptyDescription")}
                title={t("ui.notification.emptyTitle")}
              />
            </ContentTransition>
          ) : (
            <StaggerList className="rule-list">
              {Array.from({ length: count }, (_, index) => {
                const notification = state.notifications[index];
                const rowIdentity = pending ? "loading" : notification ? notification.id : view;
                return (
                  <StaggerItem key={index}>
                    <ContentTransition identity={rowIdentity}>
                      {notification ? (
                        <NotificationTarget notification={notification}>
                          <RowInner
                            detail={
                              <SkeletonReveal
                                as="span"
                                enabled={state.revealFields}
                                stableLayout
                                skeleton={<Skeleton className="mt-1 block h-3 w-4/5" />}
                              >
                                {notification.body_preview}
                              </SkeletonReveal>
                            }
                            icon={notificationIcon(notification)}
                            label={
                              <SkeletonReveal
                                as="span"
                                enabled={state.revealFields}
                                stableLayout
                                skeleton={<Skeleton className="block h-4 w-2/5" />}
                              >
                                {t(TITLE_KEYS[notification.type] ?? "ui.notification.issueUpdated")}
                              </SkeletonReveal>
                            }
                            trailing={
                              <>
                                {!notification.is_read ? (
                                  <span
                                    className="t-notification-badge mt-2 size-2 shrink-0 rounded-full bg-[var(--notification-accent)]"
                                    data-open="true"
                                  />
                                ) : null}
                                <ChevronRight
                                  aria-hidden
                                  className="mt-1.5 size-4 shrink-0 text-muted-foreground"
                                />
                              </>
                            }
                            value={
                              <span className="mt-0.5 block text-xs">
                                {formatDate(notification.created_at)}
                              </span>
                            }
                          />
                        </NotificationTarget>
                      ) : pending ? (
                        <NotificationRowSkeleton />
                      ) : null}
                    </ContentTransition>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </StateTransition>
        </ListSection>
      </div>
      {state.hasMore ? (
        <div className="flex justify-center">
          <Button
            disabled={state.loading || state.loadingMore}
            onClick={() => void state.loadMore()}
            variant="outline"
          >
            <ArrowDown />
            {state.loadingMore
              ? t("ui.common.loadingMore")
              : t("ui.common.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
