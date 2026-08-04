import { MessageSquare, SquarePen } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Chat" — kanali, direktne poruke i praćeni threadovi
 * (docs/mobile/02-EKRANI.md, sekcija 6). Skelet faze 0.
 */
export default function ChatScreen() {
  const colors = useThemeColors();
  return (
    <TabScreen
      title="Chat"
      actions={
        <IconButton accessibilityLabel="Nova poruka">
          <SquarePen size={22} color={colors.foreground} />
        </IconButton>
      }>
      <EmptyState
        icon={<MessageSquare size={40} color={colors.mutedForeground} />}
        title="Još niko nije pisao. Budi prvi."
        description="Kanali po oblastima i direktne poruke sa članovima tima idu ovde."
      />
    </TabScreen>
  );
}
