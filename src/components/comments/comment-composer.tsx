"use client";

import { ArrowUp } from "lucide-react";
import { t as translate } from "@/i18n";
import { useSession } from "@/hooks/use-session";
import { ActionFeedbackIcon } from "@/components/ui/action-feedback-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

import { INPUT_LIMITS } from "@/constants/input-limits";
import { cn } from "@/lib/utils";

export function CommentComposer({
  busy,
  content,
  draftStatus,
  feedbackState = "idle",
  onChange,
  onSubmit,
  reply = false,
}: {
  busy: boolean;
  content: string;
  draftStatus?: "restored" | "saved" | "unavailable";
  feedbackState?: "idle" | "loading" | "success";
  onChange: (value: string) => void;
  onSubmit: () => Promise<void>;
  reply?: boolean;
}) {
  const session = useSession();
  const displayName = session.user?.displayName || session.user?.email || "";
  const photoUrl = session.customPhotoUrl || session.user?.photoURL || undefined;
  const submitLabel = reply ? translate("ui.discussion.reply") : translate("ui.discussion.submit");

  return (
    <div className="grid gap-2" data-update-defer={content.length > 0 || busy ? "true" : undefined}>
      <div className="flex min-h-10 items-center gap-3 px-1">
        <Avatar className="size-10 border bg-background">
          <AvatarImage alt={displayName} src={photoUrl} />
          <AvatarFallback>
            {displayName ? displayName.slice(0, 1) : <Skeleton className="size-full rounded-full" />}
          </AvatarFallback>
        </Avatar>
        <Textarea
          aria-label={reply ? translate("ui.discussion.replyInput") : translate("ui.discussion.commentInput")}
          autoFocus={reply}
          className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2.5 shadow-none focus-visible:outline-none focus-visible:ring-0"
          maxLength={INPUT_LIMITS.comment}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229
              && (event.metaKey || event.ctrlKey) && event.key === "Enter" && content.trim() && !busy) {
              event.preventDefault();
              void onSubmit();
            }
          }}
          placeholder={reply ? translate("ui.discussion.replyPlaceholder") : translate("ui.discussion.commentPlaceholder")}
          rows={1}
          value={content}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={submitLabel}
              className="size-10 min-h-10 min-w-10 shrink-0 rounded-full"
              disabled={!content.trim() || busy}
              onClick={() => void onSubmit()}
              size="icon-lg"
            >
              {busy ? (
                <ActionFeedbackIcon
                  className="[&>svg]:size-4"
                  size="sm"
                  state={feedbackState === "success" ? "success" : "loading"}
                />
              ) : <ArrowUp className="size-5" strokeWidth={2.25} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{submitLabel}</TooltipContent>
        </Tooltip>
      </div>
      {content.length > 0 ? (
        <div className="flex items-start justify-between gap-3 px-3">
          {draftStatus ? (
            <span className="min-w-0 text-[11px] text-muted-foreground" role="status">
              {translate(draftStatus === "restored" ? "comments.draftRestored"
                : draftStatus === "saved" ? "comments.draftSaved" : "comments.draftUnavailable")}
            </span>
          ) : null}
          <span
            className={cn(
              "ml-auto shrink-0 text-[11px] tabular-nums",
              content.length > INPUT_LIMITS.comment
                ? "font-medium text-destructive"
                : "text-muted-foreground",
            )}
          >
            {content.length} / {INPUT_LIMITS.comment}
          </span>
        </div>
      ) : null}
      <span className="sr-only">{translate("ui.discussion.submitShortcut")}</span>
    </div>
  );
}
