import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import '../node_modules/harmonyos-sans-webfont-splitted/dist/HarmonyOS_Sans_TC/index.css';
import '../node_modules/harmonyos-sans-webfont-splitted/dist/HarmonyOS_Sans_SC/index.css';
import './style.css';
import { initializeAppUpdate } from './composables/useAppUpdate';
import { initializeSession } from './composables/useSession';
import { initializeAppResume } from './composables/useAppResume';
import { tryRedirectToExternalBrowser } from './lib/in-app-browser';

async function bootstrap() {
  if (typeof window !== 'undefined') {
    if (tryRedirectToExternalBrowser(navigator.userAgent)) {
      return;
    }
  }

  initializeAppResume();
  void initializeAppUpdate();
  initializeSession();

  createApp(App).use(router).mount('#app');
}

void bootstrap();

