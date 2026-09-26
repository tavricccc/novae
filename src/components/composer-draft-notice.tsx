"use client";

import { useI18n } from "@/i18n";
import type { useComposerDraft } from "@/hooks/use-composer-draft";
import { hasComposerDraft } from "@/lib/composer-draft";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function ComposerDraftNotice({ draft }: { draft: ReturnType<typeof useComposerDraft> }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground" role="status">
        {t(draft.restored ? "ui.composer.draftRestored" : draft.saved ? "ui.composer.draftSaved"
          : hasComposerDraft(draft.value) ? "ui.composer.draftUnavailable" : "ui.composer.draftHint")}
      </p>
      {hasComposerDraft(draft.value) ? (
        <AlertDialog>
          <AlertDialogTrigger asChild><Button size="sm" variant="outline" type="button">{t("ui.composer.clearDraft")}</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("ui.composer.clearDraft")}</AlertDialogTitle>
              <AlertDialogDescription>{t("ui.composer.clearDraftDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("admin.leaveStay")}</AlertDialogCancel>
              <AlertDialogAction onClick={draft.clear}>{t("ui.composer.clearDraft")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
