import { useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';

/** Spinner mora da se vidi — kraće od ovoga izgleda kao da gest nije prošao. */
const MIN_SPINNER_MS = 450;

/**
 * Pull-to-refresh za realtime liste.
 *
 * Iskrena napomena o tome šta ovo JESTE: Convex upiti su pretplate — podaci stižu
 * sami, pa „osveži" nema šta da dovuče. Gest ipak mora da postoji, jer je na
 * telefonu to način na koji se proverava „da li je ovo stvarno najnovije". Zato
 * ovde radi tri stvari: potvrdi dodir haptikom, sačeka posao koji pozivalac zaista
 * ima (npr. ponovno učitavanje paginirane strane), i drži spinner dovoljno dugo da
 * se vidi da je gest primljen.
 *
 * Ako posao pukne — `haptics.error()` i spinner staje; ne ostavljamo ga da se vrti.
 *
 * Vraća gotov `RefreshControl` (obojen temom) — prosledi ga listi:
 * `<FlatList refreshControl={refreshControl} …>`.
 */
export function useListRefresh(task?: () => Promise<unknown> | void) {
  const colors = useThemeColors();
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);

  const onRefresh = useCallback(() => {
    if (running.current) return;
    running.current = true;
    haptics.tap();
    setRefreshing(true);

    const startedAt = Date.now();
    const stop = () => {
      const elapsed = Date.now() - startedAt;
      setTimeout(
        () => {
          running.current = false;
          setRefreshing(false);
        },
        Math.max(0, MIN_SPINNER_MS - elapsed),
      );
    };

    void Promise.resolve()
      .then(() => task?.())
      .then(
        () => stop(),
        () => {
          haptics.error();
          stop();
        },
      );
  }, [task]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.mutedForeground}
      colors={[colors.primary]}
      progressBackgroundColor={colors.surface}
    />
  );
}
