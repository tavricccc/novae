<template>
  <svg
    :class="['brand-mark', customClass]"
    viewBox="0 0 120 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      class="brand-mark-path"
      d="M 10 79 C 18 65, 23 43, 26 23 C 29 14, 37 14, 41 23 C 50 44, 60 63, 72 80 C 77 87, 85 85, 86 75 C 88 55, 91 34, 98 21 C 102 14, 109 16, 110 26"
      stroke="currentColor"
    ></path>
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    customClass?: string;
  }>(),
  {
    customClass: '',
  }
);
</script>

<style scoped>
.brand-mark {
  display: inline-block;
  height: 1em; /* 高度隨字體大小縮放 */
  width: auto;
  overflow: visible;
  flex: none;
  color: #282623;
}

.brand-mark-path {
  stroke-width: 7;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 242;
  stroke-dashoffset: 0;
  /* 初次載入動畫 */
  animation: brand-draw 1300ms cubic-bezier(0.45, 0, 0.2, 1) 150ms both;
}

/* 深色模式維持中性高對比，不再使用金色。 */
:global(html.dark) .brand-mark {
  color: #f5f4f2;
}

/* 懸停時重播動畫：
   1. 當滑鼠懸停在標誌本身
   2. 當滑鼠懸停在標誌所在的超連結 a 上
   3. 當滑鼠懸停在標誌所在的 h1 標題上 */
.brand-mark:hover .brand-mark-path,
:global(a:hover) .brand-mark .brand-mark-path,
:global(h1:hover) .brand-mark .brand-mark-path {
  animation: brand-draw-again 850ms cubic-bezier(0.45, 0, 0.2, 1) both;
}

@keyframes brand-draw {
  from {
    stroke-dashoffset: 242;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes brand-draw-again {
  from {
    stroke-dashoffset: 242;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
