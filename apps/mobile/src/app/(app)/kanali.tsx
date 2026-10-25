import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { MessageSquareX } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { StartupChatList } from '@/components/chat/startup-chat-list';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * „Kanali" (K16, O5) — chat AKTIVNOG startupa unutar Prostora: kanali,
 * direktne poruke i praćene diskusije, „Nova poruka" za DM/kanal u startupu.
 * Isti ekran koji je do K16 bio tab „Poruke"; tab je sada hub svih razgovora.
 */
export default function KanaliScreen() {
  const router = useRouter();
  return <StartupChatList title="Kanali" onBack={() => goBack(router)} />;
}

/** Ulaz iz deep linka nema prethodni ekran — „nazad" tada vodi u Prostor. */
function goBack(router: ReturnType<typeof useRouter>) {
  if (router.canGoBack()) router.back();
  else router.navigate('/prostor');
}

/**
 * Upiti prolaze kroz `requireStartupMember` i bacaju kad korisnik nije član
 * aktivnog startupa (uklonjen, zastareo izbor) — oporavljiva greška umesto pada.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Kanali" onBack={() => goBack(router)} />
      <EmptyState
        icon={<MessageSquareX size={40} color={colors.destructive} />}
        title="Kanali se ne mogu učitati"
        description={accessErrorMessage(error, 'Došlo je do greške pri učitavanju razgovora.')}
        actionLabel="Pokušaj ponovo"
        onAction={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
