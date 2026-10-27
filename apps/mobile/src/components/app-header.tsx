import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { startupsWithUnread } from '@devotion/shared';
import { Search } from 'lucide-react-native';

import { api } from '@/convex/_generated/api';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StartupSwitcher, type SwitcherStartup } from '@/components/startup-switcher';
import { useActiveStartup } from '@/context/active-startup';
import { useQueryTolerant } from '@/hooks/use-query-tolerant';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

export type AppHeaderProps = {
  /** Naslov ekrana — jedini naslov; nema druge trake iznad. */
  title: string;
  /**
   * Početna startupa (Prostor, PROSTOR P18): naslov JE ime aktivnog startupa i
   * otvara birač; `title` je tada samo rezerva dok nema startupa.
   */
  startupAsTitle?: boolean;
  /** Akcije specifične za ekran; stoje levo od pretrage i avatara. */
  actions?: ReactNode;
  /** Kad je zadat, zaglavlje dobija „nazad" levo od naslova. */
  onBack?: () => void;
  /** Red ispod naslova unutar istog zaglavlja (segment, breadcrumb). */
  below?: ReactNode;
};

/**
 * JEDNO zaglavlje aplikacije: naslov ekrana levo (`display` na korenu taba,
 * `title` na gurnutom ekranu), ime startupa kao `meta` linija ISPOD naslova
 * (bez nadnaslova, PROSTOR P17), pa akcije ekrana, pretraga i avatar desno. Na
 * početnoj startupa (`startupAsTitle`) naslov je samo ime startupa, bez meta
 * linije. Prebacivanje startupa i „Moj profil" stoje i IZA avatara (isti sheet).
 */
export function AppHeader({ title, startupAsTitle = false, actions, onBack, below }: AppHeaderProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const { activeStartupId, setActiveStartupId, restoring } = useActiveStartup();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const profile = useQuery(api.profiles.getCurrent, {});
  // Isti brojači kao bedževi tabova (deljena pretplata): tačka uz startup sa
  // nepročitanim u biraču, par web trake (P14). Greška brojača ne obara zaglavlje.
  const inboxCounts = useQueryTolerant(api.inbox.unreadCounts, {});
  const chatSummary = useQueryTolerant(api.chat.unreadSummary, {});
  const unreadStartupIds = useMemo(
    () => startupsWithUnread(inboxCounts, chatSummary),
    [inboxCounts, chatSummary],
  );
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

  // (3) Aktivan startup više nije na listi (uklonjen si iz tima dok je aplikacija otvorena):
  // kad se lista iscrpi, pređi na prvi dostupan umesto večitog skeletona.
  useEffect(() => {
    if (restoring || activeStartupId === null || active !== undefined) return;
    if (status === 'Exhausted' && startups.length > 0) setActiveStartupId(startups[0]._id);
  }, [restoring, activeStartupId, active, status, startups, setActiveStartupId]);

  // Dok je izabran startup a stranica sa njim još nije stigla, meta linija
  // pokazuje skeleton — NE ime prvog startupa (`?? startups[0]` je za NEIZABRAN
  // startup).
  const resolving = loadingStartups || (activeStartupId !== null && active === undefined);
  const fallback = activeStartupId === null ? startups[0] : undefined;
  const activeName = (active ?? fallback)?.name ?? 'Bez startupa';
  const openSwitcher = () => {
    haptics.tap();
    setSwitcherOpen(true);
  };
  const switcherLabel = `Startup: ${activeName}. Otvori nalog i prebacivanje.`;
  // Naslov-startup: dok se ime razrešava stoji rezerva (`title`), ne tuđe ime.
  const startupTitle = startupAsTitle && !resolving && (active ?? fallback) !== undefined;

  const switcherStartups: SwitcherStartup[] = startups.map((s) => ({
    _id: s._id,
    name: s.name,
    logoUrl: s.logoUrl,
  }));

  return (
    <>
      <ScreenHeader
        title={startupTitle ? activeName : title}
        titleSize={onBack ? 'title' : 'display'}
        onTitlePress={startupTitle ? openSwitcher : undefined}
        titleAccessibilityLabel={startupTitle ? switcherLabel : undefined}
        onBack={onBack}
        subtitle={
          startupAsTitle ? undefined : resolving ? <Skeleton width={110} height={13} /> : activeName
        }
        onSubtitlePress={startupAsTitle ? undefined : openSwitcher}
        subtitleAccessibilityLabel={switcherLabel}
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
              onPress={openSwitcher}
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
        unreadStartupIds={unreadStartupIds}
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
