/// <reference types="vite-plugin-pwa/react" />
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function usePwa(options: { exposeE2e?: boolean } = {}) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [isStandalone, setStandalone] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const update = () =>
      setStandalone(media.matches || (navigator as { standalone?: boolean }).standalone === true);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      setDeferred({
        prompt: async () => (event as Event & { prompt: () => Promise<void> }).prompt(),
      });
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  useEffect(() => {
    if (options.exposeE2e && localStorage.getItem('tuesday:e2e') === '1') {
      (window as { __tuesdayPwa?: unknown }).__tuesdayPwa = {
        setNeedRefresh,
      };
    }
  }, [options.exposeE2e, setNeedRefresh]);

  return {
    needRefresh,
    update: () => updateServiceWorker(true),
    canInstall: Boolean(deferred),
    promptInstall: async () => {
      await deferred?.prompt();
      setDeferred(null);
    },
    isStandalone,
    isIos: /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone,
  };
}
