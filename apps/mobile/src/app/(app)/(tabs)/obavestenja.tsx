import { Inbox, Settings } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Obaveštenja" — prevod desktop `notifications-panel` na ceo ekran
 * (docs/mobile/02-EKRANI.md, sekcija 7). Skelet faze 0.
 */
export default function ObavestenjaScreen() {
  const colors = useThemeColors();
  return (
    <TabScreen
      title="Obaveštenja"
      actions={
        <>
          <Button label="Označi sve" variant="ghost" size="sm" onPress={() => {}} />
          <IconButton accessibilityLabel="Podešavanja zvukova">
            <Settings size={22} color={colors.foreground} />
          </IconButton>
        </>
      }>
      <EmptyState
        icon={<Inbox size={40} color={colors.mutedForeground} />}
        title="Sve je čisto."
        description="Nova obaveštenja o zadacima, glasanjima i porukama stižu ovde."
      />
    </TabScreen>
  );
}
