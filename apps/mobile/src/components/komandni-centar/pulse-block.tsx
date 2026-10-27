import { currentWeekBounds, weekPulseFacts } from '@devotion/shared';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useToday } from '@/hooks/use-today';
import { haptics } from '@/lib/haptics';

import { blockRowStyle } from './command-block-parts';
import { pulseLine } from './command-blocks-model';

/**
 * „Puls nedelje" (PROSTOR P10, K19): jedan red sa vrednostima Završeno · Novo · Zapelo
 * i „Otvori" → ekran Puls. Nije kartica u kartici — naslov sekcije i jedan red.
 * Prezentaciona: `line === undefined` je učitavanje.
 */
export function PulseView({ line, onOpen }: { line: string | undefined; onOpen: () => void }) {
  return (
    <View>
      <SectionHeader title="Puls nedelje" />
      {line === undefined ? (
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel="Učitavanje pulsa nedelje"
          style={styles.skeleton}>
          <Skeleton width="72%" height={16} />
        </View>
      ) : (
        <Row
          title={line}
          titleNumberOfLines={2}
          value="Otvori"
          accessibilityLabel={`${line}. Otvori puls nedelje`}
          onPress={() => {
            haptics.tap();
            onOpen();
          }}
          style={styles.row}
        />
      )}
    </View>
  );
}

/**
 * Kontejner: `puls.getWeekly` sa granicama nedelje koje računa klijent
 * (`currentWeekBounds`); `now` je iz `useToday()` (menja se tek u ponoć), pa se
 * argumenti upita ne menjaju ceo dan.
 */
export function PulseBlock({ startupId }: { startupId: Id<'startups'> }) {
  const router = useRouter();
  const { now } = useToday();
  const bounds = useMemo(() => currentWeekBounds(now), [now]);
  const weekly = useQuery(api.puls.getWeekly, { startupId, ...bounds });
  const line = weekly ? pulseLine(weekPulseFacts(weekly.summary)) : undefined;
  return <PulseView line={line} onOpen={() => router.push('/puls')} />;
}

const styles = StyleSheet.create({
  row: {
    ...blockRowStyle,
  },
  skeleton: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
