<template>
  <section class="startup-screen" role="status" aria-live="polite" aria-label="正在啟動 App">
    <div class="startup-screen__surface">
      <div class="startup-screen__brand" aria-hidden="true">
        <BrandMark custom-class="startup-screen__mark" />
      </div>

      <div class="startup-screen__copy">
        <h1 class="startup-screen__title">{{ appTitle }}</h1>
        <p class="startup-screen__tagline">正在準備</p>
      </div>

      <svg class="startup-screen__loader" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
        <circle>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="-90;810"
            keyTimes="0;1"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-dashoffset"
            values="0%;0%;-157.080%"
            calcMode="spline"
            keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0"
            keyTimes="0;0.5;1"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-dasharray"
            values="0% 314.159%;157.080% 157.080%;0% 314.159%"
            calcMode="spline"
            keySplines="0.61, 1, 0.88, 1; 0.12, 0, 0.39, 0"
            keyTimes="0;0.5;1"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import BrandMark from '@/components/ui/BrandMark.vue';

const appTitle = import.meta.env.VITE_APP_TITLE ?? 'SRP';
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
  gap: 1.35rem;
  text-align: center;
  animation: startup-enter 620ms var(--motion-ease-enter) both;
}

.startup-screen__brand {
  display: grid;
  height: 6.25rem;
  width: 6.25rem;
  place-items: center;
  border: 1px solid rgb(var(--color-on-surface) / 0.08);
  border-radius: 1.5rem;
  background: rgb(var(--color-surface) / 0.76);
  box-shadow: 0 1.25rem 3rem rgb(var(--color-shadow) / 0.12);
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

.startup-screen__tagline {
  margin: 0;
  color: rgb(var(--color-outline));
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.5;
}

.startup-screen__title {
  margin: 0;
  color: rgb(var(--color-on-surface));
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.05;
}

.startup-screen__loader {
  box-sizing: border-box;
  display: block;
  height: 1.625rem;
  width: 1.625rem;
  overflow: visible;
  padding: 0.125rem;
  color: rgb(var(--color-on-surface));
}

.startup-screen__loader > circle {
  cx: 50%;
  cy: 50%;
  r: 50%;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 0.3125rem;
  transform-origin: center;
}

:global(html.dark) .startup-screen {
  --startup-accent: 250 214 140;
  --startup-accent-bright: 255 232 179;
  --startup-accent-soft: 94 70 30;
  --startup-wash: 30 29 25;
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

  .startup-screen__loader animate,
  .startup-screen__loader animateTransform {
    display: none;
  }

  .startup-screen__loader > circle {
    stroke-dasharray: 78.54% 235.619%;
    stroke-dashoffset: 0;
  }
}
</style>
