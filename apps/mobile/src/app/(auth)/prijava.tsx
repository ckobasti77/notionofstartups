import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePendingInvite } from '@/context/pending-invite';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const { signIn } = useAuthActions();
  const bootstrapState = useQuery(api.profiles.getBootstrapState);
  const { pending, patchPending } = usePendingInvite();
  const theme = useTheme();

  const inviteCode = pending.inviteCode;
  const needsBootstrap = bootstrapState?.needsBootstrap === true;
  const canCreateAccount = Boolean(inviteCode) || needsBootstrap;

  const [mode, setMode] = useState<Mode>(inviteCode ? 'signUp' : 'signIn');
  const [email, setEmail] = useState(pending.email ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bootstrapCode, setBootstrapCode] = useState('');
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = useMemo(
    () => [
      styles.input,
      { backgroundColor: theme.backgroundElement, color: theme.text },
    ],
    [theme],
  );

  async function handleSubmit() {
    setPendingSubmit(true);
    setError(null);
    haptics.tap();

    // Kod za registraciju: pozivnica (deep link) ili osnivački kod (bootstrap).
    const codeForSignup = inviteCode ?? (needsBootstrap ? bootstrapCode.trim() : undefined);

    if (mode === 'signUp') {
      // Stash za onboarding fallback (`ensureCurrent`) ako profil ne nastane odmah.
      patchPending({
        displayName: displayName.trim() || undefined,
        inviteCode: codeForSignup || undefined,
        email: email.trim() || undefined,
      });
    }

    try {
      await signIn('password', {
        flow: mode,
        email: email.trim(),
        password,
        ...(mode === 'signUp' ? { displayName: displayName.trim() } : {}),
        ...(codeForSignup ? { inviteCode: codeForSignup } : {}),
      });
      // Uspeh: gate u root `_layout.tsx` reaktivno prebacuje ekran. Bez navigacije.
      haptics.success();
    } catch (caught) {
      haptics.error();
      setError(
        accessErrorMessage(caught, 'Prijava nije uspela. Proveri podatke i pokušaj ponovo.'),
      );
      setPendingSubmit(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'signIn' ? 'Dobro došao nazad' : 'Pristupi timu'}
            </ThemedText>
            <ThemedText type="subtitle" style={styles.heading}>
              {mode === 'signIn' ? 'Prijavi se' : 'Kreiraj svoj profil'}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subheading}>
              {mode === 'signIn'
                ? 'Nastavi tamo gde je tim stao.'
                : needsBootstrap
                  ? 'Ovo će biti glavni administratorski nalog.'
                  : 'Pozivnica određuje kojem startupu pripadaš.'}
            </ThemedText>

            {inviteCode && mode === 'signUp' ? (
              <ThemedView type="backgroundElement" style={styles.inviteBanner}>
                <ThemedText type="smallBold">Pozivni link je otvoren</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Pristup se potvrđuje nakon što uneseš email na koji si pozvan.
                </ThemedText>
              </ThemedView>
            ) : null}

            <ThemedView style={styles.form}>
              {mode === 'signUp' ? (
                <ThemedView style={styles.field}>
                  <ThemedText type="smallBold">Ime i prezime</ThemedText>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Kako će te tim videti"
                    placeholderTextColor={theme.textSecondary}
                    autoComplete="name"
                    maxLength={80}
                    style={inputStyle}
                  />
                </ThemedView>
              ) : null}

              {mode === 'signUp' && needsBootstrap && !inviteCode ? (
                <ThemedView style={styles.field}>
                  <ThemedText type="smallBold">Osnivački kod</ThemedText>
                  <TextInput
                    value={bootstrapCode}
                    onChangeText={setBootstrapCode}
                    placeholder="Kod podešen na serveru"
                    placeholderTextColor={theme.textSecondary}
                    secureTextEntry
                    autoCapitalize="none"
                    maxLength={128}
                    style={inputStyle}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    Jednokratna zaštita da prvi posetilac ne preuzme admin nalog.
                  </ThemedText>
                </ThemedView>
              ) : null}

              <ThemedView style={styles.field}>
                <ThemedText type="smallBold">Email</ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ime@startup.com"
                  placeholderTextColor={theme.textSecondary}
                  autoComplete="email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={inputStyle}
                />
              </ThemedView>

              <ThemedView style={styles.field}>
                <ThemedText type="smallBold">Lozinka</ThemedText>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'signIn' ? 'Tvoja lozinka' : 'Najmanje 12 znakova'}
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  style={inputStyle}
                />
                {mode === 'signUp' ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Veliko i malo slovo, broj i specijalni znak.
                  </ThemedText>
                ) : null}
              </ThemedView>

              {error ? (
                <ThemedText type="small" style={[styles.error, { color: '#e5484d' }]}>
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={pendingSubmit}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.text },
                  (pressed || pendingSubmit) && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>
                  {pendingSubmit
                    ? 'Proveravam…'
                    : mode === 'signIn'
                      ? 'Prijavi se'
                      : 'Kreiraj nalog'}
                </ThemedText>
              </Pressable>

              <ThemedView style={styles.switchRow}>
                {mode === 'signIn' && canCreateAccount ? (
                  <Pressable
                    onPress={() => {
                      haptics.select();
                      setMode('signUp');
                      setError(null);
                    }}>
                    <ThemedText type="smallBold">
                      {needsBootstrap ? 'Kreiraj osnivački nalog' : 'Prihvati pozivnicu'}
                    </ThemedText>
                  </Pressable>
                ) : mode === 'signUp' ? (
                  <Pressable
                    onPress={() => {
                      haptics.select();
                      setMode('signIn');
                      setError(null);
                    }}>
                    <ThemedText type="smallBold">Već imaš nalog? Prijavi se</ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nemaš pristup? Zatraži pozivnicu od administratora.
                  </ThemedText>
                )}
              </ThemedView>
            </ThemedView>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.one,
  },
  heading: { marginTop: Spacing.one },
  subheading: { marginTop: Spacing.two },
  inviteBanner: {
    marginTop: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  form: {
    marginTop: Spacing.four,
    gap: Spacing.three,
  },
  field: { gap: Spacing.one },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: { marginTop: Spacing.half },
  button: {
    marginTop: Spacing.two,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  switchRow: {
    marginTop: Spacing.three,
    alignItems: 'center',
  },
});
