import type * as Notifications from 'expo-notifications';

import type { PendingTarget } from '@/context/pending-target';

/**
 * Izvlači cilj iz odgovora na tapnuto obaveštenje. `data` je isti objekat koji
 * server pakuje u `expoPush.ts` (`{ targetType, targetId, startupId, … }`), pa je
 * ovde jedini posao bezbedno očitati stringove — push payload je nepouzdan ulaz.
 *
 * Vraća `null` kad nema upotrebljivog `targetType` (npr. lokalno obaveštenje bez
 * `data`), da pozivalac ne bi navigirao nasumično.
 */
export function extractPendingTarget(
  response: Notifications.NotificationResponse,
): PendingTarget | null {
  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | null
    | undefined;
  if (!data) return null;

  const targetType = typeof data.targetType === 'string' ? data.targetType : null;
  if (targetType === null) return null;

  return {
    targetType,
    targetId: typeof data.targetId === 'string' ? data.targetId : null,
    startupId: typeof data.startupId === 'string' ? data.startupId : null,
  };
}
