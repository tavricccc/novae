<template>
  <RoutePageFrame padding="responsive">
    <div class="mx-auto w-full max-w-4xl py-4">
      <SurfacePanel v-if="!isAdmin" padding="lg" class="text-center">
        <AppIcon name="refresh" :size="8" class="mx-auto text-ink-400" />
        <h1 class="mt-4 text-xl font-bold text-ink-950 dark:text-ink-50">{{ t('categoryAdmin.setupWaitingTitle') }}</h1>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-500">{{ t('categoryAdmin.setupWaitingDescription') }}</p>
      </SurfacePanel>

      <form v-else class="space-y-5" @submit.prevent="submitSetup">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">{{ t('categoryAdmin.initialSetup') }}</p>
          <h1 class="mt-2 text-2xl font-bold text-ink-950 dark:text-ink-50">{{ t('categoryAdmin.setupTitle') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-ink-500">{{ t('categoryAdmin.setupDescription') }}</p>
        </div>

        <SurfacePanel variant="inset" padding="md" class="grid gap-3 sm:grid-cols-3">
          <div>
            <p class="text-xs font-semibold text-ink-500">{{ t('categoryAdmin.proposalCategories') }}</p>
            <p class="mt-1 text-2xl font-bold text-ink-950 dark:text-ink-50">{{ issueCategories.length }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold text-ink-500">{{ t('categoryAdmin.facilityCategories') }}</p>
            <p class="mt-1 text-2xl font-bold text-ink-950 dark:text-ink-50">{{ facilityCategories.length }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold text-ink-500">{{ t('categoryAdmin.managerAssignment') }}</p>
            <p class="mt-1 text-sm font-bold text-ink-950 dark:text-ink-50">{{ t('categoryAdmin.skippedForNow') }}</p>
            <p class="mt-1 text-xs leading-5 text-ink-500">{{ t('categoryAdmin.managerSkipHelp') }}</p>
          </div>
        </SurfacePanel>

        <section class="space-y-3">
          <div class="flex items-end justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-ink-950 dark:text-ink-50">{{ t('categoryAdmin.proposalCategories') }}</h2>
              <p class="mt-1 text-xs leading-5 text-ink-500">{{ t('categoryAdmin.proposalSetupHelp') }}</p>
            </div>
            <AppButton type="button" variant="secondary" @click="addIssueCategory">{{ t('categoryAdmin.addCategory') }}</AppButton>
          </div>
          <CategoryEditorCard
            v-for="(category, index) in issueCategories"
            :key="`issue-${index}`"
            v-model="issueCategories[index]"
            :field-id="`setup-issue-${index}`"
            kind="issue"
            :removable="issueCategories.length > 1"
            @remove="issueCategories.splice(index, 1)"
          />
        </section>

        <section class="space-y-3">
          <div class="flex items-end justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-ink-950 dark:text-ink-50">{{ t('categoryAdmin.facilityCategories') }}</h2>
              <p class="mt-1 text-xs leading-5 text-ink-500">{{ t('categoryAdmin.facilitySetupHelp') }}</p>
            </div>
            <AppButton type="button" variant="secondary" @click="addFacilityCategory">{{ t('categoryAdmin.addCategory') }}</AppButton>
          </div>
          <CategoryEditorCard
            v-for="(category, index) in facilityCategories"
            :key="`facility-${index}`"
            v-model="facilityCategories[index]"
            :field-id="`setup-facility-${index}`"
            kind="facility"
            :removable="facilityCategories.length > 1"
            @remove="facilityCategories.splice(index, 1)"
          />
        </section>

        <InlineMessage v-if="error">{{ error }}</InlineMessage>
        <div class="flex justify-end">
          <AppButton type="submit" variant="primary" :disabled="saving">
            <BusyButtonContent :busy="saving" :label="t('categoryAdmin.completeSetup')" :busy-label="t('categoryAdmin.completingSetup')" />
          </AppButton>
        </div>
      </form>
    </div>
  </RoutePageFrame>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import CategoryEditorCard from '@/components/categories/CategoryEditorCard.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import BusyButtonContent from '@/components/ui/atoms/BusyButtonContent.vue';
import InlineMessage from '@/components/ui/atoms/InlineMessage.vue';
import SurfacePanel from '@/components/ui/molecules/SurfacePanel.vue';
import RoutePageFrame from '@/components/ui/organisms/RoutePageFrame.vue';
import { useCategories } from '@/composables/useCategories';
import { useSession } from '@/composables/useSession';
import { useI18n } from '@/i18n';
import { completeInitialSetup } from '@/services/categories';
import type { FacilityCategoryDraft, IssueCategoryDraft } from '@/types/categories';

const router = useRouter();
const { t } = useI18n();
const { isAdmin, refreshSessionAccess } = useSession();
const { refresh } = useCategories();
const saving = ref(false);
const error = ref('');

function newIssueCategory(): IssueCategoryDraft {
  return {
    id: '', label: '', readAccess: '', authorVisible: null,
    supportEnabled: false, supportGoal: null, supportDeadlineDays: null,
    responseDeadlineDays: null, commentsEnabled: true,
  };
}
function newFacilityCategory(): FacilityCategoryDraft { return { id: '', label: '' }; }
const issueCategories = ref<IssueCategoryDraft[]>([newIssueCategory()]);
const facilityCategories = ref<FacilityCategoryDraft[]>([newFacilityCategory()]);
function addIssueCategory() { issueCategories.value.push(newIssueCategory()); }
function addFacilityCategory() { facilityCategories.value.push(newFacilityCategory()); }

async function submitSetup() {
  saving.value = true;
  error.value = '';
  try {
    await completeInitialSetup({ issueCategories: issueCategories.value, facilityCategories: facilityCategories.value });
    await Promise.all([refreshSessionAccess(), refresh()]);
    await router.replace({ name: 'issues' });
  } catch (caught) {
    error.value = t(caught instanceof Error ? caught.message : 'common.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>
