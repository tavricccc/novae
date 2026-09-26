"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n";
import {
  findFacilityCategory,
  findIssueCategory,
  getDefaultFacilityCategoryId,
  useCategories,
} from "@/hooks/use-categories";
import { useComposerBase } from "@/hooks/use-composer-base";
import { useSession } from "@/hooks/use-session";
import { createAnnouncement } from "@/services/announcements";
import { createFacility } from "@/services/facilities";
import { createIssue } from "@/services/issues";
import {
  beginContentEntityRead,
  mergeContentEntityRead,
} from "@/lib/content-entity-store";

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
      return `/announcements/${announcement.id}`;
    }, router.replace, t("ui.announcement.publishFailed"));
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
  const category = decodeURIComponent(params.filter);
  const form = useComposerBase("issue", `issue:${category}`);
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
      return `/issues/${encodeURIComponent(category)}/${issue.id}`;
    }, router.replace, t("ui.issue.submitFailed"));
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
  const category = findFacilityCategory(form.draft.value.category)?.id
    ?? (requested && findFacilityCategory(requested) ? requested : getDefaultFacilityCategoryId());
  const location = form.draft.value.location;
  const setCategory = (value: string) => form.draft.update({ category: value });
  const setLocation = (value: string) => form.draft.update({ location: value, category });
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
      return `/facilities/${facility.id}?category=${encodeURIComponent(category)}`;
    }, router.replace, t("ui.facility.submitFailed"));
  }
  return {
    ...form,
    back: router.back,
    categories: categories.activeFacilityCategories,
    category,
    location,
    setCategory,
    setLocation,
    setTitle: (value: string) => form.draft.update({ title: value, category }),
    setContent: (value: string) => form.draft.update({ content: value, category }),
    submit,
  };
}
