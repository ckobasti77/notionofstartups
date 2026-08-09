import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Camera, Trash2, TriangleAlert, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Isto ograničenje koje `storage.setAvatar` proverava na serveru. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** `profiles.updateCurrent` → `cleanRequiredText(…, 80)`. */
const MAX_NAME_LENGTH = 80;

/**
 * „Moj profil" — pandan web `profile-dialog.tsx`. Na telefonu je ekran, ne dijalog:
 * bira se slika iz galerije ili kamerom, pa dijalog ionako mora da ustupi mesto
 * sistemskom biraču.
 *
 * Ulaz: avatar u zaglavlju (`AppHeader`) i „Više → Moj profil".
 * Podaci: `profiles.getCurrent`; upis `profiles.updateCurrent` + `storage.*` —
 * bez nove backend funkcije.
 */
export default function ProfilScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const profile = useQuery(api.profiles.getCurrent, {});
  const updateCurrent = useMutation(api.profiles.updateCurrent);
  const generateUploadUrl = useMutation(api.storage.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.storage.setAvatar);
  const removeAvatar = useMutation(api.storage.removeAvatar);

  // `null` = ime nije dirano, pa polje prati server (npr. izmena sa drugog uređaja).
  const [draftName, setDraftName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [busyAvatar, setBusyAvatar] = useState(false);

  if (profile === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Moj profil" onBack={() => router.back()} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Učitavanje profila" />
        </View>
      </View>
    );
  }

  if (profile === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Moj profil" onBack={() => router.back()} />
        <EmptyState
          icon={<UserRound size={40} color={colors.mutedForeground} />}
          title="Profil nije pronađen"
          description="Prijavi se ponovo pa pokušaj iz početka."
        />
      </View>
    );
  }

  const name = draftName ?? profile.displayName;
  const trimmed = name.trim();
  const nameDirty = trimmed.length > 0 && trimmed !== profile.displayName;

  const saveName = async () => {
    if (!nameDirty || savingName) return;
    setSavingName(true);
    try {
      await updateCurrent({ displayName: trimmed });
      setDraftName(null);
    } catch (error) {
      Alert.alert('Ime nije sačuvano', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setSavingName(false);
    }
  };

  const uploadAvatar = async (uri: string, mimeType: string) => {
    setBusyAvatar(true);
    try {
      const blob = await (await fetch(uri)).blob();
      // Granica se proverava i ovde da se 5 MB ne pošalje pa odbije na serveru —
      // na mobilnoj mreži je to pola minuta uzalud potrošeno.
      if (blob.size > MAX_AVATAR_BYTES) {
        throw new Error('Slika može imati najviše 5 MB.');
      }
      const upload = await generateUploadUrl({});
      const response = await fetch(upload.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!response.ok) throw new Error('Slika nije otpremljena.');
      const payload = (await response.json()) as { storageId: Id<'_storage'> };
      await setAvatar({ storageId: payload.storageId, token: upload.token });
    } catch (error) {
      Alert.alert('Slika nije sačuvana', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setBusyAvatar(false);
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup galeriji je odbijen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dozvola', 'Pristup kameri je odbijen.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const confirmRemoveAvatar = () => {
    Alert.alert('Ukloniti profilnu sliku?', 'Tim će te ponovo videti po inicijalima.', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Ukloni',
        style: 'destructive',
        onPress: () => {
          setBusyAvatar(true);
          void removeAvatar({})
            .catch((error: unknown) =>
              Alert.alert('Greška', accessErrorMessage(error, 'Slika nije uklonjena.')),
            )
            .finally(() => setBusyAvatar(false));
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Moj profil" onBack={() => router.back()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.avatarBlock}>
            <View>
              <Avatar name={profile.displayName} uri={profile.avatarUrl} size={88} />
              {busyAvatar ? (
                <View style={[styles.avatarBusy, { backgroundColor: `${colors.background}CC` }]}>
                  <ActivityIndicator color={colors.primary} accessibilityLabel="Slanje slike" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              PNG, JPG ili WebP · najviše 5 MB
            </Text>
            <View style={styles.avatarActions}>
              <Button
                label="Iz galerije"
                variant="secondary"
                size="sm"
                disabled={busyAvatar}
                onPress={() => void pickFromLibrary()}
              />
              <Button
                label="Slikaj"
                variant="secondary"
                size="sm"
                icon={<Camera size={18} color={colors.foreground} />}
                disabled={busyAvatar}
                onPress={() => void pickFromCamera()}
              />
            </View>
            {profile.avatarUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ukloni profilnu sliku"
                disabled={busyAvatar}
                onPress={confirmRemoveAvatar}
                style={({ pressed }) => [
                  styles.removeAvatar,
                  pressed && { backgroundColor: colors.muted },
                  busyAvatar && styles.dimmed,
                ]}>
                <Trash2 size={18} color={colors.danger} />
                <Text style={[styles.removeAvatarText, { color: colors.danger }]}>
                  Ukloni sliku
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Ime koje tim vidi
            </Text>
            <Input
              value={name}
              maxLength={MAX_NAME_LENGTH}
              editable={!savingName}
              autoCapitalize="words"
              accessibilityLabel="Ime koje tim vidi"
              onChangeText={setDraftName}
              onBlur={() => void saveName()}
              returnKeyType="done"
              onSubmitEditing={() => void saveName()}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Ime stoji uz tvoje beleške, zadatke i poruke.
            </Text>
          </View>

          <Button
            label="Sačuvaj ime"
            loading={savingName}
            disabled={!nameDirty || savingName}
            onPress={() => void saveName()}
          />

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row
              title="Email"
              value={profile.email}
              showChevron={false}
              accessibilityLabel={`Email: ${profile.email}. Menja se samo kroz prijavu.`}
            />
            <Row
              title="Uloga"
              value={profile.role === 'admin' ? 'Administrator' : 'Član'}
              showChevron={false}
              style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
            />
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Email i uloga se ne menjaju odavde — email ide kroz prijavu, ulogu dodeljuje
            administrator.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}


export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ProfilError message={error.message} onRetry={retry} />;
}

function ProfilError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Moj profil" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Profil se ne može učitati"
        description={message || 'Došlo je do greške pri učitavanju profila.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 8,
  },
  avatarBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  avatarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  removeAvatar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  removeAvatarText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  dimmed: {
    opacity: 0.5,
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
  hint: {
    ...text.meta,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
