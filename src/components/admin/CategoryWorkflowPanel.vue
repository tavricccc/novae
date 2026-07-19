<template>
  <section class="space-y-5" aria-labelledby="category-workflow-title">
    <h2 id="category-workflow-title" class="sr-only">{{ t('adminCenter.categorySectionTitle') }}</h2>

    <div class="flex pb-1">
      <PillSegmentedControl
        v-model="activeCategoryKind"
        :options="kindOptions"
      />
    </div>

    <EmptyStatePanel v-if="error" title="categoryAdmin.loadFailed" :description="error" icon="warning" />
    <div v-if="loading" class="space-y-3">
      <SurfacePanel v-for="index in 2" :key="index" padding="lg">
        <SkeletonBlock class="h-44 w-full rounded-xl" />
      </SurfacePanel>
    </div>

    <template v-else>
      <CategoryManagementSection
        v-if="activeCategoryKind === 'issue'"
        v-model="issueCategories"
        kind="issue"
        :title="t('categoryAdmin.proposalCategories')"
        :description="t('categoryAdmin.proposalManagementHelp')"
        :on-save="saveIssue"
        @add="addIssue"
      />
      <CategoryManagementSection
        v-else-if="activeCategoryKind === 'facility'"
        v-model="facilityCategories"
        kind="facility"
        :title="t('categoryAdmin.facilityCategories')"
        :description="t('categoryAdmin.facilityManagementHelp')"
        :on-save="saveFacility"
        @add="addFacility"
      />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import CategoryManagementSection from '@/components/categories/CategoryManagementSection.vue';
import SkeletonBlock from '@/components/ui/atoms/SkeletonBlock.vue';
import EmptyStatePanel from '@/components/ui/molecules/EmptyStatePanel.vue';
import SurfacePanel from '@/components/ui/molecules/SurfacePanel.vue';
import PillSegmentedControl from '@/components/ui/molecules/PillSegmentedControl.vue';
import type { PillSegmentedControlOption } from '@/components/ui/molecules/PillSegmentedControl.vue';
import { useCategories } from '@/composables/useCategories';
import { useI18n } from '@/i18n';
import { getCategoryManagement, saveFacilityCategory, saveIssueCategory } from '@/services/categories';
import type { FacilityCategoryConfig, IssueCategoryConfig } from '@/types/categories';

const { t } = useI18n();
const { refresh } = useCategories();
const loading = ref(true);
const error = ref('');
const issueCategories = ref<IssueCategoryConfig[]>([]);
const facilityCategories = ref<FacilityCategoryConfig[]>([]);
const activeCategoryKind = ref<'issue' | 'facility'>('issue');

const kindOptions = computed<readonly PillSegmentedControlOption<'issue' | 'facility'>[]>(() => [
  { value: 'issue', label: t('categoryAdmin.proposalCategories'), icon: 'comment' },
  { value: 'facility', label: t('categoryAdmin.facilityCategories'), icon: 'wrench' },
]);

function newIssue(index: number): IssueCategoryConfig {
  return {
    id: '', label: '', readAccess: 'school', authorVisible: true,
    supportEnabled: false, supportGoal: null, supportDeadlineDays: null,
    responseDeadlineDays: null, commentsEnabled: true, isActive: true,
    isDefault: issueCategories.value.length === 0, sortOrder: index,
  };
}

function newFacility(index: number): FacilityCategoryConfig {
  return {
    id: '', label: '', isActive: true,
    isDefault: facilityCategories.value.length === 0, sortOrder: index,
  };
}

function addIssue() { issueCategories.value.push(newIssue(issueCategories.value.length)); }
function addFacility() { facilityCategories.value.push(newFacility(facilityCategories.value.length)); }

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await getCategoryManagement();
    issueCategories.value = result.issueCategories;
    facilityCategories.value = result.facilityCategories;
  } catch (caught) {
    error.value = t(caught instanceof Error ? caught.message : 'common.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function saveIssue(index: number) {
  issueCategories.value[index] = await saveIssueCategory({ ...issueCategories.value[index], sortOrder: index });
  await refresh();
}

async function saveFacility(index: number) {
  facilityCategories.value[index] = await saveFacilityCategory({ ...facilityCategories.value[index], sortOrder: index });
  await refresh();
}

onMounted(() => { void load(); });
</script>
