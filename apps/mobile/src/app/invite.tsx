import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';
import { FullScreenLoader } from '@/components/full-screen-loader';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePendingInvite } from '@/context/pending-invite';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { accessErrorMessage } from '@/lib/errors';

/**
 * Cilj deep linka `devotion://invite?code=…&email=…` (i universal linka
 * `https://<DOMEN>/invite?…`). Upamti pozivnicu, pa preusmeri po auth stanju —
 * preslikava dva invite efekta iz web [app-root.tsx]:
 *  - neprijavljen → sign-up (email prefilovan, kod u kontekstu),
 *  - prijavljen bez profila → onboarding (`ensureCurrent` iskoristi kod),
 *  - prijavljen sa profilom → `invites.claim`.
 */
export default function InviteScreen() {
  const params = useLocalSearchParams<{ code?: string; email?: string }>();
  const { patchPending } = usePendingInvite();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.profiles.getCurrent, isAuthenticated ? {} : 'skip');
  const claimInvite = useMutation(api.invites.claim);
  const router = useRouter();
  const theme = useTheme();
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const code = typeof params.code === 'string' ? params.code.trim() : undefined;
  const email = typeof params.email === 'string' ? params.email.trim() : undefined;

  // Upamti pozivnicu čim stigne, pre nego što se auth stanje razreši.
  useEffect(() => {
    if (!code && !email) return;
    patchPending({
      ...(code ? { inviteCode: code } : {}),
      ...(email ? { email } : {}),
    });
  }, [code, email, patchPending]);

  useEffect(() => {
    if (handled.current) return;
    if (isLoading) return; // čekaj auth

    if (!isAuthenticated) {
      handled.current = true;
      router.replace('/prijava');
      return;
    }
    if (profile === undefined) return; // prijavljen, čekaj profil
    if (profile === null) {
      handled.current = true;
      router.replace('/onboarding');
      return;
    }
    // Prijavljen sa profilom → prihvati pozivnicu, pa u aplikaciju.
    if (!code) {
      handled.current = true;
      router.replace('/');
      return;
    }
    handled.current = true;
    void claimInvite({ email: profile.email, code, displayName: profile.displayName })
      .then(() => router.replace('/'))
      .catch((caught: unknown) => {
        handled.current = false;
        setError(accessErrorMessage(caught, 'Pozivnica nije mogla da se prihvati.'));
      });
  }, [isLoading, isAuthenticated, profile, code, claimInvite, router]);

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle" style={styles.center}>
              Poziv nije prihvaćen
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {error}
            </ThemedText>
            <Pressable
              onPress={() => router.replace('/')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold">Nazad na početak</ThemedText>
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <FullScreenLoader label="Otvaram pozivnicu…" />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  center: { textAlign: 'center' },
  button: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
});
