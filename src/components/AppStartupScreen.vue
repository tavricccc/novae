<template>
  <section class="startup-screen" role="status" aria-live="polite" aria-label="正在啟動 App">
    <div class="startup-screen__surface">
      <div class="startup-screen__brand" aria-hidden="true">
        <BrandMark custom-class="startup-screen__mark" />
      </div>

      <LoadingSpinner :size="7" class="startup-screen__loader" />
    </div>
  </section>
</template>

<script setup lang="ts">
import BrandMark from '@/components/ui/BrandMark.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
</script>

<style scoped>
.startup-screen {
  --startup-accent: 180 126 36;
  --startup-accent-bright: 226 190 110;
  --startup-accent-soft: 246 228 185;
  --startup-wash: 255 252 246;
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
  background:
    radial-gradient(circle at 50% 34%, rgb(var(--startup-accent-soft) / 0.24), transparent 24rem),
    radial-gradient(circle at 50% 78%, rgb(var(--startup-wash) / 0.42), transparent 22rem),
    linear-gradient(180deg, rgb(var(--color-page-background)) 0%, rgb(var(--color-page-background)) 100%);
  color: rgb(var(--color-on-surface));
}

.startup-screen::before {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(var(--color-surface) / 0.28), transparent 32%),
    radial-gradient(circle at 50% 44%, rgb(var(--startup-accent) / 0.08), transparent 21rem);
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
  gap: 3.5rem;
  text-align: center;
  animation: startup-enter 620ms var(--motion-ease-enter) both;
}

.startup-screen__brand {
  display: grid;
  height: 8rem;
  width: 8rem;
  place-items: center;
  border: 1px solid rgb(var(--color-on-surface) / 0.08);
  border-radius: 2rem;
  background: rgb(var(--color-surface) / 0.76);
  box-shadow: 0 1.25rem 3rem rgb(var(--color-shadow) / 0.12);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.startup-screen__mark {
  font-size: 5.8rem;
}

.startup-screen__loader {
  color: rgb(var(--color-on-surface));
  height: 1.75rem !important;
  width: 1.75rem !important;
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
