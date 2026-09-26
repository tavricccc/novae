"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import { useAnnouncementComposer } from "@/hooks/use-entry-composer";
import { usePermissionRedirect } from "@/hooks/use-permission-redirect";
import { ComposerField } from "@/components/composer-fields";
import { ComposerDraftNotice } from "@/components/composer-draft-notice";
import { ComposerLayout } from "@/components/composer-layout";
import { ErrorState } from "@/components/ui/page-state";

export default function AnnouncementComposerPage() {
  useLocaleSubscription();
  const form = useAnnouncementComposer();
  usePermissionRedirect(form.canManage, "/announcements");
  if (!form.canManage)
    return <ErrorState error={translate('ui.announcement.noPublishPermission')} />;
  const busy = form.saving || form.images.uploading;
  return (
    <ComposerLayout
      busy={busy}
      onBack={form.back}
      onSubmit={form.submit}
      submitBusyLabel={translate('ui.announcement.publishing')}
      submitDisabled={
        !form.title.trim() ||
        !form.content.trim() ||
        !form.contentWithinLimit ||
        busy
      }
      submitLabel={translate('ui.announcement.publish')}
      succeeded={form.succeeded}
      title={translate('ui.announcement.newTitle')}
    >
      <ComposerField
        attachments={form.images.images}
        attachmentsUploading={form.images.uploading}
        content={form.content}
        contentLabel={translate('ui.announcement.contentLabel')}
        onContentChange={form.setContent}
        onPickImages={(files) => void form.images.pick(files)}
        onRemoveImage={form.images.remove}
        onTitleChange={form.setTitle}
        placeholder={translate('ui.announcement.contentPlaceholder')}
        title={form.title}
        titleLabel={translate('ui.announcement.titleLabel')}
        titlePlaceholder={translate('ui.announcement.titlePlaceholder')}
      />
      <ComposerDraftNotice draft={form.draft} />
    </ComposerLayout>
  );
}
