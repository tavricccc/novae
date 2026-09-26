"use client";

import { ComposerField } from "@/components/composer-fields";
import { ComposerDraftNotice } from "@/components/composer-draft-notice";
import { ComposerLayout } from "@/components/composer-layout";
import { useIssueComposer } from "@/hooks/use-entry-composer";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

export function IssueComposer() {
  useLocaleSubscription();
  const form = useIssueComposer();
  const busy = form.saving || form.images.uploading;

  return (
    <ComposerLayout
      busy={busy}
      onBack={form.back}
      onSubmit={form.submit}
      submitBusyLabel={translate("ui.issue.submitting")}
      submitDisabled={
        !form.config ||
        !form.title.trim() ||
        !form.content.trim() ||
        !form.contentWithinLimit ||
        busy
      }
      submitLabel={translate("ui.issue.submit")}
      succeeded={form.succeeded}
      title={translate("ui.issue.new")}
    >
      <ComposerField
        attachments={form.images.images}
        attachmentsUploading={form.images.uploading}
        content={form.content}
        contentLabel={translate("ui.issue.contentLabel")}
        onContentChange={form.setContent}
        onPickImages={(files) => void form.images.pick(files)}
        onRemoveImage={form.images.remove}
        onTitleChange={form.setTitle}
        placeholder={translate("ui.issue.contentPlaceholder")}
        title={form.title}
        titleLabel={translate("ui.issue.titleLabel")}
        titlePlaceholder={translate("ui.issue.titlePlaceholder")}
      />
      <ComposerDraftNotice draft={form.draft} />
    </ComposerLayout>
  );
}
