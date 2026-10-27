import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { CommandCenter } from '@/components/komandni-centar/command-center';
import { NoStartupState, useHasNoStartups } from '@/components/no-startup-state';
import { ProstorHub } from '@/components/prostor/prostor-hub';
import { TabScreen } from '@/components/tab-screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList, SkeletonTaskRow } from '@/components/ui/skeletons';
import { useActiveStartup } from '@/context/active-startup';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Tab „Prostor" = početna startupa (PROSTOR P18, plan K07 §4.2). Bez segmenata:
 * naslov je ime startupa (birač), na vrhu su redovi Zadaci · Dokumenti · Ideje ·
 * Kanali · Korpa (E4), ispod njih blokovi Komandnog centra 2.0 (K19: Za tebe,
 * Trijaža, Čeka tebe, Nedavne izmene, Puls nedelje, Tim). Oblasti su iza reda
 * „Dokumenti" (`/oblasti`), a ekran oblasti je `/oblast/[id]` (K14).
 */
export default function ProstorScreen() {
  const router = useRouter();
  const { activeStartupId } = useActiveStartup();
  const noStartups = useHasNoStartups();
  // Spoljni ulazi (deep link `devotion://prostor?areaId=`, stari pozivaoci) — oblast
  // je od K14 sopstveni ekran. `segment` je stari parametar (pre K09).
  const params = useLocalSearchParams<{ areaId?: string; areaLabel?: string; segment?: string }>();

  // Parametar se troši ODMAH (`setParams` ga briše), inače bi svaki povratak na
  // tab ponovo silom otvorio istu oblast i pojeo korisnikovo „nazad".
  useEffect(() => {
    const areaId = params.areaId;
    if (!areaId) return;
    router.setParams({ areaId: undefined, areaLabel: undefined });
    router.push({ pathname: '/oblast/[id]', params: { id: areaId } });
  }, [params.areaId, router]);

  // Stari spoljni parametar `segment` (segmenti su uklonjeni u PROSTOR K09):
  // „komandni-centar" je sada sama početna, a „oblasti" je ekran Dokumenti.
  useEffect(() => {
    const requested = params.segment;
    if (requested === undefined) return;
    router.setParams({ segment: undefined });
    if (requested === 'oblasti') router.push('/oblasti');
  }, [params.segment, router]);

  if (activeStartupId === null && noStartups) {
    return (
      <TabScreen title="Prostor">
        <NoStartupState />
      </TabScreen>
    );
  }

  return (
    <TabScreen title="Prostor" startupAsTitle>
      {activeStartupId === null ? (
        <CommandCenterPending />
      ) : (
        <CommandCenter
          key={activeStartupId}
          startupId={activeStartupId}
          header={<ProstorHub startupId={activeStartupId} />}
        />
      )}
    </TabScreen>
  );
}

/** Dok se aktivan startup ne razreši (prvo otvaranje), oblik onoga što stiže. */
function CommandCenterPending() {
  return (
    <View
      style={styles.pendingContent}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje komandnog centra">
      <Skeleton width="100%" height={44} borderRadius={radius.lg} />
      <SkeletonList count={3} item={(index) => <SkeletonTaskRow index={index} />} />
    </View>
  );
}

/**
 * Greška: upiti prolaze kroz `requireStartupMember` i bacaju kad korisnik nije
 * član — expo-router to hvata ovde umesto pada ekrana.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ProstorErrorState message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')} onRetry={retry} />;
}

/**
 * Ekran greške NE crta `TabScreen`: njegov `AppHeader` ima upite (profil, lista
 * startupa) koji bi pali istom greškom, pa goli `ScreenHeader`.
 */
function ProstorErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Prostor" titleSize="display" />
      <EmptyState
        icon={<TriangleAlert size={20} color={colors.destructive} />}
        title="Prostor nije učitan."
        description={message || 'Proveri vezu i pokušaj ponovo.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  /* Početna dok se startup razrešava */
  pendingContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 16,
  },
});
