import { computed, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

const PAGE_THEME_COLORS = {
  dark: '#0c0c0a',
  light: '#ffffff',
};

const SCRIM_THEME_COLORS = {
  dark: '#060605',
  light: '#898984',
};

type ThemeColorMode = 'page' | 'scrim';

const THEME_COLORS_BY_MODE = {
  page: PAGE_THEME_COLORS,
  scrim: SCRIM_THEME_COLORS,
} satisfies Record<ThemeColorMode, typeof PAGE_THEME_COLORS>;

const activeThemeModes: ThemeColorMode[] = [];

function setThemeColors(colors: typeof PAGE_THEME_COLORS) {
  document.querySelector<HTMLMetaElement>('#theme-color-default')
    ?.setAttribute('content', colors.light);
  document.querySelector<HTMLMetaElement>('#theme-color-light')
    ?.setAttribute('content', colors.light);
  document.querySelector<HTMLMetaElement>('#theme-color-dark')
    ?.setAttribute('content', colors.dark);
}

function syncThemeColors() {
  if (typeof document === 'undefined') return;
  const activeMode = activeThemeModes.at(-1) ?? 'page';
  document.documentElement.classList.toggle('status-bar-scrim-open', activeMode === 'scrim');
  setThemeColors(THEME_COLORS_BY_MODE[activeMode]);
}

function useStatusBarTheme(open: Ref<boolean>, mode: Ref<ThemeColorMode>) {
  let registeredMode: ThemeColorMode | null = null;

  function unregister() {
    if (!registeredMode) return;
    const modeIndex = activeThemeModes.lastIndexOf(registeredMode);
    if (modeIndex >= 0) {
      activeThemeModes.splice(modeIndex, 1);
    }
    registeredMode = null;
  }

  function syncRegistration() {
    const nextMode = open.value ? mode.value : null;
    if (nextMode === registeredMode) return;

    unregister();
    if (nextMode) {
      activeThemeModes.push(nextMode);
      registeredMode = nextMode;
    }
    syncThemeColors();
  }

  onMounted(syncRegistration);
  watch([open, mode], syncRegistration);

  onBeforeUnmount(() => {
    unregister();
    syncThemeColors();
  });
}

export function useDialogThemeColor(open: Ref<boolean>, fullScreen: Ref<boolean>) {
  const shouldApplyScrimTheme = computed(() => open.value && !fullScreen.value);
  const mode = computed<ThemeColorMode>(() => 'scrim');
  useStatusBarTheme(shouldApplyScrimTheme, mode);
}
