<template>
  <DialogShell
    :open="open"
    :busy="saving"
    :labelled-by="dialogTitleId"
    z-index-class="z-[110]"
    @close="handleClose"
  >
    <DialogHeading
      heading-as="h3"
      :title-id="dialogTitleId"
      :title="t(step === 1 ? selectTitle : resultTitle)"
      :description="t(step === 1 ? selectDescription : resultDescription)"
    />

    <div class="mt-5 space-y-4">
      <div v-if="step === 1">
        <p class="field-label mb-2">{{ t("common.chooseTheNextStatus") }}</p>
        <div class="grid gap-2">
          <SelectionOptionButton
            v-for="option in options"
            :key="option.value"
            :label="t(option.label)"
            :description="t(option.description)"
            :selected="status === option.value"
            :disabled="saving"
            @select="status = option.value"
          />
        </div>
        <InlineAlert
          v-if="statusWarnings[status]"
          as="p"
          tone="warning"
          compact
          class="mt-4"
        >
          {{ t(statusWarnings[status]) }}
        </InlineAlert>
      </div>

      <CountedTextareaField
        v-else
        v-model="result"
        :input-id="resultInputId"
        :label="t(resultLabel)"
        :max-length="resultMaxLength"
        :warning-length="resultWarningLength"
        :placeholder="t(resultPlaceholder)"
        :disabled="saving"
      />
    </div>

    <InlineMessage v-if="localError || error" class="mt-3">
      {{ t(localError || error) }}
    </InlineMessage>

    <DialogActionRow>
      <AppButton
        variant="secondary"
        :disabled="saving"
        @click="handleSecondary"
      >
        {{ t(step === 1 ? "issue.cancel" : "issue.return") }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="saving || !status"
        @click="handlePrimary"
      >
        <BusyButtonContent
          :busy="saving"
          :label="primaryLabel"
          :busy-label="t('app.update.updating')"
        />
      </AppButton>
    </DialogActionRow>
  </DialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/ui/atoms/AppButton.vue";
import BusyButtonContent from "@/components/ui/atoms/BusyButtonContent.vue";
import InlineAlert from "@/components/ui/atoms/InlineAlert.vue";
import InlineMessage from "@/components/ui/atoms/InlineMessage.vue";
import CountedTextareaField from "@/components/ui/molecules/CountedTextareaField.vue";
import DialogActionRow from "@/components/ui/molecules/DialogActionRow.vue";
import DialogHeading from "@/components/ui/molecules/DialogHeading.vue";
import DialogShell from "@/components/ui/organisms/DialogShell.vue";
import SelectionOptionButton from "@/components/ui/molecules/SelectionOptionButton.vue";
import { useI18n } from "@/i18n";

interface StatusOption {
  description: string;
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    dialogTitleId: string;
    error?: string;
    initialResult?: string;
    initialStatus: string;
    open: boolean;
    options: StatusOption[];
    resultDescription: string;
    resultInputId: string;
    resultLabel: string;
    resultMaxLength: number;
    resultPlaceholder: string;
    resultRequiredError: string;
    resultStatuses: string[];
    resultTitle: string;
    resultWarningLength: number;
    saving?: boolean;
    selectDescription?: string;
    selectTitle: string;
    statusWarnings?: Record<string, string>;
  }>(),
  {
    error: "",
    initialResult: "",
    saving: false,
    selectDescription: "common.pleaseSelectTheNextStatus",
    statusWarnings: () => ({}),
  },
);

const emit = defineEmits<{
  close: [];
  submit: [status: string, result: string];
}>();

const status = ref("");
const result = ref("");
const localError = ref("");
const step = ref(1);
const requiresResult = computed(() =>
  props.resultStatuses.includes(status.value),
);
const primaryLabel = computed(() =>
  step.value === 1 && requiresResult.value ? "issue.nextStep" : "issue.confirm",
);
const { t } = useI18n();
function handleClose() {
  if (!props.saving) emit("close");
}

function handlePrimary() {
  localError.value = "";
  if (!status.value) return;
  if (step.value === 1 && requiresResult.value) {
    step.value = 2;
    return;
  }
  const trimmedResult = result.value.trim();
  if (requiresResult.value && !trimmedResult) {
    localError.value = props.resultRequiredError;
    return;
  }
  emit("submit", status.value, trimmedResult);
}

function handleSecondary() {
  if (step.value === 2) {
    step.value = 1;
    localError.value = "";
    return;
  }
  handleClose();
}

watch(
  () =>
    [
      props.open,
      props.initialStatus,
      props.initialResult,
      props.options,
    ] as const,
  () => {
    if (!props.open) return;
    status.value = props.options.some(
      (option) => option.value === props.initialStatus,
    )
      ? props.initialStatus
      : (props.options[0]?.value ?? "");
    result.value = props.initialResult;
    localError.value = "";
    step.value = 1;
  },
  { immediate: true },
);
</script>
