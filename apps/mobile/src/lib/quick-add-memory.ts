import {
  parseStoredDestination,
  serializeDestination,
  type QuickAddDestination,
  type StoredDestination,
} from '@devotion/shared';

import {
  readQuickAddArea,
  readQuickAddDestinationRaw,
  writeQuickAddArea,
  writeQuickAddDestinationRaw,
} from '@/lib/device-prefs';

/**
 * Lokalno pamćenje brzog unosa (P8) — par web `apps/web/lib/me/last-area.ts`:
 * poslednje odredište i poslednja oblast po startupu. Pravila i oblik zapisa
 * su u `@devotion/shared` (`quick-add.ts`); ovde je samo skladište uređaja.
 */
export function readStoredDestination(): StoredDestination | null {
  return parseStoredDestination(readQuickAddDestinationRaw());
}

export function readLastArea(startupId: string): string | null {
  return readQuickAddArea(startupId);
}

/** Zapamti izbor posle uspešnog unosa (odredište + oblast tog startupa). */
export function rememberDestination(destination: QuickAddDestination): void {
  writeQuickAddDestinationRaw(serializeDestination(destination));
  if (destination.kind === 'startup' && destination.areaId !== null) {
    writeQuickAddArea(destination.startupId, destination.areaId);
  }
}
