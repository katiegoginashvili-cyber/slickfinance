import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  requestNotificationPermissions,
  registerPushToken,
} from '../features/notifications/service';
import { syncLocalReminders } from '../features/notifications/localReminders';
import { useAuthStore } from '../features/auth/store';
import { useSubscriptionsStore } from '../features/subscriptions/store';

/**
 * Call once at the app root.
 * - Registers the Expo Push Token on login AND every foreground.
 * - Syncs local fallback notifications whenever subscriptions change.
 */
export function useNotificationSync() {
  const session = useAuthStore((s) => s.session);
  const subscriptions = useSubscriptionsStore((s) => s.items);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Push token registration
  useEffect(() => {
    if (!session) return;

    async function syncToken() {
      const granted = await requestNotificationPermissions();
      if (granted) await registerPushToken();
    }

    syncToken();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        syncToken();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [session]);

  // Local fallback reminders — re-sync whenever subscription list changes
  useEffect(() => {
    if (!session) return;
    if (!subscriptions.length) return;
    syncLocalReminders(subscriptions);
  }, [session, subscriptions]);
}
