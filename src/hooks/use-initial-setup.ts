"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useCategories } from "@/hooks/use-categories";
import { useSession } from "@/hooks/use-session";
import { completeInitialSetup } from "@/services/categories";
import type {
  FacilityCategoryDraft,
  IssueCategoryDraft,
} from "@/types/categories";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { useForegroundPoll } from "@/hooks/use-foreground-poll";

const categoryPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const newIssue = (isDefault = false): IssueCategoryDraft => ({
  authorVisible: true,
  commentsEnabled: true,
  id: "",
  isDefault,
  label: "",
  readAccess: "school",
  supportDeadlineDays: null,
  supportEnabled: false,
  supportGoal: null,
});
const newFacility = (isDefault = false): FacilityCategoryDraft => ({
  id: "",
  isDefault,
  label: "",
});

export function useInitialSetup() {
  const router = useRouter();
  const session = useSession();
  const isAdmin = session.isAdmin;
  const refreshSessionAccess = session.refreshSessionAccess;
  const setupCompleted = session.setupCompleted;
  const categories = useCategories();
  const { t } = useI18n();
  const [kind, setKind] = React.useState("issue");
  const [issuesEnabled, setIssuesEnabled] = React.useState(true);
  const [facilitiesEnabled, setFacilitiesEnabled] = React.useState(true);
  const [issues, setIssues] = React.useState<IssueCategoryDraft[]>([newIssue(true)]);
  const [facilities, setFacilities] = React.useState<FacilityCategoryDraft[]>([
    newFacility(true),
  ]);
  const feedback = useActionFeedback();
  const [confirming, setConfirming] = React.useState(false);
  const submittingRef = React.useRef(false);

  useForegroundPoll(
    refreshSessionAccess,
    !isAdmin && !setupCompleted,
    { initialDelayMs: 3_000 },
  );

  React.useEffect(() => {
    if (setupCompleted && !submittingRef.current) router.replace("/issues");
  }, [router, setupCompleted]);

  const valid = React.useMemo(() => {
    const identityValid = (values: Array<{ id: string; label: string }>) =>
      values.length > 0 &&
      new Set(values.map((value) => value.id.trim())).size === values.length &&
      values.every(
        (value) => categoryPattern.test(value.id.trim()) && value.label.trim(),
      );
    const issuesValid =
      !issuesEnabled ||
      (identityValid(issues) &&
        issues.every(
          (issue) =>
            issue.readAccess &&
            typeof issue.authorVisible === "boolean" &&
            (!issue.supportEnabled ||
              (Number(issue.supportGoal) > 0 &&
                Number(issue.supportDeadlineDays) > 0)),
        ));
    return issuesValid && (!facilitiesEnabled || identityValid(facilities));
  }, [facilities, facilitiesEnabled, issues, issuesEnabled]);

  async function save() {
    if (!valid || feedback.busy) return;
    submittingRef.current = true;
    try {
      const destination = await feedback.run(async () => {
        await completeInitialSetup({
          facilitiesEnabled,
          facilityCategories: facilitiesEnabled ? facilities : [],
          issuesEnabled,
          issueCategories: issuesEnabled ? issues : [],
        });
        await refreshSessionAccess();
        await categories.refresh();
        const defaultIssueCategory =
          issues.find((category) => category.isDefault)?.id || issues[0]?.id;
        const defaultFacilityCategory =
          facilities.find((category) => category.isDefault)?.id ||
          facilities[0]?.id;
        return issuesEnabled
          ? `/issues/${encodeURIComponent(defaultIssueCategory || "my-proposals")}`
          : facilitiesEnabled
            ? `/facilities?category=${encodeURIComponent(defaultFacilityCategory || "all")}`
            : "/announcements";
      });
      setConfirming(false);
      router.replace(destination);
    } catch (caught) {
      const access = await refreshSessionAccess().catch(() => undefined);
      if (access?.setupCompleted) router.replace("/issues");
      else toast.error(t(caught instanceof Error ? caught.message : "common.saveFailed"));
    } finally {
      submittingRef.current = false;
    }
  }

  return {
    addFacility: () => setFacilities((current) => [...current, newFacility()]),
    addIssue: () => setIssues((current) => [...current, newIssue()]),
    confirming,
    facilities,
    facilitiesEnabled,
    feedbackState: feedback.state,
    isAdmin,
    issues,
    issuesEnabled,
    kind,
    save,
    saving: feedback.busy,
    setConfirming,
    setFacilities,
    setFacilitiesEnabled,
    setIssues,
    setIssuesEnabled,
    setKind,
    valid,
  };
}
