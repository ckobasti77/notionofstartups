import { useMutation, useQuery } from 'convex/react';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
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

import { CreateStartupSheet } from '@/components/admin/create-startup-sheet';
import { EmptyState } from '@/components/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveStartup } from '@/context/active-startup';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { accessErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Ogledalo `validateLogo` u `startups.ts` — 2 MB, ne 5 MB kao avatar. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Ogledalo `cleanRequiredText(..., "Naziv startupa", 100)`. */
const MAX_NAME_LENGTH = 100;
/** Ogledalo `cleanOptionalText(..., "Opis", 500)`. */
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Administracija startupa (PARITET A2) — mobilni pandan web `admin-dialog.tsx`
 * ("Startup" tab + redosled oblasti iz sidebar drag&drop-a). Ulaz je skriven u
 * tabu „Više" ako korisnik nije admin.
 *
 * Za razliku od `clanovi.tsx`/`pozivnice.tsx` (gde je čitanje koje pokreće
 * ekran samo po sebi iza `requireAdmin`, pa server sam odbije ne-admina), ovaj
 * ekran ČUVA eksplicitnu `profile.role === 'admin'` proveru unutra (vidi ispod
 * u telu funkcije) — namerno odstupanje od „samo server gejtuje" obrasca.
 * Razlog: `startups.reorderAreas` na serveru zove `requireStartupMember`, ne
 * `requireAdmin` (isto na webu — sidebar drag&drop je dozvoljen svakom
 * članu, van admin dijaloga), pa bez ove provere deep-link na ovu rutu
 * ne-adminu ne bi samo pokazao grešku — stvarno bi mu dozvolio da pomeri
 * oblasti. Ostalih 8 mutacija i dalje ima `requireAdmin` na serveru kao pravu
 * branu; ova provera je dodatni sloj samo za `reorderAreas`, ali je jednostavnije
 * primeniti je na ceo ekran nego samo na dugmad za redosled.
 */
export default function AdminStartupScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeStartupId, setActiveStartupId } = useActiveStartup();

  const profile = useQuery(api.profiles.getCurrent, {});
  const startup = useQuery(
    api.startups.get,
    activeStartupId ? { startupId: activeStartupId } : 'skip',
  );
  const updateStartup = useMutation(api.startups.update);
  const generateLogoUploadUrl = useMutation(api.startups.generateLogoUploadUrl);
  const setLogo = useMutation(api.startups.setLogo);
  const removeLogo = useMutation(api.startups.removeLogo);
  const reorderAreas = useMutation(api.startups.reorderAreas);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busySave, setBusySave] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [busyAreaId, setBusyAreaId] = useState<Id<'startupAreas'> | null>(null);

  // Rehidrira polja SAMO kad se promeni ID aktivnog startupa (ne na svaki
  // reaktivni refresh upita) — inače bi kucanje bilo pregaženo. Ovo takođe
  // znači da posle kreiranja novog startupa i prebacivanja na njega, polja
  // sama pokažu njegove (podrazumevane) vrednosti.
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
      haptics.success();
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Startup nije sačuvan.'));
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
      if (blob.size > MAX_LOGO_BYTES) {
        throw new Error('Logo može imati najviše 2 MB.');
      }
      // `startups.generateLogoUploadUrl` vraća URL string direktno (za razliku
      // od `storage.generateAvatarUploadUrl`, koji vraća { uploadUrl, token }).
      const uploadUrl = await generateLogoUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!response.ok) throw new Error('Logo nije otpremljen.');
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

  const pickLogoFromLibrary = async () => {
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
    await uploadLogo(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const pickLogoFromCamera = async () => {
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
    await uploadLogo(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const confirmRemoveLogo = () => {
    if (!startup) return;
    haptics.warning();
    Alert.alert(
      'Ukloniti logo?',
      'Startup će se prikazivati sa inicijalima umesto logotipa.',
      [
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
                Alert.alert('Greška', accessErrorMessage(error, 'Logo nije uklonjen.'));
              })
              .finally(() => setBusyLogo(false));
          },
        },
      ],
    );
  };

  const moveArea = async (areaId: Id<'startupAreas'>, direction: -1 | 1) => {
    if (!startup || busyAreaId !== null) return;
    const areas = startup.areas;
    const index = areas.findIndex((area) => area._id === areaId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= areas.length) return;
    const reordered = [...areas];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setBusyAreaId(areaId);
    haptics.select();
    try {
      await reorderAreas({
        startupId: startup._id,
        orderedAreaIds: reordered.map((area) => area._id),
      });
    } catch (error) {
      haptics.error();
      Alert.alert('Greška', accessErrorMessage(error, 'Redosled nije promenjen.'));
    } finally {
      setBusyAreaId(null);
    }
  };

  // Izuzetak od obrasca „samo server gejtuje" (`clanovi.tsx`/`pozivnice.tsx`):
  // tamo je čitanje koje pokreće ekran samo po sebi iza `requireAdmin`, pa
  // ne-admin odmah dobije grešku. Ovde `startups.get`/`listMembers` (koje ovaj
  // ekran ne poziva, ali čita isti `startup`) su namerno dostupni svakom
  // članu, a `reorderAreas` na serveru zove `requireStartupMember`, ne
  // `requireAdmin` (vidi komentar iznad) — bez ove provere bi deep-link na
  // `/admin-startup` ne-adminu stvarno dozvolio da pomeri oblasti.
  if (profile !== undefined && profile !== null && profile.role !== 'admin') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Administracija startupa" onBack={() => router.back()} />
        <EmptyState
          icon={<ShieldCheck size={40} color={colors.mutedForeground} />}
          title="Potreban je administratorski pristup"
          description="Ovaj ekran je dostupan samo administratorima startupa."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Visina zaglavlja + „Napravi novi startup" reda je offset za
          `KeyboardAvoidingView` ispod — meri se ovde jer `ScreenHeader` sam
          uračunava safe-area (isto kao `zadatak/[id].tsx`/`razgovor/[id].tsx`). */}
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <ScreenHeader title="Administracija startupa" onBack={() => router.back()} eyebrow={startup?.name} />

        <View style={styles.createBlock}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row
              icon={<Plus size={20} color={colors.primaryText} />}
              title="Napravi novi startup"
              onPress={() => {
                haptics.tap();
                setCreateOpen(true);
              }}
            />
          </View>
        </View>
      </View>

      {activeStartupId === null ? (
        <EmptyState
          icon={<ShieldCheck size={40} color={colors.mutedForeground} />}
          title="Izaberi startup"
          description="Da izmeniš postojeći startup, izaberi ga iz zaglavlja. Ili napravi novi iznad."
        />
      ) : startup === undefined ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <AdminStartupSkeleton />
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          // `padding` na obe platforme: Expo SDK 57 edge-to-edge (Android) razbija
          // OS `adjustResize`, pa tastaturu kompenzujemo u JS-u (isto kao
          // `zadatak/[id].tsx`/`razgovor/[id].tsx`) — inače tastatura prekrije Opis.
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.logoBlock}>
                <View>
                  <Avatar name={startup.name} uri={startup.logoUrl} size={72} />
                  {busyLogo ? (
                    <View style={[styles.logoBusy, { backgroundColor: `${colors.background}CC` }]}>
                      <ActivityIndicator color={colors.primary} accessibilityLabel="Slanje loga" />
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  PNG, JPG, WebP ili SVG · najviše 2 MB
                </Text>
                <View style={styles.logoActions}>
                  <Button
                    label="Iz galerije"
                    variant="secondary"
                    size="sm"
                    disabled={busyLogo}
                    onPress={() => void pickLogoFromLibrary()}
                  />
                  <Button
                    label="Slikaj"
                    variant="secondary"
                    size="sm"
                    icon={<Camera size={18} color={colors.foreground} />}
                    disabled={busyLogo}
                    onPress={() => void pickLogoFromCamera()}
                  />
                </View>
                {startup.logoUrl ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ukloni logo"
                    disabled={busyLogo}
                    onPress={confirmRemoveLogo}
                    style={({ pressed }) => [
                      styles.removeLogo,
                      pressed && { backgroundColor: colors.muted },
                      busyLogo && styles.dimmed,
                    ]}>
                    <Trash2 size={18} color={colors.danger} />
                    <Text style={[styles.removeLogoText, { color: colors.danger }]}>Ukloni logo</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.formBlock}>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Naziv</Text>
                  <Input
                    value={name}
                    onChangeText={setName}
                    maxLength={MAX_NAME_LENGTH}
                    editable={!busySave}
                    accessibilityLabel="Naziv startupa"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Opis</Text>
                  <Input
                    value={description}
                    onChangeText={setDescription}
                    maxLength={MAX_DESCRIPTION_LENGTH}
                    multiline
                    numberOfLines={3}
                    editable={!busySave}
                    accessibilityLabel="Opis startupa"
                    style={styles.multiline}
                  />
                </View>
                <Button
                  label="Sačuvaj"
                  loading={busySave}
                  disabled={!name.trim() || busySave}
                  onPress={() => void saveStartup()}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                Redosled oblasti
              </Text>
              <View
                style={[
                  styles.card,
                  styles.areasCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                {startup.areas.map((area, index) => {
                  const isFirst = index === 0;
                  const isLast = index === startup.areas.length - 1;
                  return (
                    <Row
                      key={area._id}
                      title={area.label}
                      showChevron={false}
                      style={[
                        styles.areaRow,
                        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                      ]}
                      value={
                        <View style={styles.reorderButtons}>
                          {busyAreaId === area._id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : null}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Pomeri „${area.label}" gore`}
                            disabled={busyAreaId !== null || isFirst}
                            onPress={() => void moveArea(area._id, -1)}
                            style={({ pressed }) => [
                              styles.reorderBtn,
                              pressed && { backgroundColor: colors.muted },
                              (busyAreaId !== null || isFirst) && styles.dimmed,
                            ]}>
                            <ChevronUp size={18} color={colors.foreground} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Pomeri „${area.label}" dole`}
                            disabled={busyAreaId !== null || isLast}
                            onPress={() => void moveArea(area._id, 1)}
                            style={({ pressed }) => [
                              styles.reorderBtn,
                              pressed && { backgroundColor: colors.muted },
                              (busyAreaId !== null || isLast) && styles.dimmed,
                            ]}>
                            <ChevronDown size={18} color={colors.foreground} />
                          </Pressable>
                        </View>
                      }
                    />
                  );
                })}
              </View>
            </View>
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

/** Oblik učitanog ekrana: logo 72 + hint + dva polja + dugme, pa kartica oblasti. */
function AdminStartupSkeleton() {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Učitavanje administracije startupa"
      style={styles.skeletonBlock}>
      <View style={styles.avatarBlock}>
        <Skeleton width={72} height={72} borderRadius={radius.pill} />
        <Skeleton width={160} height={12} />
      </View>
      <Skeleton width="100%" height={48} borderRadius={radius.control} />
      <Skeleton width="100%" height={80} borderRadius={radius.control} />
      <Skeleton width="100%" height={48} borderRadius={radius.control} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Skeleton width="100%" height={56} />
      </View>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AdminStartupError message={error.message} onRetry={retry} />;
}

function AdminStartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Administracija startupa" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Administracija se ne može učitati"
        description={message || 'Potreban je administratorski pristup.'}
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
  createBlock: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  content: {
    padding: 16,
    paddingTop: 0,
    gap: 20,
  },
  skeletonBlock: {
    gap: 16,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  areasCard: {
    padding: 0,
  },
  areaRow: {
    paddingHorizontal: 12,
  },
  logoBlock: {
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  logoBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  logoActions: {
    flexDirection: 'row',
    gap: 8,
  },
  removeLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  removeLogoText: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  dimmed: {
    opacity: 0.4,
  },
  formBlock: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
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
  multiline: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 8,
  },
  hint: {
    ...text.meta,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    ...text.meta,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reorderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
});
