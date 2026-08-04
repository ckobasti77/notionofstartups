import { FolderOpen, Search } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Prostor" — hijerarhijska navigacija kroz oblasti i stranice, zamena za
 * desktop sidebar (docs/mobile/02-EKRANI.md, sekcija 5). Skelet faze 0.
 */
export default function ProstorScreen() {
  const colors = useThemeColors();
  return (
    <TabScreen
      title="Prostor"
      actions={
        <IconButton accessibilityLabel="Pretraga u prostoru">
          <Search size={22} color={colors.foreground} />
        </IconButton>
      }>
      <EmptyState
        icon={<FolderOpen size={40} color={colors.mutedForeground} />}
        title="Ova oblast je prazna."
        description="Oblasti i stranice tima pojaviće se ovde čim ih napraviš."
        actionLabel="Nova stranica"
        onAction={() => {
          // Kreiranje stranice stiže u fazi 3 (docs/mobile/02-EKRANI.md, sekcija 12).
        }}
      />
    </TabScreen>
  );
}
