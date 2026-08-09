import { ConvexAuthProvider } from '@convex-dev/auth/react';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FullScreenLoader } from '@/components/full-screen-loader';
import { PendingInviteProvider } from '@/context/pending-invite';
import { PendingTargetProvider } from '@/context/pending-target';
import { useNotificationTapCapture } from '@/lib/notifications/use-notification-target';
import { useAuthGate } from '@/hooks/use-auth-gate';
import { useStackAnimation } from '@/hooks/use-stack-animation';
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
  const screenOptions = useStackAnimation();

  // Dok se token čita iz SecureStore-a i profil učitava — samo loader, inače
  // treperi ekran prijave na startu.
  if (status === 'loading') {
    return <FullScreenLoader />;
  }

  return (
    <Stack screenOptions={screenOptions}>
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
    // Jedan gesture root za celu aplikaciju — svajp na kartici zadatka, prevlačenje
    // sheet-a i swipe-back rade samo unutar njega. (Sheet u `Modal`-u je zaseban
    // view root na Androidu i nosi sopstveni — vidi `ui/sheet.tsx`.)
    <GestureHandlerRootView style={styles.root}>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
