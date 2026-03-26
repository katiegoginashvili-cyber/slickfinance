import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  requestNotificationPermissions,
  registerPushToken,
} from '../features/notifications/service';
import { useAuthStore } from '../features/auth/store';

/**
 * Call once at the app root.
 * Registers the Expo Push Token on login AND every time the app
 * comes to the foreground, so the token stays fresh across
 * development ↔ production environment changes and token rotations.
 *
 * All reminders are sent server-side only (Communication Notification
 * style with subscription logos requires the Notification Service Extension,
 * which only processes remote push notifications).
 */
export function useNotificationSync() {
  const session = useAuthStore((s) => s.session);
  const appState = useRef<AppStateStatus>(AppState.currentState);

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
}
