import type { ErrorBoundaryProps } from 'expo-router';
import { MessageSquareX } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ChatHubScreen } from '@/components/me/chat/chat-hub-screen';
import { MeHeader } from '@/components/me/me-header';
import { accessErrorMessage } from '@/lib/errors';
import { TAB_TITLES } from '@/lib/tabs';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Poruke" (O1 — globalni tab, K16): hub svih razgovora — lični DM-ovi i
 * grupe, pa kanali svih mojih startupa (`chat.listConversations`). Chat
 * jednog startupa (segmenti Kanali / Direktne / Praćeno) je u Prostoru →
 * „Kanali" (O5). Ime fajla ostaje `chat` (plan K01, D1): `devotion://chat` i
 * push navigacija (`router.navigate('/chat')`) rade kao pre.
 */
export default function ChatScreen() {
  return <ChatHubScreen />;
}

/**
 * Greška stanje za ceo tab. Hub sam prikazuje grešku svog upita (sa „Pokušaj
 * ponovo" bez ponovnog montiranja); ovde stiže ostalo (npr. profil).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ChatErrorState
      message={accessErrorMessage(error, 'Došlo je do greške pri učitavanju razgovora.')}
      onRetry={retry}
    />
  );
}

function ChatErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MeHeader title={TAB_TITLES.chat} />
      <EmptyState
        icon={<MessageSquareX size={40} color={colors.destructive} />}
        title="Razgovori se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju razgovora.'}
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
