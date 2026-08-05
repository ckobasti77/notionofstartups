import { Stack } from 'expo-router';

import { AppHeader } from '@/components/app-header';
import { ActiveStartupProvider } from '@/context/active-startup';
import { usePushRegistration } from '@/lib/notifications/register';

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
      <Stack screenOptions={{ header: () => <AppHeader /> }}>
        <Stack.Screen name="(tabs)" />
        {/* Razgovor je full-screen (van tabova) i nosi sopstveni header. */}
        <Stack.Screen name="razgovor/[id]" options={{ headerShown: false }} />
      </Stack>
    </ActiveStartupProvider>
  );
}
