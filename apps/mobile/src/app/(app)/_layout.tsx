import { Stack } from 'expo-router';

import { AppHeader } from '@/components/app-header';
import { ActiveStartupProvider } from '@/context/active-startup';
import { usePushRegistration } from '@/lib/notifications/register';
import { useNotificationTargetNavigation } from '@/lib/notifications/use-notification-target';

/**
 * Zaštićeni segment aplikacije. Gate u root `_layout.tsx` prikazuje ovaj segment
 * samo kad postoji aktivan profil. Header (startup switcher) je zajednički za sve
 * tabove, pa stoji ovde iznad `(tabs)` grupe.
 */
export default function AppLayout() {
  // Tek po prijavi: registruj uređaj za push i (na Androidu) napravi kanale.
  usePushRegistration();

  return (
    <ActiveStartupProvider>
      {/* Otvara zapamćeni cilj obaveštenja — mora unutar ActiveStartupProvider-a. */}
      <NotificationTargetNavigator />
      <Stack screenOptions={{ header: () => <AppHeader /> }}>
        <Stack.Screen name="(tabs)" />
        {/* Razgovor je full-screen (van tabova) i nosi sopstveni header. */}
        <Stack.Screen name="razgovor/[id]" options={{ headerShown: false }} />
        {/* Detalj zadatka — full-screen, sopstveni header sa „nazad". */}
        <Stack.Screen name="zadatak/[id]" options={{ headerShown: false }} />
        {/* Podešavanja obaveštenja — full-screen, sopstveni header sa „nazad". */}
        <Stack.Screen name="podesavanja-obavestenja" options={{ headerShown: false }} />
        {/* Puls — sedmični pregled, full-screen, sopstveni header. */}
        <Stack.Screen name="puls" options={{ headerShown: false }} />
        {/* Aktivnost — hronološka lista, full-screen, sopstveni header. */}
        <Stack.Screen name="aktivnost" options={{ headerShown: false }} />
      </Stack>
    </ActiveStartupProvider>
  );
}

/** Bez UI-ja: samo veže navigaciju cilja na `pending-target` i aktivan startup. */
function NotificationTargetNavigator() {
  useNotificationTargetNavigation();
  return null;
}
