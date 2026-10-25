import type { ErrorBoundaryProps } from 'expo-router';
import { MessageSquareX } from 'lucide-react-native';

import { StartupChatList } from '@/components/chat/startup-chat-list';
import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { accessErrorMessage } from '@/lib/errors';
import { TAB_TITLES } from '@/lib/tabs';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Poruke" (O1 — globalni tab). Dok K16 ne napravi hub svih razgovora
 * (lično + svi startupi), tab prikazuje chat aktivnog startupa — nikad prazno.
 * Ime fajla ostaje `chat` (plan K01, D1): `devotion://chat` i push navigacija
 * (`router.navigate('/chat')`) rade kao pre.
 */
export default function ChatScreen() {
  return <StartupChatList title={TAB_TITLES.chat} />;
}

/**
 * Greška stanje za ceo tab. Sva tri upita prolaze kroz `requireStartupMember`,
 * koji baca kad korisnik nije član aktivnog startupa (npr. uklonjen, ili je
 * `activeStartupId` zastareo) — `useQuery` tada baca pri renderu. expo-router
 * hvata to ovde i prikazuje oporavljivu grešku umesto pada ekrana
 * (.claude/rules/mobile.md: prazno/učitavanje/greška za svaki prikaz).
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
    <TabScreen title={TAB_TITLES.chat}>
      <EmptyState
        icon={<MessageSquareX size={40} color={colors.destructive} />}
        title="Razgovori se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju razgovora.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </TabScreen>
  );
}
