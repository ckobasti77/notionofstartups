import { ConvexAuthProvider } from '@convex-dev/auth/react';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FullScreenLoader } from '@/components/full-screen-loader';
import { PendingInviteProvider } from '@/context/pending-invite';
import { ThemeProvider, useAppTheme } from '@/theme/theme-provider';
import { AUTH_STORAGE_NAMESPACE, convex, secureStorage } from '@/lib/convex';

SplashScreen.preventAutoHideAsync();

/**
 * Auth gate — preslikava state-machine iz web [app-root.tsx], ali kroz expo-router
 * `Stack.Protected` grupe umesto uslovnog renderovanja.
 *
 * Tok: `useConvexAuth` daje auth stanje, `profiles.getCurrent` postojanje profila.
 * `null` profil = prijavljen ali bez profila → onboarding (ensureCurrent).
 */
function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getCurrent, isAuthenticated ? {} : 'skip');

  // Token se čita iz SecureStore-a asinhrono (`isLoading`), a profil se tek učitava
  // (`undefined`). Dok traje — samo loader, inače treperi ekran prijave na startu.
  if (isLoading || (isAuthenticated && profile === undefined)) {
    return <FullScreenLoader />;
  }

  const hasProfile = isAuthenticated && profile != null;
  const needsOnboarding = isAuthenticated && profile === null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={hasProfile}>
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
          <ThemedApp />
        </PendingInviteProvider>
      </ConvexAuthProvider>
    </ThemeProvider>
  );
}
