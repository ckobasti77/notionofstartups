import type { ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { InboxScreen } from '@/components/me/inbox/inbox-screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { accessErrorMessage } from '@/lib/errors';
import { TAB_TITLES } from '@/lib/tabs';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Inbox" (O1 — globalni tab): obaveštenja iz svih startupa i ličnih poruka
 * + „Čeka tebe" (K14). Ime fajla ostaje `obavestenja` (plan K01, D1).
 */
export default function ObavestenjaScreen() {
  return <InboxScreen />;
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ObavestenjaErrorState
      message={accessErrorMessage(error, 'Došlo je do greške pri učitavanju obaveštenja.')}
      onRetry={retry}
    />
  );
}

function ObavestenjaErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title={TAB_TITLES.obavestenja} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Obaveštenja se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju obaveštenja.'}
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
