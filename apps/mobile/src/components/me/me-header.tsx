import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/motion';
import { Avatar } from '@/components/ui/avatar';
import { api } from '@/convex/_generated/api';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, text } from '@/theme/tokens';

export type MeHeaderProps = {
  title: string;
  /** Prigušen red ispod naslova (npr. „subota 25. oktobar"). */
  subtitle?: string;
  /** Akcije levo od avatara (ikonice 44 pt). */
  actions?: ReactNode;
  /** Red ispod naslova unutar istog zaglavlja (segment, sažetak). */
  below?: ReactNode;
  /** Gornji safe-area (podrazumevano da); `false` samo za prikaz u katalogu. */
  safeArea?: boolean;
};

/**
 * Zaglavlje GLOBALNOG taba (Danas, Poruke, Inbox — plan K07 E18): veliki
 * naslov, datum ispod, akcije i avatar desno — BEZ birača startupa (on ostaje u
 * Prostoru, `AppHeader`). Avatar vodi na „Moj profil". Gornji safe-area je
 * uračunat ovde.
 */
export function MeHeader({ title, subtitle, actions, below, safeArea = true }: MeHeaderProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useQuery(api.profiles.getCurrent, {});

  return (
    <View style={[styles.container, { paddingTop: (safeArea ? insets.top : 0) + 8, backgroundColor: colors.background }]}>
      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.actions}>
          {actions}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Moj profil"
            haptic="tap"
            onPress={() => router.push('/profil')}
            style={styles.avatarButton}>
            <Avatar name={profile?.displayName} uri={profile?.avatarUrl ?? null} size={32} />
          </PressableScale>
        </View>
      </View>
      {below ? <View style={styles.below}>{below}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: MIN_TOUCH_TARGET,
  },
  titles: {
    flex: 1,
  },
  title: {
    ...text.display,
  },
  subtitle: {
    ...text.meta,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Ikonice desno idu do ivice ekrana kao dodirna meta, ali optički na 16.
    marginRight: -10,
  },
  avatarButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  below: {
    marginTop: 8,
  },
});
