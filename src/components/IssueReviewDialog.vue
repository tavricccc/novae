<template>
  <DialogShell
    :open="open"
    :busy="saving"
    labelled-by="review-dialog-title"
    z-index-class="z-[110]"
    @close="handleClose"
  >
    <DialogHeading
      heading-as="h3"
      title-id="review-dialog-title"
      :title="
        t(
          step === 1
            ? 'issue.reviewThisProposal'
            : 'issue.fillInTheReasonForFailure',
        )
      "
      :description="
        t(
          step === 1
            ? 'issue.review.approvalHelp'
            : 'notification.rejectionReasonHelp',
        )
      "
    />

    <div class="mt-5 space-y-4">
      <!-- Moderation choice (Step 1) -->
      <div v-if="step === 1">
        <p class="field-label mb-2">{{ t("issue.review.result") }}</p>
        <div class="grid gap-2">
          <SelectionOptionButton
            v-for="option in reviewOptions"
            :key="option.value"
            :label="option.label"
            :description="option.description"
            :selected="reviewDecision === option.value"
            @select="reviewDecision = option.value"
          />
        </div>
      </div>

      <!-- Rejection reason input (Step 2) -->
      <CountedTextareaField
        v-else-if="step === 2"
        v-model="rejectionReason"
        input-id="review-rejection-reason"
        :label="t('issue.review.rejectionReason')"
        :max-length="500"
        :warning-length="450"
        :placeholder="t('notification.rejectionReasonHelp')"
        :disabled="saving"
      />
    </div>

    <InlineMessage v-if="errorMsg" class="mt-3">{{ errorMsg }}</InlineMessage>

    <DialogActionRow>
      <AppButton
        variant="secondary"
        :disabled="saving"
        @click="handleSecondaryClick"
      >
        {{ t(step === 1 ? "issue.cancel" : "issue.return") }}
      </AppButton>
      <AppButton
        variant="primary"
        :disabled="saving"
        @click="handlePrimaryClick"
      >
        <BusyButtonContent
          :busy="saving"
          :label="idlePrimaryLabel"
          busy-label="app.update.updating"
        />
      </AppButton>
    </DialogActionRow>
  </DialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import DialogShell from "@/components/ui/organisms/DialogShell.vue";
import InlineMessage from "@/components/ui/atoms/InlineMessage.vue";
import CountedTextareaField from "@/components/ui/molecules/CountedTextareaField.vue";
import DialogActionRow from "@/components/ui/molecules/DialogActionRow.vue";
import DialogHeading from "@/components/ui/molecules/DialogHeading.vue";
import BusyButtonContent from "@/components/ui/atoms/BusyButtonContent.vue";
import AppButton from "@/components/ui/atoms/AppButton.vue";
import SelectionOptionButton from "@/components/ui/molecules/SelectionOptionButton.vue";
import { useActionFeedback } from "@/composables/useActionFeedback";
import { moderateIssueStatus } from "@/services/issues";
import type { IssueRecord } from "@/types";
import { useI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  issue: IssueRecord;
}>();
const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  success: [issue: IssueRecord];
}>();

const reviewOptions = [
  {
    value: "approved" as const,
    label: "issue.approved",
    description: "issue.theProposalWillBeMadePublicAndOpenToUserSupport",
  },
  {
    value: "rejected" as const,
    label: "issue.failureToPassTheReview",
    description: "issue.review.rejectionVisibilityWarning",
  },
];

const step = ref(1);
const reviewDecision = ref<"approved" | "rejected">("approved");
const rejectionReason = ref(props.issue.review_rejection_reason ?? "");
const saving = ref(false);
const errorMsg = ref("");
const { start } = useActionFeedback();

const idlePrimaryLabel = computed(() => {
  if (step.value === 1) {
    return reviewDecision.value === "approved"
      ? "issue.confirm"
      : "issue.nextStep";
  }
  return "issue.confirmAuditResults";
});

function handleClose() {
  if (saving.value) return;
  emit("close");
}

function handlePrimaryClick() {
  if (step.value === 1) {
    if (reviewDecision.value === "approved") {
      submitReview();
    } else {
      step.value = 2;
    }
  } else if (step.value === 2) {
    submitReview();
  }
}

function handleSecondaryClick() {
  if (step.value === 1) {
    handleClose();
  } else {
    step.value = 1;
    errorMsg.value = "";
  }
}

async function submitReview() {
  saving.value = true;
  errorMsg.value = "";
  const feedbackHandle = start("issue.updatingProposalReview");
  try {
    if (reviewDecision.value === "approved") {
      const updated = await moderateIssueStatus(props.issue.id, "pending");
      emit("success", updated);
      feedbackHandle.succeed("issue.proposalReviewPassed");
      emit("close");
    } else {
      const reason = rejectionReason.value.replace(/\s+/g, " ").trim();
      if (!reason) {
        errorMsg.value = "issue.pleaseEnterTheReasonWhyTheReviewFailed";
        feedbackHandle.fail(errorMsg.value);
        saving.value = false;
        return;
      }
      const updated = await moderateIssueStatus(
        props.issue.id,
        "review-rejected",
        reason,
      );
      emit("success", updated);
      feedbackHandle.succeed("issue.proposalReviewUpdated");
      emit("close");
    }
  } catch (caught) {
    errorMsg.value =
      caught instanceof Error
        ? caught.message
        : "issue.reviewProcessingFailedPleaseTryAgainLater";
    feedbackHandle.fail(errorMsg.value);
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (newOpen) => {
    if (newOpen) {
      step.value = 1;
      reviewDecision.value = "approved";
      rejectionReason.value = props.issue.review_rejection_reason ?? "";
      errorMsg.value = "";
    }
  },
);
</script>
