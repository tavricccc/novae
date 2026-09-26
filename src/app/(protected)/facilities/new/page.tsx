"use client";
import { t as translate, useI18n as useLocaleSubscription } from "@/i18n";

import { useFacilityComposer } from "@/hooks/use-entry-composer";
import { ComposerField } from "@/components/composer-fields";
import { ComposerDraftNotice } from "@/components/composer-draft-notice";
import { ComposerLayout } from "@/components/composer-layout";
import { FacilityComposerFields } from "@/components/facilities/facility-composer-fields";

export default function FacilityComposerPage() {
  useLocaleSubscription();
  const form = useFacilityComposer();
  const busy = form.saving || form.images.uploading;
  return (
    <ComposerLayout
      busy={busy}
      onBack={form.back}
      onSubmit={form.submit}
      submitBusyLabel={translate('ui.issue.submitting')}
      submitDisabled={
        !form.category ||
        !form.title.trim() ||
        !form.location.trim() ||
        !form.content.trim() ||
        !form.contentWithinLimit ||
        busy
      }
      submitLabel={translate('ui.facility.submit')}
      succeeded={form.succeeded}
      title={translate('ui.facility.newTitle')}
    >
      <FacilityComposerFields
        categories={form.categories}
        category={form.category}
        location={form.location}
        onCategoryChange={form.setCategory}
        onLocationChange={form.setLocation}
      />
      <ComposerField
        attachments={form.images.images}
        attachmentsUploading={form.images.uploading}
        content={form.content}
        contentLabel={translate('ui.facility.problemDescription')}
        onContentChange={form.setContent}
        onPickImages={(files) => void form.images.pick(files)}
        onRemoveImage={form.images.remove}
        onTitleChange={form.setTitle}
        placeholder={translate('ui.facility.problemPlaceholder')}
        title={form.title}
        titleLabel={translate('ui.facility.reportTitle')}
        titlePlaceholder={translate('ui.facility.reportTitlePlaceholder')}
      />
      <ComposerDraftNotice draft={form.draft} />
    </ComposerLayout>
  );
}
