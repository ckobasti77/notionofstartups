import { useAction } from 'convex/react';
import { Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, fontWeight, text } from '@/theme/tokens';

/** Isti tekst kao server `validatePasswordRequirements` (auth.ts) i web klijent. */
const PASSWORD_HINT =
  'Lozinka mora imati 12-128 znakova, veliko i malo slovo, broj i specijalni znak.';

export type PasswordTarget = {
  profileId: Id<'profiles'>;
  displayName: string;
  email: string;
};

/**
 * Donji sheet za postavljanje NOVE lozinke jednom članu — mobilni pandan web
 * `member-password-dialog.tsx`. Otvara ga globalni ekran `lozinke.tsx`. Naslov
 * nosi ime člana (potvrda), poziv ide na `adminAuth.adminSetPassword` (prva
 * `useAction` na mobilnom). Lozinka se nigde ne pamti niti vraća.
 */
export function SetPasswordSheet({
  target,
  onClose,
}: {
  target: PasswordTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={target !== null} onClose={onClose} avoidKeyboard maxHeight="80%" style={styles.sheet}>
      {/* `key` po članu: forma se montira sveža za svakog (čisto polje, bez pokazane lozinke). */}
      {target ? <PasswordForm key={target.profileId} target={target} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PasswordForm({ target, onClose }: { target: PasswordTarget; onClose: () => void }) {
  const colors = useThemeColors();
  const changePassword = useAction(api.adminAuth.adminSetPassword);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    haptics.tap();
    try {
      await changePassword({ profileId: target.profileId, newPassword: password });
      haptics.success();
      setPassword('');
      onClose();
      Alert.alert('Gotovo', `Lozinka za ${target.displayName} je promenjena.`);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Lozinka nije promenjena.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        Nova lozinka za {target.displayName}
      </Text>
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        {target.email} · sve ranije prijave ovog člana se poništavaju.
      </Text>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Nova lozinka</Text>
        <View style={styles.passwordWrap}>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Najmanje 12 znakova"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            textContentType="none"
            editable={!busy}
            accessibilityLabel={`Nova lozinka za ${target.displayName}`}
            style={styles.passwordInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? 'Sakrij lozinku' : 'Prikaži lozinku'}
            onPress={() => setShow((prev) => !prev)}
            hitSlop={8}
            style={styles.eyeBtn}>
            {show ? (
              <EyeOff size={20} color={colors.mutedForeground} />
            ) : (
              <Eye size={20} color={colors.mutedForeground} />
            )}
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{PASSWORD_HINT}</Text>
      </View>

      <Button
        label="Postavi novu lozinku"
        icon={<KeyRound size={18} color={colors.primaryForeground} />}
        loading={busy}
        disabled={!password || busy}
        onPress={() => void submit()}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: 20,
    gap: 12,
  },
  form: {
    gap: 12,
  },
  heading: {
    ...text.title,
  },
  sub: {
    ...text.meta,
  },
  field: {
    gap: 6,
  },
  label: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  passwordWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    ...text.meta,
  },
});
