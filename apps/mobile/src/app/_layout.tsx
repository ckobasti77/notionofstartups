import { ConvexAuthProvider } from '@convex-dev/auth/react';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FullScreenLoader } from '@/components/full-screen-loader';
import { PendingInviteProvider } from '@/context/pending-invite';
import { PendingTargetProvider } from '@/context/pending-target';
import { useNotificationTapCapture } from '@/lib/notifications/use-notification-target';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { ThemeProvider, useAppTheme } from '@/theme/theme-provider';
import { AUTH_STORAGE_NAMESPACE, convex, secureStorage } from '@/lib/convex';

SplashScreen.preventAutoHideAsync();

/**
 * Auth gate — preslikava state-machine iz web [app-root.tsx], ali kroz expo-router
 * `Stack.Protected` grupe umesto uslovnog renderovanja. Stanje dolazi iz
 * [useAuthGate] (isti hook koristi i `index.tsx` za preusmeravanje korena `/`).
 */
function RootNavigator() {
  const status = useAuthGate();

  // Dok se token čita iz SecureStore-a i profil učitava — samo loader, inače
  // treperi ekran prijave na startu.
  if (status === 'loading') {
    return <FullScreenLoader />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Uvek dostupan koren `/`; sam preusmerava po auth stanju (index.tsx). */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'onboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Uvek dostupan cilj deep linka; sam preusmerava po auth stanju. */}
      <Stack.Screen name="invite" />
    </Stack>
  );
}

/**
 * Vezuje razrešenu temu (svetlo/tamno/sistemsko) za navigacionu temu i status bar.
 * Mora biti unutar `ThemeProvider`-a.
 */
function ThemedApp() {
  const { scheme } = useAppTheme();
  // Hvatanje tapa na obaveštenje mora da radi pre auth gate-a (hladan start,
  // neprijavljen korisnik) — zato ovde, u uvek-montiranom root sloju.
  useNotificationTapCapture();
  return (
    <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AnimatedSplashOverlay />
      <RootNavigator />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ConvexAuthProvider
        client={convex}
        storage={secureStorage}
        storageNamespace={AUTH_STORAGE_NAMESPACE}>
        <PendingInviteProvider>
          <PendingTargetProvider>
            <ThemedApp />
          </PendingTargetProvider>
        </PendingInviteProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  );
}
