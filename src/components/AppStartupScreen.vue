<template>
  <section class="startup-screen" :role="stalled ? 'alert' : 'status'" :aria-live="stalled ? 'assertive' : 'polite'" :aria-label="ariaLabel">
    <div class="startup-screen__surface">
      <div class="startup-screen__brand" aria-hidden="true">
        <BrandMark custom-class="startup-screen__mark" />
      </div>

      <div class="startup-screen__copy">
        <h1 class="startup-screen__title">{{ title }}</h1>
        <p v-if="schoolName" class="startup-screen__school">{{ schoolName }}</p>
        <p v-if="message" class="startup-screen__message">{{ message }}</p>
      </div>

      <div v-if="stalled" class="startup-screen__recovery">
        <p>{{ t('common.theAppFailedToStartTryAgain') }}</p>
        <AppButton variant="primary" @click="emit('retry')">{{ t('common.retry') }}</AppButton>
      </div>
      <LoadingSpinner v-else :size="6" class="startup-screen__loader" />
    </div>
  </section>
</template>

<script setup lang="ts">
import BrandMark from '@/components/ui/atoms/BrandMark.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import LoadingSpinner from '@/components/ui/atoms/LoadingSpinner.vue';
import { APP_NAME, SCHOOL_NAME } from '@/constants/app';
import { useI18n } from '@/i18n';

const emit = defineEmits<{
  retry: [];
}>();
const { t } = useI18n();

const props = withDefaults(defineProps<{
  ariaLabel?: string;
  message?: string;
  stalled?: boolean;
  title?: string;
}>(), {
  ariaLabel: 'common.startingApp',
  message: '',
  stalled: false,
  title: '',
});

const title = props.title || APP_NAME;
const schoolName = SCHOOL_NAME;
</script>

<style scoped>
.startup-screen {
  --startup-accent: 64 64 64;
  --startup-accent-bright: 156 156 156;
  --startup-accent-soft: 238 238 238;
  --startup-wash: 255 255 255;
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
  place-items: center;
  overflow: hidden;
  padding:
    max(1.5rem, env(safe-area-inset-top))
    max(1.25rem, env(safe-area-inset-right))
    max(1.5rem, env(safe-area-inset-bottom))
    max(1.25rem, env(safe-area-inset-left));
  background: rgb(var(--color-page-background));
  color: rgb(var(--color-on-surface));
}

.startup-screen::before {
  position: absolute;
  inset: 0;
  background: transparent;
  content: '';
  opacity: 0.82;
  pointer-events: none;
}

.startup-screen__surface {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 28rem);
  flex-direction: column;
  align-items: center;
  gap: 1.35rem;
  text-align: center;
  animation: startup-enter 620ms var(--motion-ease-enter) both;
}

.startup-screen__brand {
  display: grid;
  height: 6.25rem;
  width: 6.25rem;
  place-items: center;
  border: 0;
  border-radius: 1.5rem;
  background: rgb(var(--color-surface) / 0.76);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.startup-screen__mark {
  font-size: 4.6rem;
}

.startup-screen__copy {
  display: grid;
  gap: 0.35rem;
}

.startup-screen__title {
  margin: 0;
  color: rgb(var(--color-on-surface));
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 650;
  letter-spacing: 0.02em;
  line-height: 1.15;
}

.startup-screen__message {
  margin: 0;
  color: rgb(var(--color-on-surface-variant));
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.5;
}

.startup-screen__loader {
  color: rgb(var(--color-on-surface));
}

.startup-screen__school {
  margin: 0;
  color: rgb(var(--color-on-surface-variant));
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.5;
}

.startup-screen__recovery {
  display: grid;
  max-width: 20rem;
  justify-items: center;
  gap: 1rem;
  color: rgb(var(--color-on-surface-variant));
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.5;
}

.startup-screen__recovery p {
  margin: 0;
}

@media (prefers-color-scheme: dark) {
  .startup-screen {
    background: rgb(var(--color-page-background));
  }
  .startup-screen::before {
    background: none;
  }
}

@keyframes startup-enter {
  from {
    opacity: 0;
    transform: translateY(0.75rem) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .startup-screen__surface {
    animation: none;
  }
}
</style>
