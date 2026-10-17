import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, getServerSnapshot, promptInstall } from '../lib/installPrompt';
import { detectPlatform } from '../lib/installPlatform';

export function useInstallPrompt() {
  const { canPromptNative, isInstalled } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const platform = useMemo(
    () =>
      typeof navigator === 'undefined'
        ? 'other'
        : detectPlatform({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            maxTouchPoints: navigator.maxTouchPoints,
          }),
    []
  );
  return { canPromptNative, isInstalled, platform, promptInstall };
}

// Shared click behaviour for every "Get the App" entry point.
export function useInstallAction() {
  const install = useInstallPrompt();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState('');

  const onClick = useCallback(async () => {
    setNote('');
    if (install.canPromptNative) {
      const result = await install.promptInstall();
      if (result === 'dismissed') {
        setNote('No problem. You can install any time from this button.');
      } else if (result === 'unavailable') {
        setDialogOpen(true);
      }
      return;
    }
    setDialogOpen(true);
  }, [install]);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  return { ...install, onClick, dialogOpen, closeDialog, note };
}
