import type { ErrorBoundaryProps } from 'expo-router';
import { CalendarX2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { MeHeader } from '@/components/me/me-header';
import { MyDayScreen } from '@/components/me/my-day/my-day-screen';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Danas" — Moj dan, lični nivo (O1): pun ekran od K12 (swipe radnje,
 * sheet radnji, brzi unos, „Isplaniraj dan"). Do K09 je ovde bio Komandni
 * centar startupa; on je sada prvi segment taba Prostor (P15,
 * `components/komandni-centar/command-center.tsx`) — nijedna radnja nije
 * izgubljena. Aplikacija se otvara ovde (`app/index.tsx`).
 */
export default function DanasScreen() {
  return <MyDayScreen />;
}

/** `myDay.overview` baca kad profil ne postoji ili kad padne veza sa serverom. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <DanasErrorState
      message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
      onRetry={retry}
    />
  );
}

function DanasErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MeHeader title="Danas" />
      <EmptyState
        icon={<CalendarX2 size={40} color={colors.destructive} />}
        title="Moj dan se ne može učitati"
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
});
