import { LOGO_MAX_BYTES, SETTINGS_TEXT, moveInOrder } from '@devotion/shared';
import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { TriangleAlert, Building2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateStartupSheet } from '@/components/admin/create-startup-sheet';
import { EmptyState } from '@/components/empty-state';
import {
  AreasSection,
  GeneralSection,
  TeamSection,
} from '@/components/podesavanja/settings-sections';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { radius } from '@/theme/tokens';

/**
 * Podešavanja startupa (PROSTOR K20) — Više › Tim, za SVE članove. Isti
 * sadržaj kao web `?view=settings`: Opšte (naziv, opis i logo menja samo admin),
 * Oblasti (preimenuj, redosled, nova — svaki član), Tim (članovi; pozivnice i
 * lozinke samo admin, na svojim ekranima). Server je izvor istine za prava:
 * `startups.update/setLogo/removeLogo` traže admina, `createArea/updateArea/
 * reorderAreas` samo članstvo.
 */
export default function AdminStartupScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();

  const profile = useQuery(api.profiles.getCurrent, {});
  const isAdmin = profile?.role === 'admin';
  const startup = useQuery(
    api.startups.get,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const updateStartup = useMutation(api.startups.update);
  const generateLogoUploadUrl = useMutation(api.startups.generateLogoUploadUrl);
  const setLogo = useMutation(api.startups.setLogo);
  const removeLogo = useMutation(api.startups.removeLogo);
  const createArea = useMutation(api.startups.createArea);
  const updateArea = useMutation(api.startups.updateArea);
  const reorderAreas = useMutation(api.startups.reorderAreas);

  const scrollRef = useRef<ScrollView>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busySave, setBusySave] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [busyAreaId, setBusyAreaId] = useState<string | null>(null);

  // Rehidrira polja SAMO kad se promeni ID aktivnog startupa (ne na svaki
  // reaktivni refresh upita) — inače bi kucanje bilo pregaženo.
  useEffect(() => {
    if (startup) {
      setName(startup.name);
      setDescription(startup.description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startup?._id]);

  const saveStartup = async () => {
    if (!startup || !name.trim() || busySave) return;
    setBusySave(true);
    haptics.tap();
    try {
      await updateStartup({
        startupId: startup._id,
        name: name.trim(),
        description: description.trim(),
      });
      setName(name.trim());
      setDescription(description.trim());
      haptics.success();
      AccessibilityInfo.announceForAccessibility(SETTINGS_TEXT.saved);
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, SETTINGS_TEXT.notSaved));
    } finally {
      setBusySave(false);
    }
  };

  const uploadLogo = async (uri: string, mimeType: string) => {
    if (!startup) return;
    setBusyLogo(true);
    try {
      const blob = await (await fetch(uri)).blob();
      // Proverava se i ovde da se slika ne šalje uzalud pa odbije na serveru.
      if (blob.size > LOGO_MAX_BYTES) {
        throw new Error(SETTINGS_TEXT.logoTooBig);
      }
      // `startups.generateLogoUploadUrl` vraća URL string direktno (za razliku
      // od `storage.generateAvatarUploadUrl`, koji vraća { uploadUrl, token }).
      const uploadUrl = await generateLogoUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!response.ok) throw new Error(SETTINGS_TEXT.logoUploadFailed);
      const payload = (await response.json()) as { storageId: Id<'_storage'> };
      await setLogo({ startupId: startup._id, storageId: payload.storageId });
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Logo nije sačuvan', accessErrorMessage(error, 'Pokušaj ponovo.'));
    } finally {
      setBusyLogo(false);
    }
  };

  const pickLogo = async (source: 'library' | 'camera') => {
    try {
      await pickLogoUnsafe(source);
    } catch (error) {
      haptics.error();
      Alert.alert('Logo nije sačuvan', accessErrorMessage(error, 'Pokušaj ponovo.'));
    }
  };

  const pickLogoUnsafe = async (source: 'library' | 'camera') => {
    const permission =
      source === 'library'
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Dozvola',
        source === 'library' ? 'Pristup galeriji je odbijen.' : 'Pristup kameri je odbijen.',
        [
          { text: 'Otkaži', style: 'cancel' },
          { text: 'Otvori podešavanja', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    const options = {
      mediaTypes: ['images' as const],
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    };
    const result =
      source === 'library'
        ? await ImagePicker.launchImageLibraryAsync(options)
        : await ImagePicker.launchCameraAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    await uploadLogo(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const confirmRemoveLogo = () => {
    if (!startup) return;
    haptics.warning();
    Alert.alert('Ukloniti logo?', 'Startup će se prikazivati sa inicijalima.', [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Ukloni',
        style: 'destructive',
        onPress: () => {
          setBusyLogo(true);
          void removeLogo({ startupId: startup._id })
            .then(() => haptics.success())
            .catch((error: unknown) => {
              haptics.error();
              Alert.alert('Greška', accessErrorMessage(error, SETTINGS_TEXT.notSaved));
            })
            .finally(() => setBusyLogo(false));
        },
      },
    ]);
  };

  /** Pokreni izmenu oblasti sa oznakom zauzetosti; `true` kad je uspela. */
  const runAreaAction = async (busyId: string, action: () => Promise<unknown>, done: string) => {
    if (busyAreaId !== null) return false;
    setBusyAreaId(busyId);
    try {
      await action();
      haptics.success();
      AccessibilityInfo.announceForAccessibility(done);
      return true;
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, SETTINGS_TEXT.notSaved));
      return false;
    } finally {
      setBusyAreaId(null);
    }
  };

  const moveArea = (areaId: string, direction: -1 | 1) => {
    if (!startup || busyAreaId !== null) return;
    const ids = startup.areas.map((area) => area._id);
    const next = moveInOrder(ids, ids.indexOf(areaId as Id<'startupAreas'>), direction);
    if (!next) return;
    haptics.select();
    void runAreaAction(
      areaId,
      () => reorderAreas({ startupId: startup._id, orderedAreaIds: next }),
      SETTINGS_TEXT.areasReordered,
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <ScreenHeader title="Podešavanja startupa" onBack={() => router.back()} />
      </View>

      {activeStartupId === null ? (
        <EmptyState
          icon={<Building2 size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Izaberi ga iz zaglavlja Prostora."
        />
      ) : startup === undefined || profile === undefined ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <SettingsSkeleton />
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          // `padding` na obe platforme: Expo SDK 57 edge-to-edge (Android) razbija
          // OS `adjustResize`, pa tastaturu kompenzujemo u JS-u (kao `zadatak/[id].tsx`).
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            <GeneralSection
              name={name}
              description={description}
              logoUrl={startup.logoUrl}
              canEdit={isAdmin}
              busySave={busySave}
              busyLogo={busyLogo}
              dirty={name.trim() !== startup.name || description.trim() !== startup.description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onSave={() => void saveStartup()}
              onPickFromLibrary={() => void pickLogo('library')}
              onPickFromCamera={() => void pickLogo('camera')}
              onRemoveLogo={confirmRemoveLogo}
            />
            <AreasSection
              areas={startup.areas}
              busyId={busyAreaId}
              onRename={(areaId, label) =>
                runAreaAction(
                  areaId,
                  () => updateArea({ areaId: areaId as Id<'startupAreas'>, label }),
                  SETTINGS_TEXT.areaRenamed,
                )
              }
              onMove={moveArea}
              onNewFieldFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150)}
              onCreate={(label) =>
                runAreaAction(
                  'nova',
                  () => createArea({ startupId: startup._id, label }),
                  SETTINGS_TEXT.areaCreated,
                )
              }
            />
            <TeamSection
              isAdmin={isAdmin}
              onMembers={() => router.push('/clanovi')}
              onInvites={() => router.push('/pozivnice')}
              onPasswords={() => router.push('/lozinke')}
              onCreateStartup={() => {
                haptics.tap();
                setCreateOpen(true);
              }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <CreateStartupSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => setActiveStartupId(id)}
      />
    </View>
  );
}

/** Oblik učitanog ekrana: logo, dva polja, pa red oblasti. */
function SettingsSkeleton() {
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje podešavanja"
      style={styles.skeletonBlock}>
      <Skeleton width={72} height={72} borderRadius={radius.pill} />
      <Skeleton width="100%" height={48} borderRadius={radius.control} />
      <Skeleton width="100%" height={80} borderRadius={radius.control} />
      <Skeleton width="100%" height={56} />
      <Skeleton width="100%" height={56} />
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SettingsError
      message={accessErrorMessage(error, 'Proveri vezu i pokušaj ponovo.')}
      onRetry={retry}
    />
  );
}

function SettingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Podešavanja startupa" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Podešavanja nisu učitana"
        description={message}
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
  content: {
    padding: 16,
    paddingTop: 0,
    gap: 24,
  },
  skeletonBlock: {
    gap: 16,
  },
});
