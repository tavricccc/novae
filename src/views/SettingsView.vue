<template>
  <RoutePageFrame>
    <div v-if="loading" class="space-y-6 py-4">
      <!-- Account Skeleton -->
      <SurfacePanel variant="list" padding="md" class="flex items-center gap-3">
        <SkeletonBlock class="h-10 w-10 shrink-0 rounded-full" />
        <div class="min-w-0 flex-1 space-y-2">
          <SkeletonBlock class="block h-4 w-32 rounded" />
          <SkeletonBlock class="block h-3 w-48 rounded" />
        </div>
        <SkeletonBlock class="h-10 w-16 rounded-xl" />
      </SurfacePanel>

      <!-- Push Notifications Skeleton -->
      <SurfacePanel variant="list" padding="md" class="space-y-2">
        <SkeletonBlock class="block h-4 w-24 rounded" />
        <SkeletonBlock class="block h-3 w-3/4 rounded" />
      </SurfacePanel>

      <!-- Notification Types Skeleton -->
      <SurfacePanel variant="list" padding="md" class="space-y-3">
        <SkeletonBlock class="block h-4 w-20 rounded" />
        <div class="space-y-2">
          <div
            class="flex items-center justify-between border-b border-ink-100 py-3 dark:border-ink-800/60"
          >
            <div class="space-y-2 flex-1">
              <SkeletonBlock class="block h-4 w-24 rounded" />
              <SkeletonBlock class="block h-3 w-2/3 rounded" />
            </div>
            <SkeletonBlock class="h-6 w-11 rounded-full" />
          </div>
          <div
            class="flex items-center justify-between border-b border-ink-100 py-3 dark:border-ink-800/60"
          >
            <div class="space-y-2 flex-1">
              <SkeletonBlock class="block h-4 w-24 rounded" />
              <SkeletonBlock class="block h-3 w-2/3 rounded" />
            </div>
            <SkeletonBlock class="h-6 w-11 rounded-full" />
          </div>
        </div>
      </SurfacePanel>
    </div>
    <SettingsPanelContent
      v-else-if="user"
      :display-name="user.displayName || t('settings.nameNotSet')"
      :display-photo-url="displayPhotoUrl"
      :email="user.email || ''"
      :uid="user.uid"
      :is-admin="isAdmin"
      :can-manage-roles="can('role.manage')"
      :personal-notification-options="personalNotificationOptions"
      :personal-preferences="personalPreferences"
      :push-action-label="pushActionLabel"
      :push-enabled="pushEnabled"
      :push-error="pushError"
      :push-loading="pushLoading"
      :push-status-description="pushStatusDescription"
      :show-close="false"
      :flat="true"
      @logout="handleLogout"
      @restart-app="handleRestartApp"
      @set-preference="handleSetPersonalPushPreference"
      @switch-account="switchAccount"
      @toggle-push="handlePushAction"
    />
    <div
      v-else
      class="flex flex-col items-center justify-center p-12 text-center"
    >
      <p class="text-sm text-ink-500 dark:text-ink-400 mb-4">
        {{ t("auth.signInToViewSettings") }}
      </p>
      <GoogleLoginButton :loading="loading" @login="login" />
    </div>
  </RoutePageFrame>
</template>

<script setup lang="ts">
import RoutePageFrame from "@/components/ui/organisms/RoutePageFrame.vue";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import GoogleLoginButton from "@/components/ui/molecules/GoogleLoginButton.vue";
import SurfacePanel from "@/components/ui/molecules/SurfacePanel.vue";
import SkeletonBlock from "@/components/ui/atoms/SkeletonBlock.vue";
import SettingsPanelContent from "@/components/SettingsPanelContent.vue";
import { usePushNotifications } from "@/composables/usePushNotifications";
import { useAppUpdate } from "@/composables/useAppUpdate";
import { useSession } from "@/composables/useSession";
import { useActionFeedback } from "@/composables/useActionFeedback";
import { useI18n } from "@/i18n";
import type { PersonalPushPreferenceKey } from "@/services/notifications";

const router = useRouter();
const { user, customPhotoUrl, loading, login, logout, can } = useSession();
const isAdmin = computed(() => can("dashboard.view"));
const { reloadApp } = useAppUpdate();
const {
  enabled: pushEnabled,
  error: pushError,
  initialized: pushInitialized,
  loading: pushLoading,
  permission: pushPermission,
  personalPreferences,
  requiresPwaInstall: pushRequiresPwaInstall,
  supported: pushSupported,
  disablePushNotifications,
  enablePushNotifications,
  refreshPushPreference,
  setPersonalPushPreference,
} = usePushNotifications();
const { start } = useActionFeedback();
const { t } = useI18n();

const displayPhotoUrl = computed(
  () => customPhotoUrl.value || user.value?.photoURL || null,
);

const personalNotificationOptions = computed<
  Array<{
    description: string;
    key: PersonalPushPreferenceKey;
    label: string;
  }>
>(() => [
  {
    key: "comments",
    label: t("notification.commentNotifications"),
    description: t("notification.preference.commentsDescription"),
  },
  {
    key: "issueUpdates",
    label: t("issue.proposalUpdate"),
    description: t("notification.preference.issueDescription"),
  },
  {
    key: "facilityUpdates",
    label: t("facility.facilityUpdates"),
    description: t("notification.preference.facilityDescription"),
  },
]);

const pushStatusDescription = computed(() => {
  if (!pushInitialized.value && pushLoading.value)
    return t("notification.confirmingNotificationStatusForThisDevice");
  if (pushRequiresPwaInstall.value)
    return t("app.install.pushAvailableAfterInstall");
  if (!pushSupported.value) return t("notification.pushUnsupported");
  if (pushPermission.value === "denied")
    return t("access.pushPermissionDenied");
  if (pushEnabled.value) return t("settings.pushPreferencesDescription");
  return t("settings.pushEnabledDescription");
});

const pushActionLabel = computed(() => {
  if (pushRequiresPwaInstall.value) return t("app.install.installToHomeScreen");
  if (!pushSupported.value || pushPermission.value === "denied") return "";
  return pushEnabled.value
    ? t("notification.turnOffPushNotifications")
    : t("app.install.turnOnPushNotifications");
});

onMounted(() => {
  void refreshPushPreference();
});

const handleLogout = async () => {
  if (pushEnabled.value) {
    try {
      await disablePushNotifications();
    } catch {
      void 0;
    }
  }
  await logout();
  router.push({ name: "login" });
};

async function switchAccount() {
  if (pushEnabled.value) {
    try {
      await disablePushNotifications();
    } catch {
      void 0;
    }
  }
  await login({ selectAccount: true });
}

async function handlePushAction() {
  if (!pushActionLabel.value) return;
  const feedbackHandle = start(t("settings.updatingPushSettings"));
  const succeeded = pushEnabled.value
    ? await disablePushNotifications()
    : await enablePushNotifications();
  if (succeeded) {
    feedbackHandle.succeed(t("settings.pushSettingsHaveBeenUpdated"));
  } else {
    feedbackHandle.fail(
      pushError.value ||
        t("settings.pushSettingUpdateFailedPleaseTryAgainLater"),
    );
  }
}

async function handleSetPersonalPushPreference(
  key: PersonalPushPreferenceKey,
  value: boolean,
) {
  const feedbackHandle = start(t("notification.savingNotificationSettings"));
  const succeeded = await setPersonalPushPreference(key, value);
  if (succeeded) {
    feedbackHandle.succeed(t("notification.notificationSettingsSaved"));
  } else {
    feedbackHandle.fail(
      pushError.value || t("notification.preferencesSaveFailed"),
    );
  }
}

async function handleRestartApp() {
  await reloadApp();
}
</script>
