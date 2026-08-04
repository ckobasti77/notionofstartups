import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { ChevronDown, Search } from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StartupSwitcher, type SwitcherStartup } from '@/components/startup-switcher';
import { useActiveStartup } from '@/context/active-startup';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius } from '@/theme/tokens';

/**
 * Zajednički header za sve tabove: logo, startup switcher (naziv + strelica →
 * bottom sheet iz `startups.listForCurrent`), pretraga i avatar.
 */
export function AppHeader() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const profile = useQuery(api.profiles.getCurrent, {});
  const {
    results: startups,
    status,
    loadMore,
  } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 20 });

  const loadingStartups = status === 'LoadingFirstPage';

  // Podrazumevano izaberi prvi startup čim lista stigne.
  useEffect(() => {
    if (activeStartupId === null && startups.length > 0) {
      setActiveStartupId(startups[0]._id);
    }
  }, [activeStartupId, startups, setActiveStartupId]);

  const active = startups.find((s) => s._id === activeStartupId) ?? startups[0];
  const activeName = active?.name ?? 'Bez startupa';

  const switcherStartups: SwitcherStartup[] = startups.map((s) => ({
    _id: s._id,
    name: s.name,
    logoUrl: s.logoUrl,
  }));

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 6,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}>
      {/* Logo */}
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Text style={[styles.logoText, { color: colors.primaryForeground }]}>N</Text>
      </View>

      {/* Startup switcher */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Startup: ${activeName}. Otvori prebacivanje.`}
        onPress={() => setSwitcherOpen(true)}
        style={({ pressed }) => [
          styles.switcher,
          pressed && { backgroundColor: colors.muted },
        ]}>
        {loadingStartups ? (
          <Skeleton width={120} height={18} />
        ) : (
          <Text numberOfLines={1} style={[styles.switcherText, { color: colors.foreground }]}>
            {activeName}
          </Text>
        )}
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>

      <View style={styles.spacer} />

      {/* Pretraga */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pretraga"
        onPress={() => {
          // Ekran pretrage stiže u kasnijoj fazi (docs/mobile/02-EKRANI.md, 3).
        }}
        style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.muted }]}>
        <Search size={22} color={colors.foreground} />
      </Pressable>

      {/* Avatar / profil */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profil"
        onPress={() => {
          // Profil/tema/odjava — otvara se iz taba „Više" (skelet faze 0).
        }}
        style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.7 }]}>
        <Avatar name={profile?.displayName} uri={profile?.avatarUrl ?? null} size={32} />
      </Pressable>

      <StartupSwitcher
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        startups={switcherStartups}
        activeStartupId={activeStartupId}
        onSelect={setActiveStartupId}
        loading={loadingStartups}
        canLoadMore={status === 'CanLoadMore'}
        onLoadMore={() => loadMore(20)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '55%',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  switcherText: {
    fontSize: 17,
    fontWeight: fontWeight.semibold,
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  avatarButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
