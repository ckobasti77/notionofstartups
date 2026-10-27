import { usePaginatedQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { Building2 } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { api } from '@/convex/_generated/api';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * `true` kad je lista mojih startupa stigla i prazna je. Isti argumenti kao
 * `AppHeader` (`listForCurrent`, prva strana od 20), pa Convex deli pretplatu.
 * Bez ovoga ekrani vezani za startup (Prostor, chat i obaveštenja startupa)
 * zauvek pokazuju skeleton jer nema aktivnog startupa koji bi se izabrao.
 */
export function useHasNoStartups(): boolean {
  const { results, status } = usePaginatedQuery(
    api.startups.listForCurrent,
    {},
    { initialNumItems: 20 },
  );
  // `Exhausted`, ne samo „učitano": `listForCurrent` izbacuje arhivirana članstva
  // posle `paginate`, pa prva strana može biti prazna iako lista nije gotova.
  return status === 'Exhausted' && results.length === 0;
}

/**
 * Prazno stanje za ekran koji traži startup, kad korisnik nije ni u jednom.
 * Moj dan (tab Danas) radi i bez startupa, pa je on jedina radnja.
 */
export function NoStartupState() {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <EmptyState
      icon={<Building2 size={20} color={colors.mutedForeground} />}
      title="Još nisi ni u jednom startupu"
      description="Kad te neko doda u tim, ovde ćeš videti njegov sadržaj. Moj dan radi i bez startupa."
      actionLabel="Otvori Moj dan"
      onAction={() => {
        haptics.tap();
        router.navigate('/danas');
      }}
    />
  );
}
