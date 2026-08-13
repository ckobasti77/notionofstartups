import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StartupSwitcher, type SwitcherStartup } from '@/components/startup-switcher';
import { useActiveStartup } from '@/context/active-startup';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

export type AppHeaderProps = {
  /** Naslov ekrana — jedini naslov; nema druge trake iznad. */
  title: string;
  /** Akcije specifične za ekran; stoje levo od pretrage i avatara. */
  actions?: ReactNode;
  /** Kad je zadat, zaglavlje dobija „nazad" levo od naslova. */
  onBack?: () => void;
  /** Red ispod naslova unutar istog zaglavlja (segment, breadcrumb). */
  below?: ReactNode;
};

/**
 * JEDNO zaglavlje aplikacije: ime startupa kao `meta` linija, naslov ekrana
 * `display` levo, pa akcije ekrana, pretraga i avatar desno. Prebacivanje
 * startupa i „Moj profil" stoje IZA avatara (isti sheet) — ranije je to bila
 * zasebna traka koja je sa naslovom jela četvrtinu ekrana.
 */
export function AppHeader({ title, actions, onBack, below }: AppHeaderProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const { activeStartupId, setActiveStartupId, restoring } = useActiveStartup();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const profile = useQuery(api.profiles.getCurrent, {});
  const {
    results: startups,
    status,
    loadMore,
  } = usePaginatedQuery(api.startups.listForCurrent, {}, { initialNumItems: 20 });

  const loadingStartups = status === 'LoadingFirstPage';

  // (1) Podrazumevano izaberi prvi startup čim lista stigne — ali NE dok traje
  // obnavljanje zapamćenog izbora (C2, restart aplikacije). Bez ovog uslova bi
  // lista (koja ume da stigne pre provere članstva) odmah nametnula prvi startup
  // i pregazila zapamćen izbor.
  useEffect(() => {
    if (restoring) return;
    if (activeStartupId === null && startups.length > 0) {
      setActiveStartupId(startups[0]._id);
    }
  }, [restoring, activeStartupId, startups, setActiveStartupId]);

  const active = startups.find((s) => s._id === activeStartupId);

  // (2) Zapamćen startup može biti na SLEDEĆOJ strani (paginacija po 20) — dovuci
  // dok se ne nađe ili dok liste ne ponestane.
  useEffect(() => {
    if (activeStartupId === null || active !== undefined) return;
    if (status === 'CanLoadMore') loadMore(20);
  }, [activeStartupId, active, status, loadMore]);

  // Dok je izabran startup a stranica sa njim još nije stigla, eyebrow pokazuje
  // skeleton — NE ime prvog startupa (`?? startups[0]` je za NEIZABRAN startup).
  const resolving = loadingStartups || (activeStartupId !== null && active === undefined);
  const fallback = activeStartupId === null ? startups[0] : undefined;
  const activeName = (active ?? fallback)?.name ?? 'Bez startupa';

  const switcherStartups: SwitcherStartup[] = startups.map((s) => ({
    _id: s._id,
    name: s.name,
    logoUrl: s.logoUrl,
  }));

  return (
    <>
      <ScreenHeader
        title={title}
        onBack={onBack}
        eyebrow={resolving ? <Skeleton width={110} height={13} /> : activeName}
        onEyebrowPress={() => {
          haptics.tap();
          setSwitcherOpen(true);
        }}
        eyebrowAccessibilityLabel={`Startup: ${activeName}. Otvori nalog i prebacivanje.`}
        below={below}
        actions={
          <>
            {actions}
            <IconButton
              accessibilityLabel="Pretraga"
              onPress={() => {
                haptics.tap();
                router.push('/pretraga');
              }}>
              <Search size={22} color={colors.foreground} />
            </IconButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Nalog i startupi. Trenutni startup: ${activeName}.`}
              onPress={() => {
                haptics.tap();
                setSwitcherOpen(true);
              }}
              style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
              <Avatar name={profile?.displayName} uri={profile?.avatarUrl ?? null} size={32} />
            </Pressable>
          </>
        }
      />

      <StartupSwitcher
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        startups={switcherStartups}
        activeStartupId={activeStartupId}
        onSelect={setActiveStartupId}
        loading={loadingStartups}
        canLoadMore={status === 'CanLoadMore'}
        onLoadMore={() => loadMore(20)}
        profile={profile ? { displayName: profile.displayName, avatarUrl: profile.avatarUrl } : null}
        onOpenProfile={() => router.push('/profil')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
