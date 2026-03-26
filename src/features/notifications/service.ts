import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('renewal-reminders', {
      name: 'Renewal Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) return false;
  const { status: newStatus } = await Notifications.requestPermissionsAsync();
  return newStatus === 'granted';
}

/**
 * Get Expo Push Token and register it in Supabase for server-side push.
 * Safe to call multiple times — upserts on (user_id, token).
 */
const EAS_PROJECT_ID = '04b307bf-2309-48e2-b76d-1f92d43de9f3';

function getProjectId(): string {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    EAS_PROJECT_ID
  );
}

export async function registerPushToken(): Promise<string | null> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const projectId = getProjectId();

    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Remove any stale tokens for this user+platform before inserting the fresh one.
    // This handles development ↔ production token changes and token rotations.
    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', Platform.OS)
      .neq('token', token);

    await supabase.from('device_tokens').upsert(
      { user_id: user.id, token, platform: Platform.OS },
      { onConflict: 'user_id,token' }
    );

    syncTimezone(user.id);

    return token;
  } catch {
    return null;
  }
}

/**
 * Persist the device's IANA timezone (e.g. "Asia/Tbilisi") so the
 * server-side trigger can convert reminder_time to UTC.
 */
async function syncTimezone(userId: string): Promise<void> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, timezone: tz }, { onConflict: 'user_id' });
  } catch {
    // non-critical
  }
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Slick Money',
      body: 'Notifications are working!',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 2000) },
  });
}
