import { useAudioPlayer } from 'expo-audio';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import {
  BellRing,
  CircleAlert,
  CircleCheck,
  Info,
  Moon,
  Play,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation, useQuery } from 'convex/react';

import { LoadingSwap } from '@/components/ui/loading-swap';
import { Row } from '@/components/ui/row';
import { api } from '@/convex/_generated/api';
import { EmptyState } from '@/components/empty-state';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { haptics } from '@/lib/haptics';
import type { ChannelBase } from '@/convex/lib/notificationChannels';
import type { NotificationType } from '@/convex/lib/notifications';
import {
  isRowEnabled,
  NOTIFICATION_SETTINGS_GROUPS,
  toggleRow,
  type SettingsRow,
} from '@/convex/lib/notificationSettingsCatalog';
import { hasSoundPreview, SOUND_PREVIEWS } from '@/lib/notifications/sound-previews';
import { usePushStatus, useRegisterPushDevice } from '@/lib/notifications/register';
import { describeNotificationChannels } from '@/lib/notifications/channels';
import { useThemeColors } from '@/theme/theme-provider';
import {
  fontWeight,
  MIN_TOUCH_TARGET,
  radius,
  space,
  type ColorTokens,
} from '@/theme/tokens';

/** Podrazumevani prozor tihih sati kad ih korisnik prvi put uključi (22:00–08:00). */
const DEFAULT_QUIET_START = 22 * 60;
const DEFAULT_QUIET_END = 8 * 60;

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

/** Minuti od ponoći → „HH:MM". */
function formatMinutes(minutes: number) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Ekran „Obaveštenja i zvuci" (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
 *
 * Podešavanja su PO PROFILU (`notificationSettings`), pa isključen tip važi na
 * svim uređajima i na webu. Tihi sati se samo čuvaju ovde — primenjuju se na
 * serveru pri dostavi; `mention` i `deadline` ih probijaju.
 */
type Settings = {
  mutedTypes: Array<NotificationType>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
};

/**
 * Ekran „Obaveštenja i zvuci" (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
 *
 * Omotač: čita podešavanja i drži header; dok podaci ne stignu, spinner. Forma
 * (`SettingsForm`) se montira tek kad su podešavanja tu i inicijalizuje `useState`
 * iz njih — pa prekidači nikad ne „trepnu" iz default stanja (bez seed-a kroz efekat).
 */
export default function NotificationSettingsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useQuery(api.notificationSettings.get, {});

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Obaveštenja i zvuci" onBack={() => router.back()} />
      {/* Skeleton je u obliku forme koja stiže: naslov grupe pa redovi sa prekidačem. */}
      <LoadingSwap
        loading={settings === undefined}
        skeleton={
          <SkeletonList
            count={6}
            style={styles.content}
            item={(index) => <SkeletonRow index={index} subtitle trailing="value" />}
          />
        }>
        {settings ? (
          <SettingsForm initial={settings} colors={colors} bottomInset={insets.bottom} />
        ) : null}
      </LoadingSwap>
    </View>
  );
}

/**
 * `initial` prati server (realtime), ali stanje se inicijalizuje samo pri
 * montiranju — realtime izmene ne gaze korisnikov unos. `initial` je i cilj
 * vraćanja ako upis padne (uvek server-istina). Podešavanja se po profilu čuvaju,
 * pa isključen tip važi svuda; tihi sati se primenjuju na serveru (mention i
 * deadline ih probijaju).
 */
function SettingsForm({
  initial,
  colors,
  bottomInset,
}: {
  initial: Settings;
  colors: ColorTokens;
  bottomInset: number;
}) {
  const update = useMutation(api.notificationSettings.update);
  const player = useAudioPlayer(null);
  const [mutedTypes, setMutedTypes] = useState<string[]>(initial.mutedTypes);
  const [quietStart, setQuietStart] = useState<number | null>(initial.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState<number | null>(initial.quietHoursEnd);
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);

  async function persist(next: {
    mutedTypes: string[];
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
  }) {
    try {
      await update({
        // Katalog garantuje da su svi tipovi poznati; kastujemo za validator.
        mutedTypes: next.mutedTypes as Array<NotificationType>,
        quietHoursStart: next.quietHoursStart,
        quietHoursEnd: next.quietHoursEnd,
      });
    } catch (error) {
      haptics.error();
      // Vrati na server-stanje da UI ne laže o onome što je zaista sačuvano.
      setMutedTypes(initial.mutedTypes);
      setQuietStart(initial.quietHoursStart);
      setQuietEnd(initial.quietHoursEnd);
      Alert.alert(
        'Nije sačuvano',
        error instanceof Error ? error.message : 'Pokušaj ponovo.',
      );
    }
  }

  function onToggleRow(row: SettingsRow, enabled: boolean) {
    haptics.select();
    const next = toggleRow(row, mutedTypes, enabled);
    setMutedTypes(next);
    void persist({ mutedTypes: next, quietHoursStart: quietStart, quietHoursEnd: quietEnd });
  }

  function onToggleQuiet(enabled: boolean) {
    haptics.select();
    const nextStart = enabled ? quietStart ?? DEFAULT_QUIET_START : null;
    const nextEnd = enabled ? quietEnd ?? DEFAULT_QUIET_END : null;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  function onPickTime(minutes: number) {
    const nextStart = picker === 'start' ? minutes : quietStart;
    const nextEnd = picker === 'end' ? minutes : quietEnd;
    setQuietStart(nextStart);
    setQuietEnd(nextEnd);
    void persist({ mutedTypes, quietHoursStart: nextStart, quietHoursEnd: nextEnd });
  }

  function playPreview(base: ChannelBase) {
    const source = SOUND_PREVIEWS[base];
    if (!source) return;
    try {
      player.replace(source);
      void player.seekTo(0);
      player.play();
    } catch {
      // Proba zvuka ne sme da sruši ekran; tiho odustani.
    }
  }

  const quietOn = quietStart !== null && quietEnd !== null;

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + space[8] }]}>
          {NOTIFICATION_SETTINGS_GROUPS.map((group) => (
            <View key={group.key} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {group.label.toUpperCase()}
              </Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {group.rows.map((row, index) => (
                  <ToggleRow
                    key={row.key}
                    row={row}
                    colors={colors}
                    first={index === 0}
                    enabled={isRowEnabled(row, mutedTypes)}
                    onToggle={(enabled) => onToggleRow(row, enabled)}
                    onPreview={() =>
                      row.previewSound ? playPreview(row.previewSound) : undefined
                    }
                  />
                ))}
              </View>
            </View>
          ))}

          {/* Tihi sati */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              TIHI SATI
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row
                variant="toggle"
                style={[styles.row, styles.rowFirst]}
                icon={<Moon size={20} color={colors.foreground} />}
                title="Uključeno"
                checked={quietOn}
                onToggle={onToggleQuiet}
                accessibilityLabel="Tihi sati"
              />

              {quietOn ? (
                <>
                  <View style={[styles.row, styles.rowDivider, { borderTopColor: colors.border }]}>
                    <TimeField
                      label="Od"
                      value={quietStart}
                      colors={colors}
                      onPress={() => setPicker('start')}
                    />
                    <TimeField
                      label="Do"
                      value={quietEnd}
                      colors={colors}
                      onPress={() => setPicker('end')}
                    />
                  </View>
                  <View style={[styles.hint, styles.rowDivider, { borderTopColor: colors.border }]}>
                    <Info size={15} color={colors.mutedForeground} />
                    <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                      Rokovi i pominjanja i dalje prolaze.
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <PushDeviceCard colors={colors} />

          {/*
            Sistemska podešavanja telefona. IZUZETAK: postoji samo na mobilnom —
            web nema API da otvori OS podešavanja dozvola. Web ekvivalent je
            tekstualno uputstvo u `PushToggle` kad su obaveštenja blokirana.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sistemska podešavanja telefona"
            onPress={() => {
              void Linking.openSettings();
            }}
            style={({ pressed }) => [
              styles.systemButton,
              { borderColor: colors.border },
              pressed && { backgroundColor: colors.muted },
            ]}>
            <Smartphone size={18} color={colors.foreground} />
            <Text style={[styles.systemLabel, { color: colors.foreground }]}>
              Sistemska podešavanja telefona
            </Text>
          </Pressable>
          <Text style={[styles.systemHint, { color: colors.mutedForeground }]}>
            Ako su obaveštenja isključena na nivou telefona, ništa u aplikaciji ne pomaže.
          </Text>
      </ScrollView>

      <TimePickerSheet
        visible={picker !== null}
        label={picker === 'start' ? 'Od kada' : 'Do kada'}
        value={(picker === 'start' ? quietStart : quietEnd) ?? DEFAULT_QUIET_START}
        colors={colors}
        onChange={onPickTime}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

/**
 * „Ovaj uređaj" — jedino mesto sa kog se vidi da li push uopšte stiže.
 *
 * Bez njega je „ne zvoni mi" neproverljivo: registracija tokena je padala tiho,
 * a greška je živela u konzoli koju na tuđem telefonu niko ne otvara. Zato ovde
 * stoje tri stvari koje zajedno pokrivaju sve karike lanca: stanje registracije
 * (telefon → baza), probno slanje (server → Expo → FCM → telefon) i dugme za
 * ponovni pokušaj.
 */
function PushDeviceCard({ colors }: { colors: ColorTokens }) {
  const status = usePushStatus();
  const register = useRegisterPushDevice();
  const sendTest = useAction(api.pushTest.sendTest);
  const deviceCount = useQuery(api.expoPushTokens.myDeviceCount, {});
  const [busy, setBusy] = useState<'register' | 'test' | null>(null);

  const ok = status.state === 'ok';
  const failed = status.state === 'error';

  const summary =
    status.state === 'ok'
      ? `Uređaj prima obaveštenja${
          typeof deviceCount === 'number' && deviceCount > 1
            ? ` · ukupno uređaja: ${deviceCount}`
            : ''
        }`
      : status.state === 'error'
        ? status.reason
        : status.state === 'running'
          ? 'Registrujem uređaj…'
          : 'Registracija još nije završena.';

  async function onRegister() {
    haptics.tap();
    setBusy('register');
    try {
      const result = await register();
      if (result.state === 'ok') {
        haptics.success();
        Alert.alert('Uređaj registrovan', 'Sad možeš da pošalješ probno obaveštenje.');
      } else if (result.state === 'error') {
        haptics.error();
        Alert.alert(
          'Registracija nije uspela',
          result.detail ? `${result.reason}\n\n${result.detail}` : result.reason,
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function onCheckChannels() {
    haptics.tap();
    try {
      Alert.alert('Kanali obaveštenja', await describeNotificationChannels());
    } catch (error) {
      Alert.alert(
        'Kanali obaveštenja',
        error instanceof Error ? error.message : 'Čitanje kanala nije uspelo.',
      );
    }
  }

  async function onTest() {
    haptics.tap();
    setBusy('test');
    try {
      const result = await sendTest({});
      if (result.ok) haptics.success();
      else haptics.error();
      Alert.alert(result.ok ? 'Poslato' : 'Nije poslato', result.detail);
    } catch (error) {
      haptics.error();
      Alert.alert(
        'Nije poslato',
        error instanceof Error ? error.message : 'Pokušaj ponovo.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>OVAJ UREĐAJ</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.pushStatus}>
          <View style={styles.pushStatusHead}>
            {ok ? (
              <CircleCheck size={18} color={colors.primary} />
            ) : failed ? (
              <CircleAlert size={18} color={colors.destructive} />
            ) : (
              <Info size={18} color={colors.mutedForeground} />
            )}
            <Text style={[styles.pushStatusText, { color: colors.foreground }]}>{summary}</Text>
          </View>
          {status.state === 'error' && status.detail ? (
            <Text style={[styles.pushDetail, { color: colors.mutedForeground }]}>
              {status.detail}
            </Text>
          ) : null}
        </View>

        <View style={[styles.pushActions, styles.rowDivider, { borderTopColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pošalji probno obaveštenje"
            accessibilityState={{ disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => {
              void onTest();
            }}
            style={({ pressed }) => [
              styles.pushBtn,
              { backgroundColor: colors.primary },
              busy !== null && styles.pushBtnDisabled,
              pressed && { opacity: 0.85 },
            ]}>
            <BellRing size={16} color={colors.primaryForeground} />
            <Text style={[styles.pushBtnLabel, { color: colors.primaryForeground }]}>
              {busy === 'test' ? 'Šaljem…' : 'Probno obaveštenje'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registruj uređaj ponovo"
            accessibilityState={{ disabled: busy !== null }}
            disabled={busy !== null}
            onPress={() => {
              void onRegister();
            }}
            style={({ pressed }) => [
              styles.pushBtn,
              { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              busy !== null && styles.pushBtnDisabled,
              pressed && { backgroundColor: colors.muted },
            ]}>
            <RefreshCw size={16} color={colors.foreground} />
            <Text style={[styles.pushBtnLabel, { color: colors.foreground }]}>
              {busy === 'register' ? 'Registrujem…' : 'Registruj ponovo'}
            </Text>
          </Pressable>
        </View>

        {/* Poslednja linija odbrane kad „sve je štiklirano, a ne iskače":
            pokazuje šta na uređaju STVARNO postoji, umesto da se nagađa. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Provera kanala obaveštenja"
          onPress={() => {
            void onCheckChannels();
          }}
          style={({ pressed }) => [
            styles.channelCheck,
            styles.rowDivider,
            { borderTopColor: colors.border },
            pressed && { backgroundColor: colors.muted },
          ]}>
          <Text style={[styles.channelCheckLabel, { color: colors.primary }]}>
            Provera kanala obaveštenja
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToggleRow({
  row,
  colors,
  first,
  enabled,
  onToggle,
  onPreview,
}: {
  row: SettingsRow;
  colors: ColorTokens;
  first: boolean;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPreview: () => void;
}) {
  // Dugme stoji uz svaki red koji IMA zvuk (šest redova). Dok odgovarajući .wav
  // ne legne u assets/ (sound-previews.ts), dugme je onemogućeno — pali se samo.
  const hasSound = row.previewSound !== null;
  const previewReady = hasSoundPreview(row.previewSound);
  return (
    <Row
      variant="toggle"
      style={[
        styles.row,
        first ? styles.rowFirst : styles.rowDivider,
        !first && { borderTopColor: colors.border },
      ]}
      title={row.label}
      subtitle={row.description || undefined}
      value={
        hasSound ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !previewReady }}
            accessibilityLabel={
              previewReady
                ? `Probaj zvuk: ${row.label}`
                : `Zvuk se uskoro dodaje: ${row.label}`
            }
            disabled={!previewReady}
            onPress={onPreview}
            style={({ pressed }) => [
              styles.previewBtn,
              { borderColor: colors.border },
              !previewReady && styles.previewBtnDisabled,
              pressed && previewReady && { backgroundColor: colors.muted },
            ]}>
            <Play size={16} color={colors.primary} fill={colors.primary} />
          </Pressable>
        ) : undefined
      }
      checked={enabled}
      onToggle={onToggle}
      accessibilityLabel={row.label}
    />
  );
}

function TimeField({
  label,
  value,
  colors,
  onPress,
}: {
  label: string;
  value: number | null;
  colors: ColorTokens;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value === null ? 'nije izabrano' : formatMinutes(value)}`}
      onPress={onPress}
      style={styles.timeField}>
      <Text style={[styles.timeFieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.timeFieldValue, { color: colors.foreground, borderColor: colors.border }]}>
        {value === null ? '--:--' : formatMinutes(value)}
      </Text>
    </Pressable>
  );
}

const HOURS = Array.from({ length: 24 }, (_, index) => index);
// Puna rezolucija (0–59), isto kao web `<input type="time">` — bez toga vrednost
// postavljena na webu (npr. 22:37) ne bi mogla da se reprodukuje pri editovanju.
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function TimePickerSheet({
  visible,
  label,
  value,
  colors,
  onChange,
  onClose,
}: {
  visible: boolean;
  label: string;
  value: number;
  colors: ColorTokens;
  onChange: (minutes: number) => void;
  onClose: () => void;
}) {
  const selectedHour = Math.floor(value / 60);
  const selectedMinute = value % 60;

  return (
    <Sheet visible={visible} onClose={onClose} style={styles.sheet}>
      <Text style={[styles.sheetTitle, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.pickerColumns}>
        <PickerColumn
          data={HOURS}
          selected={selectedHour}
          colors={colors}
          format={pad}
          unit="Sat"
          active={visible}
          onSelect={(hour) => onChange(hour * 60 + selectedMinute)}
        />
        <Text style={[styles.pickerColon, { color: colors.foreground }]}>:</Text>
        <PickerColumn
          data={MINUTES}
          selected={selectedMinute}
          colors={colors}
          format={pad}
          unit="Minut"
          active={visible}
          onSelect={(minute) => onChange(selectedHour * 60 + minute)}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gotovo"
        onPress={() => {
          haptics.tap();
          onClose();
        }}
        style={({ pressed }) => [
          styles.doneBtn,
          { backgroundColor: colors.primary },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={[styles.doneLabel, { color: colors.primaryForeground }]}>Gotovo</Text>
      </Pressable>
    </Sheet>
  );
}

/** Visina jedne stavke — fiksna da bi „skroluj na izabrano" imalo pouzdanu meru. */
const PICKER_ITEM_HEIGHT = MIN_TOUCH_TARGET;

function PickerColumn({
  data,
  selected,
  colors,
  format,
  unit,
  active,
  onSelect,
}: {
  data: number[];
  selected: number;
  colors: ColorTokens;
  format: (value: number) => string;
  /** Reč za čitač ekrana ispred vrednosti („Sat"/„Minut") — kolone su dvosmislene bez nje. */
  unit: string;
  /** Da li je sheet otvoren; koristi se da se skroluje na izabranu vrednost pri otvaranju. */
  active: boolean;
  onSelect: (value: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  // Skroluj na izabranu vrednost SAMO pri otvaranju (dep je `active`), da lista
  // ne skače dok korisnik bira. Bez ovoga bi npr. sat 22 bio van vidokruga.
  useEffect(() => {
    if (!active) return;
    const index = data.indexOf(selected);
    if (index >= 0) {
      scrollRef.current?.scrollTo({ y: index * PICKER_ITEM_HEIGHT, animated: false });
    }
    // Namerno bez `selected`/`data` u dep-nizu: skrol se dešava samo na otvaranje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.pickerColumn}
      contentContainerStyle={styles.pickerColumnContent}
      showsVerticalScrollIndicator={false}>
      {data.map((item) => {
        const isSelected = item === selected;
        return (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`${unit} ${item}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [
              styles.pickerItem,
              isSelected && { backgroundColor: colors.accent },
              pressed && !isSelected && { backgroundColor: colors.muted },
            ]}>
            <Text
              style={[
                styles.pickerItemText,
                { color: isSelected ? colors.accentForeground : colors.foreground },
                isSelected && { fontWeight: fontWeight.bold },
              ]}>
              {format(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * `notificationSettings.get` prolazi kroz `requireProfile` i baca kad sesija
 * istekne — bez granice ekran pada, a ovo je jedini put do isključivanja zvuka.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <PodesavanjaErrorState message={error.message} onRetry={retry} />;
}

function PodesavanjaErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Obaveštenja i zvuci" onBack={() => router.back()} />
      <EmptyState
        icon={<TriangleAlert size={40} color={colors.destructive} />}
        title="Podešavanja se ne mogu učitati"
        description={message || 'Došlo je do greške pri učitavanju podešavanja.'}
        actionLabel="Pokušaj ponovo"
        onAction={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: space[4],
    gap: space[5],
  },
  section: {
    gap: space[2],
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    paddingHorizontal: space[1],
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    minHeight: 56,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  previewBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewBtnDisabled: {
    opacity: 0.4,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  timeField: {
    flex: 1,
    gap: 4,
  },
  timeFieldLabel: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
  },
  timeFieldValue: {
    fontSize: 20,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    alignSelf: 'flex-start',
  },
  systemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
  },
  systemLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
  systemHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: space[4],
  },
  pushStatus: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    gap: space[1],
  },
  pushStatusHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
  },
  pushStatusText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  pushDetail: {
    fontSize: 12,
    lineHeight: 16,
    paddingLeft: space[6],
  },
  pushActions: {
    flexDirection: 'row',
    gap: space[2],
    padding: space[3],
  },
  pushBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    borderRadius: radius.lg,
    paddingHorizontal: space[2],
  },
  pushBtnDisabled: {
    opacity: 0.5,
  },
  pushBtnLabel: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
  },
  channelCheck: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  channelCheckLabel: {
    fontSize: 13,
    fontWeight: fontWeight.medium,
  },
  sheet: {
    paddingHorizontal: space[4],
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingBottom: space[2],
  },
  pickerColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    height: 200,
  },
  pickerColumn: {
    flex: 1,
    maxWidth: 120,
  },
  pickerColumnContent: {
    paddingVertical: space[2],
  },
  pickerColon: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
  },
  pickerItem: {
    height: PICKER_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pickerItemText: {
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  doneBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    marginTop: space[3],
  },
  doneLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
  },
});
