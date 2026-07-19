<template>
  <DialogShell
    :open="open"
    :persistent="saving"
    :busy="saving"
    :labelled-by="titleId"
    surface-class="w-full max-w-lg"
    @close="handleClose"
  >
    <div class="flex flex-col h-full min-h-[420px] justify-between p-1">
      <!-- Header -->
      <div class="border-b border-ink-100 pb-4 dark:border-ink-800 flex justify-between items-start">
        <DialogHeading
          heading-as="h2"
          :title-id="titleId"
          :eyebrow="`${t('categoryAdmin.addCategory')} · ${kindLabel}`"
          :title="currentStepTitle"
        />
        <span class="text-xs font-semibold text-ink-500 bg-ink-50 dark:bg-ink-950 px-2.5 py-1 rounded-full border border-ink-100 dark:border-ink-800 shrink-0 select-none">
          {{ t('common.stepCount', { current: currentStep, total: totalSteps }) }}
        </span>
      </div>

      <!-- Step Content -->
      <div class="flex-1 py-5 space-y-4 overflow-y-auto">
        <!-- Step 1: Basic Info -->
        <div v-if="currentStep === 1" class="space-y-4">
          <div>
            <label for="wizard-label" class="field-label">{{ t('categoryAdmin.categoryName') }}</label>
            <input
              id="wizard-label"
              v-model="form.label"
              class="field mt-1.5"
              maxlength="40"
              required
              :placeholder="t('categoryAdmin.namePlaceholder')"
              @input="handleLabelInput"
            />
          </div>

          <div>
            <label for="wizard-id" class="field-label">{{ t('categoryAdmin.categoryId') }}</label>
            <input
              id="wizard-id"
              v-model="form.id"
              class="field mt-1.5"
              maxlength="48"
              required
              :placeholder="t('categoryAdmin.idPlaceholder')"
              :disabled="saving"
            />
            <p class="mt-1 text-xs leading-5" :class="isIdValid ? 'text-ink-500' : 'text-error font-semibold'">
              {{ t(isIdValid ? 'categoryAdmin.idHelp' : 'categoryAdmin.idFormatError') }}
            </p>
          </div>
        </div>

        <!-- Step 2: Privacy (Only for Issue) -->
        <div v-else-if="kind === 'issue' && currentStep === 2" class="space-y-4">
          <div>
            <p class="field-label mb-2">{{ t('categoryAdmin.readAccess') }}</p>
            <div class="grid gap-2">
              <SelectionOptionButton
                v-for="option in readAccessOptions"
                :key="option.value"
                :label="option.label"
                :description="option.description"
                :selected="form.readAccess === option.value"
                @select="setReadAccess(option.value)"
              />
            </div>
          </div>

          <div>
            <p class="field-label mb-2">{{ t('categoryAdmin.authorVisibility') }}</p>
            <div class="grid gap-2 sm:grid-cols-2">
              <SelectionOptionButton
                label="categoryAdmin.authorVisible"
                description="categoryAdmin.authorVisibleHelp"
                :selected="form.authorVisible === true"
                @select="form.authorVisible = true"
              />
              <SelectionOptionButton
                label="categoryAdmin.authorHidden"
                description="categoryAdmin.authorHiddenHelp"
                :selected="form.authorVisible === false"
                :disabled="form.readAccess === 'owner-admin'"
                @select="form.authorVisible = false"
              />
            </div>
          </div>
        </div>

        <!-- Step 3: Rules & Deadlines (Only for Issue) -->
        <div v-else-if="kind === 'issue' && currentStep === 3" class="space-y-4">
          <div class="grid gap-2">
            <ListSurfaceRow interactive @click="form.commentsEnabled = !form.commentsEnabled">
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ t('categoryAdmin.allowComments') }}</span>
                <span class="mt-0.5 block text-xs leading-5 text-ink-500">{{ t('categoryAdmin.futureProposalsOnly') }}</span>
              </span>
              <SwitchIndicator :checked="form.commentsEnabled" :label="t('categoryAdmin.allowComments')" />
            </ListSurfaceRow>

            <ListSurfaceRow interactive @click="toggleSupport">
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ t('categoryAdmin.enableSupport') }}</span>
                <span class="mt-0.5 block text-xs leading-5 text-ink-500">{{ t('categoryAdmin.futureProposalsOnly') }}</span>
              </span>
              <SwitchIndicator :checked="form.supportEnabled === true" :label="t('categoryAdmin.enableSupport')" />
            </ListSurfaceRow>
          </div>

          <div v-if="form.supportEnabled" class="grid gap-3 sm:grid-cols-2">
            <NumberField v-model="form.supportGoal" input-id="wizard-goal" label="categoryAdmin.supportGoal" />
            <NumberField v-model="form.supportDeadlineDays" input-id="wizard-support-days" label="categoryAdmin.supportDeadline" />
          </div>

          <div>
            <NumberField
              v-model="form.responseDeadlineDays"
              input-id="wizard-response-days"
              label="categoryAdmin.responseDeadline"
              :required="false"
            />
          </div>
        </div>

        <!-- Step 4 (or 2 for facility): Preview & Confirm -->
        <div v-else class="space-y-4">
          <p class="text-xs text-ink-500">{{ t('categoryAdmin.previewCheckHelp') }}</p>
          
          <SurfacePanel variant="control" padding="md" class="space-y-3">
            <div>
              <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.nameAndId') }}</p>
              <p class="text-sm font-bold text-ink-900 dark:text-ink-100 mt-0.5">
                {{ form.label }} <span class="text-xs text-ink-500 font-normal">({{ form.id }})</span>
              </p>
            </div>

            <template v-if="kind === 'issue'">
              <div class="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2 dark:border-ink-800">
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.readAccess') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t(getReadAccessLabel(form.readAccess)) }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.authorVisibility') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t(form.authorVisible ? 'categoryAdmin.authorVisible' : 'categoryAdmin.authorHidden') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2 dark:border-ink-800">
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.allowComments') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t(form.commentsEnabled ? 'common.yes' : 'common.no') }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.enableSupport') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t(form.supportEnabled ? 'common.yes' : 'common.no') }}
                  </p>
                </div>
              </div>

              <div v-if="form.supportEnabled" class="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2 dark:border-ink-800">
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.supportGoal') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t('categoryAdmin.supportGoalCount', { count: form.supportGoal ?? 0 }) }}
                  </p>
                </div>
                <div>
                  <p class="text-xs text-ink-400 font-semibold">{{ t('categoryAdmin.supportDeadline') }}</p>
                  <p class="text-xs font-semibold text-ink-800 dark:text-ink-200 mt-0.5">
                    {{ t('categoryAdmin.daysCount', { count: form.supportDeadlineDays ?? 0 }) }}
                  </p>
                </div>
              </div>
            </template>
          </SurfacePanel>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="border-t border-ink-100 pt-4 dark:border-ink-800">
        <DialogActionRow>
          <InlineMessage v-if="error" class="mr-auto self-center mb-2 sm:mb-0">{{ error }}</InlineMessage>
          <div class="flex gap-2 w-full sm:w-auto justify-end">
            <AppButton
              v-if="currentStep > 1"
              variant="secondary"
              :disabled="saving"
              @click="prevStep"
            >
              {{ t('common.previous') }}
            </AppButton>
            <AppButton
              v-else
              variant="secondary"
              :disabled="saving"
              @click="handleClose"
            >
              {{ t('common.cancel') }}
            </AppButton>

            <AppButton
              v-if="currentStep < totalSteps"
              variant="primary"
              :disabled="!isStepValid"
              @click="nextStep"
            >
              {{ t('common.next') }}
            </AppButton>
            <AppButton
              v-else
              variant="primary"
              :disabled="saving"
              @click="submit"
            >
              <BusyButtonContent :busy="saving" :label="t('common.create')" :busy-label="t('common.creating')" />
            </AppButton>
          </div>
        </DialogActionRow>
      </div>
    </div>
  </DialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import DialogShell from '@/components/ui/organisms/DialogShell.vue';
import DialogHeading from '@/components/ui/molecules/DialogHeading.vue';
import DialogActionRow from '@/components/ui/molecules/DialogActionRow.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import SwitchIndicator from '@/components/ui/atoms/SwitchIndicator.vue';
import ListSurfaceRow from '@/components/ui/molecules/ListSurfaceRow.vue';
import NumberField from '@/components/ui/molecules/NumberField.vue';
import SelectionOptionButton from '@/components/ui/molecules/SelectionOptionButton.vue';
import SurfacePanel from '@/components/ui/molecules/SurfacePanel.vue';
import BusyButtonContent from '@/components/ui/atoms/BusyButtonContent.vue';
import InlineMessage from '@/components/ui/atoms/InlineMessage.vue';
import { useI18n } from '@/i18n';
import { saveFacilityCategory, saveIssueCategory } from '@/services/categories';
import type { IssueReadAccess } from '@/types/categories';

const titleId = 'category-wizard-title';

const props = defineProps<{
  kind: 'facility' | 'issue';
  open: boolean;
  sortOrder: number;
}>();

const emit = defineEmits<{
  close: [];
  created: [category: any];
}>();

const { t } = useI18n();

const currentStep = ref(1);
const saving = ref(false);
const error = ref('');
const userEditedId = ref(false);

const totalSteps = computed(() => props.kind === 'issue' ? 4 : 2);

// Form state
const form = reactive({
  id: '',
  label: '',
  readAccess: 'school' as IssueReadAccess,
  authorVisible: true,
  supportEnabled: false,
  supportGoal: 10 as number | null,
  supportDeadlineDays: 30 as number | null,
  responseDeadlineDays: 14 as number | null,
  commentsEnabled: true,
  isActive: true,
  isDefault: false,
});

const isIdValid = computed(() => {
  if (!form.id) return true; // only warn when not empty or submitted
  const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return regex.test(form.id);
});

const isStepValid = computed(() => {
  if (currentStep.value === 1) {
    return form.label.trim().length > 0 && form.id.trim().length > 0 && isIdValid.value;
  }
  if (currentStep.value === 3 && props.kind === 'issue' && form.supportEnabled) {
    return Number(form.supportGoal) > 0 && Number(form.supportDeadlineDays) > 0;
  }
  return true;
});

const currentStepTitle = computed(() => {
  if (props.kind === 'issue') {
    switch (currentStep.value) {
      case 1: return t('categoryAdmin.stepBasicInfo');
      case 2: return t('categoryAdmin.stepPrivacy');
      case 3: return t('categoryAdmin.stepWorkflowRules');
      case 4: return t('categoryAdmin.stepConfirm');
      default: return '';
    }
  } else {
    switch (currentStep.value) {
      case 1: return t('categoryAdmin.stepBasicInfo');
      case 2: return t('categoryAdmin.stepConfirm');
      default: return '';
    }
  }
});

const kindLabel = computed(() => t(props.kind === 'issue' ? 'categoryAdmin.proposalCategory' : 'categoryAdmin.facilityCategory'));

const readAccessOptions: Array<{ value: IssueReadAccess; label: string; description: string }> = [
  { value: 'school', label: 'categoryAdmin.readSchool', description: 'categoryAdmin.readSchoolHelp' },
  { value: 'reviewed-school', label: 'categoryAdmin.readAfterReview', description: 'categoryAdmin.readAfterReviewHelp' },
  { value: 'owner-admin', label: 'categoryAdmin.readOwnerAdmin', description: 'categoryAdmin.readOwnerAdminHelp' },
];

// Watch for manual editing of ID
watch(() => form.id, (newVal) => {
  if (newVal !== generateIdFromLabel(form.label)) {
    userEditedId.value = true;
  }
});

watch(() => props.open, (newVal) => {
  if (newVal) {
    // Reset state on open
    currentStep.value = 1;
    saving.value = false;
    error.value = '';
    userEditedId.value = false;
    form.id = '';
    form.label = '';
    form.readAccess = 'school';
    form.authorVisible = true;
    form.supportEnabled = false;
    form.supportGoal = 10;
    form.supportDeadlineDays = 30;
    form.responseDeadlineDays = 14;
    form.commentsEnabled = true;
  }
});

function generateIdFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function handleLabelInput() {
  if (!userEditedId.value) {
    form.id = generateIdFromLabel(form.label);
  }
}

function getReadAccessLabel(value: IssueReadAccess): string {
  switch (value) {
    case 'school': return 'categoryAdmin.readSchool';
    case 'reviewed-school': return 'categoryAdmin.readAfterReview';
    case 'owner-admin': return 'categoryAdmin.readOwnerAdmin';
  }
}

function setReadAccess(value: IssueReadAccess) {
  form.readAccess = value;
  if (value === 'owner-admin') form.authorVisible = true;
}

function toggleSupport() {
  form.supportEnabled = !form.supportEnabled;
  if (!form.supportEnabled) {
    form.supportGoal = null;
    form.supportDeadlineDays = null;
  } else {
    form.supportGoal = form.supportGoal || 10;
    form.supportDeadlineDays = form.supportDeadlineDays || 30;
  }
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--;
}

function nextStep() {
  if (isStepValid.value && currentStep.value < totalSteps.value) currentStep.value++;
}

function handleClose() {
  if (!saving.value) emit('close');
}

async function submit() {
  saving.value = true;
  error.value = '';
  try {
    let result: any;
    if (props.kind === 'issue') {
      result = await saveIssueCategory({
        id: form.id,
        label: form.label,
        readAccess: form.readAccess,
        authorVisible: form.authorVisible,
        supportEnabled: form.supportEnabled,
        supportGoal: form.supportEnabled ? Number(form.supportGoal) : null,
        supportDeadlineDays: form.supportEnabled ? Number(form.supportDeadlineDays) : null,
        responseDeadlineDays: form.responseDeadlineDays ? Number(form.responseDeadlineDays) : null,
        commentsEnabled: form.commentsEnabled,
        isActive: form.isActive,
        isDefault: form.isDefault,
        sortOrder: props.sortOrder,
      });
    } else {
      result = await saveFacilityCategory({
        id: form.id,
        label: form.label,
        isActive: form.isActive,
        isDefault: form.isDefault,
        sortOrder: props.sortOrder,
      });
    }
    emit('created', result);
    emit('close');
  } catch (caught) {
    error.value = caught instanceof Error ? t(caught.message) : t('common.saveFailed');
  } finally {
    saving.value = false;
  }
}
</script>
