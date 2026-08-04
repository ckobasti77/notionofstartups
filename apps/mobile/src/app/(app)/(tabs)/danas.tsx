import { ListTodo } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Danas" — najvažniji ekran, odgovara na „šta me čeka"
 * (docs/mobile/02-EKRANI.md, sekcija 4). Skelet faze 0: naslov + prazno stanje.
 */
export default function DanasScreen() {
  const colors = useThemeColors();
  return (
    <TabScreen title="Danas">
      <EmptyState
        icon={<ListTodo size={40} color={colors.mutedForeground} />}
        title="Nema zadataka za danas."
        description="Kad ti neko dodeli zadatak sa rokom, pojaviće se ovde."
        actionLabel="Novi zadatak"
        onAction={() => {
          // Kreiranje zadatka stiže u fazi 2 (docs/mobile/02-EKRANI.md, sekcija 12).
        }}
      />
    </TabScreen>
  );
}
