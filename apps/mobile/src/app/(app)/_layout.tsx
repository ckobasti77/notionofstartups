import { Stack } from 'expo-router';

import { ActiveStartupProvider } from '@/context/active-startup';
import { usePushRegistration } from '@/lib/notifications/register';
import { useNotificationTargetNavigation } from '@/lib/notifications/use-notification-target';

/**
 * Zaštićeni segment aplikacije. Gate u root `_layout.tsx` prikazuje ovaj segment
 * samo kad postoji aktivan profil. Svaki ekran nosi SVOJE (jedno) zaglavlje —
 * `AppHeader` za tabove, `ScreenHeader` za stack ekrane — pa Stack ne crta nijedno.
 */
export default function AppLayout() {
  // Tek po prijavi: registruj uređaj za push i (na Androidu) napravi kanale.
  usePushRegistration();

  return (
    <ActiveStartupProvider>
      {/* Otvara zapamćeni cilj obaveštenja — mora unutar ActiveStartupProvider-a. */}
      <NotificationTargetNavigator />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Canvas (WebView) — swipe-back isključen da se ne bije sa horizontalnim
            pan-om WebView-a (§9.3); „nazad" je dugme u zaglavlju. */}
        <Stack.Screen name="canvas/[kind]/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </ActiveStartupProvider>
  );
}

/** Bez UI-ja: samo veže navigaciju cilja na `pending-target` i aktivan startup. */
function NotificationTargetNavigator() {
  useNotificationTargetNavigation();
  return null;
}
