import * as Notifications from 'expo-notifications';
import type { Subscription } from '../subscriptions/types';

const LOCAL_REMINDER_PREFIX = 'local_reminder_';

/**
 * Schedule local on-device notifications as a fallback safety net
 * in case the server-side push fails. These fire even if the server
 * is down, the Edge Function crashes, or the network is unavailable.
 *
 * Called whenever the subscription list changes.
 */
export async function syncLocalReminders(subscriptions: Subscription[]) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Cancel all existing local reminders first
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const localIds = scheduled
      .filter((n) => n.identifier.startsWith(LOCAL_REMINDER_PREFIX))
      .map((n) => n.identifier);

    for (const id of localIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }

    // Schedule a local reminder for each active subscription with reminders enabled
    const now = new Date();

    for (const sub of subscriptions) {
      if (!sub.reminderEnabled) continue;
      if (sub.status !== 'active' && sub.status !== 'trial') continue;

      const chargeDate = new Date(sub.nextChargeDate + 'T00:00:00');
      const remindDate = new Date(chargeDate);
      remindDate.setDate(remindDate.getDate() - (sub.reminderDaysBefore ?? 1));

      const [hh, mm] = (sub.reminderTime || '09:00').split(':').map(Number);
      remindDate.setHours(hh, mm, 0, 0);

      // Skip if reminder date is in the past
      if (remindDate.getTime() <= now.getTime()) continue;

      const daysBefore = sub.reminderDaysBefore ?? 1;
      const phrase =
        daysBefore <= 0 ? 'today' :
        daysBefore === 1 ? 'tomorrow' :
        daysBefore === 7 ? 'in 1 week' :
        `in ${daysBefore} days`;

      const amount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: sub.currency ?? 'USD',
      }).format(sub.price);

      await Notifications.scheduleNotificationAsync({
        identifier: `${LOCAL_REMINDER_PREFIX}${sub.id}`,
        content: {
          title: 'Upcoming charge',
          body: `${sub.serviceName} will charge ${amount} ${phrase}.`,
          sound: true,
          data: {
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            isLocalFallback: true,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: remindDate,
        },
      });
    }
  } catch (err) {
    console.warn('syncLocalReminders error:', err);
  }
}

/**
 * Cancel all local reminder notifications (e.g. on logout).
 */
export async function cancelAllLocalReminders() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const localIds = scheduled
      .filter((n) => n.identifier.startsWith(LOCAL_REMINDER_PREFIX))
      .map((n) => n.identifier);

    for (const id of localIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  } catch {
    // non-critical
  }
}
