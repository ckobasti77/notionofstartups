import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { Avatar } from '@/components/ui/avatar';
import { Row } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
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
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Zatvori" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.popover,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 12,
          },
        ]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {profile && onOpenProfile ? (
          <Row
            title={profile.displayName}
            subtitle="Moj profil"
            icon={<Avatar name={profile.displayName} uri={profile.avatarUrl} size={40} />}
            onPress={() => {
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
            <View style={styles.loadingBlock}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.loadingRow}>
                  <Skeleton width={40} height={40} borderRadius={radius.pill} />
                  <Skeleton width={160} height={16} />
                </View>
              ))}
            </View>
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
              onPress={onLoadMore}
              style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.loadMoreText, { color: colors.primary }]}>Učitaj još</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    marginBottom: 8,
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
