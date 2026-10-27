import type { FunctionReturnType } from 'convex/server';
import { StyleSheet, Text, View } from 'react-native';

import { pageMetaLine } from '@/components/collab/collab-model';
import { LockBadge } from '@/components/collab/lock';
import { PresenceIndicator } from '@/components/collab/presence-indicator';
import { api } from '@/convex/_generated/api';
import { useThemeColors } from '@/theme/theme-provider';
import { text } from '@/theme/tokens';

type PageDetails = FunctionReturnType<typeof api.pages.get>;

/**
 * Meta red ispod zaglavlja stranice i zadatka (K07 §5.6): ko je napravio, ko je i
 * kad poslednji menjao, „Zaključano" i „<Ime> uređuje". Prikazuje samo ono što
 * postoji; ništa se ne računa na klijentu osim teksta vremena.
 */
export function PageMetaStrip({
  page,
  now,
  editors,
}: {
  page: PageDetails;
  now: number;
  editors: React.ComponentProps<typeof PresenceIndicator>['editors'];
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.meta}>
      <Text numberOfLines={1} style={[styles.metaText, { color: colors.mutedForeground }]}>
        {pageMetaLine({
          creatorName: page.creator?.displayName ?? null,
          updaterName:
            page.updater !== null && page.updater._id !== page.creator?._id
              ? page.updater.displayName
              : null,
          updatedAt: page.updatedAt,
          now,
          locked: false,
        })}
      </Text>
      {page.permissions.isLocked ? (
        <LockBadge
          lockedByName={page.lockedBy?.displayName ?? null}
          lockedAt={page.lockedAt ?? null}
          now={now}
        />
      ) : null}
      <PresenceIndicator editors={editors} />
    </View>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 4,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  metaText: {
    ...text.meta,
    flexShrink: 1,
  },
});
