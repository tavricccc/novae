"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import {
  findFacilityCategory,
  findIssueCategory,
  getDefaultFacilityCategoryId,
  useCategories,
} from "@/hooks/use-categories";
import { useImageAttachments } from "@/hooks/use-image-attachments";
import { useSession } from "@/hooks/use-session";
import { createAnnouncement } from "@/services/announcements";
import { createFacility } from "@/services/facilities";
import { createIssue } from "@/services/issues";
import { deleteUploadedImages } from "@/services/uploads";
import {
  beginContentEntityRead,
  mergeContentEntityRead,
} from "@/lib/content-entity-store";
import { ACTION_SUCCESS_HOLD_MS } from "@/hooks/use-action-feedback";
import { INPUT_LIMITS } from "@/constants/input-limits";

async function holdActionSuccess() {
  await new Promise<void>((resolve) =>
    window.setTimeout(resolve, ACTION_SUCCESS_HOLD_MS),
  );
}

function useComposerBase(targetType: "announcement" | "facility" | "issue") {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);
  const categories = useCategories();
  const images = useImageAttachments(targetType, categories.imageUploads);
  const contentWithinLimit = content.length <= INPUT_LIMITS.content;

  async function withUploads(
    create: (content: string) => Promise<void>,
    fallbackMessage: string,
  ) {
    setSaving(true);
    setSucceeded(false);
    let uploaded: Awaited<ReturnType<typeof images.uploadAndAppend>>["uploaded"] = [];
    try {
      const result = await images.uploadAndAppend(content);
      uploaded = result.uploaded;
      await create(result.content);
      images.clear();
    } catch (caught) {
      if (uploaded.length > 0) {
        await deleteUploadedImages(uploaded.map((image) => image.storagePath)).catch(
          () => undefined,
        );
      }
      toast.error(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setSaving(false);
    }
  }

  return {
    content,
    contentWithinLimit,
    images,
    saving,
    setContent,
    setSucceeded,
    setTitle,
    succeeded,
    title,
    withUploads,
  };
}

export function useAnnouncementComposer() {
  const router = useRouter();
  const session = useSession();
  const { t } = useI18n();
  const form = useComposerBase("announcement");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !form.title.trim() ||
      !form.content.trim() ||
      !form.contentWithinLimit ||
      form.saving || form.images.uploading
    ) return;
    await form.withUploads(async (content) => {
      const announcement = await createAnnouncement({
        content,
        title: form.title.trim(),
      });
      mergeContentEntityRead(
        session.user?.uid,
        "announcement",
        announcement,
        beginContentEntityRead(),
      );
      form.setSucceeded(true);
      await holdActionSuccess();
      router.replace(`/announcements/${announcement.id}`);
    }, t("ui.announcement.publishFailed"));
  }
  return {
    ...form,
    back: router.back,
    canManage: session.can("announcement.manage"),
    submit,
  };
}

export function useIssueComposer() {
  const params = useParams<{ filter: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const session = useSession();
  const form = useComposerBase("issue");
  const category = decodeURIComponent(params.filter);
  const config = findIssueCategory(category);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !config ||
      !form.title.trim() ||
      !form.content.trim() ||
      !form.contentWithinLimit ||
      form.saving || form.images.uploading
    ) return;
    await form.withUploads(async (content) => {
      const issue = await createIssue({ category, content, title: form.title.trim() });
      mergeContentEntityRead(
        session.user?.uid,
        "issue",
        { ...issue, currentUserSupported: true, isOwnIssue: true },
        beginContentEntityRead(),
      );
      form.setSucceeded(true);
      await holdActionSuccess();
      router.replace(`/issues/${encodeURIComponent(category)}/${issue.id}`);
    }, t("ui.issue.submitFailed"));
  }
  return { ...form, back: router.back, category, config, submit };
}

export function useFacilityComposer() {
  const router = useRouter();
  const search = useSearchParams();
  const categories = useCategories();
  const { t } = useI18n();
  const session = useSession();
  const form = useComposerBase("facility");
  const requested = search.get("category");
  const [category, setCategory] = React.useState(
    requested && findFacilityCategory(requested)
      ? requested
      : getDefaultFacilityCategoryId(),
  );
  const [location, setLocation] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !category ||
      !form.title.trim() ||
      !location.trim() ||
      !form.content.trim() ||
      !form.contentWithinLimit ||
      form.saving || form.images.uploading
    )
      return;
    await form.withUploads(async (content) => {
      const facility = await createFacility({
        categoryId: category,
        content,
        location: location.trim(),
        title: form.title.trim(),
      });
      mergeContentEntityRead(
        session.user?.uid,
        "facility",
        facility,
        beginContentEntityRead(),
      );
      form.setSucceeded(true);
      await holdActionSuccess();
      router.replace(`/facilities/${facility.id}?category=${encodeURIComponent(category)}`);
    }, t("ui.facility.submitFailed"));
  }
  return {
    ...form,
    back: router.back,
    categories: categories.activeFacilityCategories,
    category,
    location,
    setCategory,
    setLocation,
    submit,
  };
}
