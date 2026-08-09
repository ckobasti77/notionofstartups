import { useRouter } from 'expo-router';
import { CheckCheck, Inbox, Settings } from 'lucide-react-native';

import { EmptyState } from '@/components/empty-state';
import { TabScreen } from '@/components/tab-screen';
import { IconButton } from '@/components/ui/icon-button';
import { useThemeColors } from '@/theme/theme-provider';

/**
 * Tab „Obaveštenja" — prevod desktop `notifications-panel` na ceo ekran
 * (docs/mobile/02-EKRANI.md, sekcija 7). Skelet faze 0.
 */
export default function ObavestenjaScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <TabScreen
      title="Obaveštenja"
      actions={
        <>
          {/* Ikonica umesto tekstualnog dugmeta — naslov „Obaveštenja" je krupan
              (display) i tekst desno bi ga sabio ispod čitljive širine. */}
          <IconButton accessibilityLabel="Označi sve kao pročitano" onPress={() => {}}>
            <CheckCheck size={22} color={colors.foreground} />
          </IconButton>
          <IconButton
            accessibilityLabel="Obaveštenja i zvuci"
            onPress={() => router.push('/podesavanja-obavestenja')}>
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
