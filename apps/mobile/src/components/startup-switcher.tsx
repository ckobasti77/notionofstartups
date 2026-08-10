import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, text } from '@/theme/tokens';
import type { Id } from '@/convex/_generated/dataModel';

export type SwitcherStartup = {
  _id: Id<'startups'>;
  name: string;
  logoUrl: string | null;
};

export type StartupSwitcherProps = {
  visible: boolean;
  onClose: () => void;
  startups: SwitcherStartup[];
  activeStartupId: Id<'startups'> | null;
  onSelect: (id: Id<'startups'>) => void;
  /** Prikazuje skeleton dok stiže prva strana. */
  loading?: boolean;
  /** Ima još strana za učitavanje. */
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  /** Nalog prijavljenog korisnika — prvi red sheeta (ulaz u „Moj profil"). */
  profile?: { displayName: string; avatarUrl: string | null } | null;
  onOpenProfile?: () => void;
};

/**
 * Sheet iza avatara u zaglavlju: nalog na vrhu, pa prebacivanje startupa.
 * Podaci: `profiles.getCurrent` i `startups.listForCurrent`.
 */
export function StartupSwitcher({
  visible,
  onClose,
  startups,
  activeStartupId,
  onSelect,
  loading = false,
  canLoadMore = false,
  onLoadMore,
  profile,
  onOpenProfile,
}: StartupSwitcherProps) {
  const colors = useThemeColors();

  return (
    <Sheet visible={visible} onClose={onClose} maxHeight="75%" style={styles.sheet}>
      {profile && onOpenProfile ? (
        <Row
          title={profile.displayName}
          subtitle="Moj profil"
          icon={<Avatar name={profile.displayName} uri={profile.avatarUrl} size={40} />}
          onPress={() => {
            haptics.tap();
            onClose();
            onOpenProfile();
          }}
          accessibilityLabel={`Moj profil: ${profile.displayName}`}
          style={styles.sheetRow}
        />
      ) : null}

      <SectionHeader title="Startupi" style={styles.sectionHeader} />

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {loading ? (
          // Skeleton preslikava red startupa: avatar 40 + ime.
          <SkeletonList
            count={3}
            gap={12}
            style={styles.loadingBlock}
            item={() => (
              <View style={styles.loadingRow}>
                <Skeleton width={40} height={40} borderRadius={radius.pill} />
                <Skeleton width={160} height={16} />
              </View>
            )}
          />
        ) : startups.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            Nisi član nijednog startupa. Zatraži pozivnicu od administratora.
          </Text>
        ) : (
          startups.map((startup) => {
            const active = startup._id === activeStartupId;
            return (
              <Row
                key={startup._id}
                title={startup.name}
                icon={<Avatar name={startup.name} uri={startup.logoUrl} size={40} />}
                onPress={() => {
                  haptics.select();
                  onSelect(startup._id);
                  onClose();
                }}
                showChevron={false}
                value={active ? <Check size={20} color={colors.accentForeground} /> : undefined}
                accessibilityLabel={
                  active ? `${startup.name}, trenutno izabran` : `Prebaci na ${startup.name}`
                }
                style={[styles.sheetRow, active && { backgroundColor: colors.accent }]}
              />
            );
          })
        )}

        {canLoadMore ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptics.tap();
              onLoadMore?.();
            }}
            style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.loadMoreText, { color: colors.primaryText }]}>Učitaj još</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 8,
  },
  // Redovi u sheetu: uži horizontalni padding od `Row.base` + zaobljenje.
  sheetRow: {
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  sectionHeader: {
    paddingHorizontal: 12,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 4,
  },
  loadingBlock: {
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    ...text.body,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  loadMore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    ...text.body,
    fontWeight: '600',
  },
});
