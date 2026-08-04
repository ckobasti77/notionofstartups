import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius } from '@/theme/tokens';
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
};

/** Bottom sheet za prebacivanje startupa. Podaci: `startups.listForCurrent`. */
export function StartupSwitcher({
  visible,
  onClose,
  startups,
  activeStartupId,
  onSelect,
  loading = false,
  canLoadMore = false,
  onLoadMore,
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
        <Text style={[styles.title, { color: colors.popoverForeground }]}>Prebaci startup</Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {loading ? (
            <View style={styles.loadingBlock}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.loadingRow}>
                  <Skeleton width={40} height={40} borderRadius={radius.full} />
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
                <Pressable
                  key={startup._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onSelect(startup._id);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: colors.border },
                    active && { backgroundColor: colors.accent },
                    pressed && !active && { backgroundColor: colors.muted },
                  ]}>
                  <Avatar name={startup.name} uri={startup.logoUrl} size={40} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.name,
                      { color: active ? colors.accentForeground : colors.foreground },
                    ]}>
                    {startup.name}
                  </Text>
                  {active ? <Check size={20} color={colors.accentForeground} /> : null}
                </Pressable>
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
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: fontWeight.semibold,
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 6,
    paddingVertical: 4,
  },
  loadingBlock: {
    gap: 12,
    paddingVertical: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 16,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: fontWeight.medium,
  },
  loadMore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
  },
});
