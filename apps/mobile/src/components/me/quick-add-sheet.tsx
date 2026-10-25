import {
  cleanQuickAddTitle,
  defaultAddToMyDay,
  dueShortcutValue,
  formatDateShort,
  matchDueShortcut,
  NO_AREA_REASON,
  QUICK_ADD_TITLE_MAX,
  resolveArea,
  resolveDestination,
  type DueShortcut,
  type QuickAddDestination,
  type QuickAddDraft,
  type QuickAddStartup,
  type StoredDestination,
} from '@devotion/shared';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, text } from '@/theme/tokens';

import { ChipGroup, ChoiceChip, DueChoiceChips, InlineDatePicker } from './choice-chips';
import { StartupChip } from './startup-chip';

export type QuickAddStartupOption = QuickAddStartup & { logoUrl: string | null };

export type QuickAddSheetProps = {
  visible: boolean;
  onClose: () => void;
  now: number;
  startups: ReadonlyArray<QuickAddStartupOption>;
  /** Startup (i oblast) iz koga je brzi unos otvoren — pobeđuje zapamćen izbor (K18). */
  preset?: { startupId: string; areaId?: string | null } | null;
  /** Zapamćeno odredište (čita se pri otvaranju) i oblast po startupu. */
  readStored?: () => StoredDestination | null;
  rememberedArea?: (startupId: string) => string | null;
  /** Napravi zadatak; greška (poruka servera) se prikazuje ispod polja. */
  onSubmit: (draft: QuickAddDraft) => Promise<void>;
};

/**
 * Brzi unos (P8, plan K07 §2 i trenutak 4) — par web `QuickAddDialog`: naslov,
 * odredište Lično ili startup + oblast, čipovi roka iz shared datuma
 * („Datum…" otvara kalendar) i „Dodaj i u Moj dan" (prati rok dok ga ne
 * promeniš). Sheet ulazi odozdo (`Sheet`, spring) i podiže se iznad tastature;
 * „Gotovo" na tastaturi dodaje i zatvara. Pravila odredišta, roka i poziva su
 * iz `@devotion/shared` (`quick-add.ts`), isto kao na webu.
 */
export function QuickAddSheet({ visible, onClose, ...props }: QuickAddSheetProps) {
  // Svako otvaranje počinje od praznog nacrta (nova sesija forme).
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((value) => value + 1);
  }
  return <QuickAddForm key={session} visible={visible} onClose={onClose} {...props} />;
}

function QuickAddForm({
  visible,
  onClose,
  now,
  startups,
  preset,
  readStored,
  rememberedArea,
  onSubmit,
}: QuickAddSheetProps) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState<QuickAddDestination>(() =>
    resolveDestination(readStored?.() ?? null, startups, { preset, rememberedArea }),
  );
  // Izbor čipa, ne samo datum: petkom/subotom/nedeljom dve prečice mogu biti isti dan.
  const [dueChoice, setDueChoice] = useState<DueShortcut | 'date' | null>(null);
  const [customDue, setCustomDue] = useState<number | null>(null);
  const [addOverride, setAddOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  // Tastatura se sama otvara samo pri otvaranju sheet-a, ne i po povratku iz kalendara.
  const [focusOnMount, setFocusOnMount] = useState(true);
  // Odredište je dirao korisnik (ili ga je uneo izbor) — tada ga kasno stigla
  // lista startupa ne menja. Inače se zapamćen startup primeni čim lista stigne.
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [startupCount, setStartupCount] = useState(startups.length);
  if (startups.length !== startupCount) {
    setStartupCount(startups.length);
    if (!destinationTouched) {
      setDestination(resolveDestination(readStored?.() ?? null, startups, { preset, rememberedArea }));
    }
  }

  const dueDate =
    dueChoice === null ? null : dueChoice === 'date' ? customDue : dueShortcutValue(dueChoice, now);
  const addToMyDay = addOverride ?? defaultAddToMyDay(dueDate, now);
  const titleCheck = cleanQuickAddTitle(title);
  const selectedStartup =
    destination.kind === 'startup' ? startups.find((startup) => startup._id === destination.startupId) : undefined;
  const missingArea = destination.kind === 'startup' && destination.areaId === null;
  const canSubmit = titleCheck.ok && !missingArea && !busy;
  const shownError = error ?? (titleCheck.ok ? null : titleCheck.reason);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title, destination, dueDate, addToMyDay });
      onClose();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error && cause.message ? cause.message : 'Zadatak nije dodat. Pokušaj ponovo.');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const pickStartup = (startupId: string | null) => {
    setError(null);
    setDestinationTouched(true);
    if (startupId === null) {
      setDestination({ kind: 'personal' });
      return;
    }
    const startup = startups.find((item) => item._id === startupId);
    if (!startup) return;
    setDestination({
      kind: 'startup',
      startupId,
      areaId: resolveArea(startup, rememberedArea?.(startupId) ?? null),
    });
  };

  return (
    <Sheet
      visible={visible}
      // U kalendaru „nazad" (Android), escape (VoiceOver) i dodir pozadine vraćaju
      // na formu — nacrt se ne odbacuje.
      onClose={pickingDate ? () => setPickingDate(false) : onClose}
      avoidKeyboard
      maxHeight="90%">
      {pickingDate ? (
        // Kalendar U ovom sheet-u: iOS ne prikazuje drugi `Modal` dok je prvi
        // otvoren. Nacrt (naslov, odredište) ostaje u stanju forme.
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <InlineDatePicker
            value={dueChoice === 'date' ? customDue : dueDate}
            onBack={() => setPickingDate(false)}
            onSelect={(value) => {
              setPickingDate(false);
              const shortcut = matchDueShortcut(value, now);
              setDueChoice(shortcut ?? 'date');
              setCustomDue(shortcut === null ? value : null);
            }}
          />
        </ScrollView>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={[styles.overline, { color: colors.mutedForeground }]}>Brzi unos</Text>
              <TextInput
                ref={inputRef}
                value={title}
                onChangeText={(next) => {
                  setTitle(next);
                  setError(null);
                }}
                placeholder="Šta treba uraditi?"
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel="Naslov zadatka"
                autoFocus={focusOnMount}
                maxLength={QUICK_ADD_TITLE_MAX + 1}
                returnKeyType="done"
                onSubmitEditing={() => void submit()}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.surface,
                    borderColor: shownError ? colors.danger : colors.input,
                  },
                ]}
              />
              {shownError ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[styles.error, { color: colors.danger }]}>
                  {shownError}
                </Text>
              ) : null}
            </View>

            <ChipGroup label="Gde" scroll>
              <ChoiceChip
                label="Lično"
                leading={<StartupChip startup={null} size="sm" />}
                selected={destination.kind === 'personal'}
                onPress={() => pickStartup(null)}
              />
              {startups.map((startup) => (
                <ChoiceChip
                  key={startup._id}
                  label={startup.name}
                  leading={<StartupChip startup={startup} size="sm" />}
                  selected={destination.kind === 'startup' && destination.startupId === startup._id}
                  onPress={() => pickStartup(startup._id)}
                />
              ))}
            </ChipGroup>

            {selectedStartup ? (
              selectedStartup.areas.length > 0 ? (
                <ChipGroup label="Oblast" scroll>
                  {selectedStartup.areas.map((area) => (
                    <ChoiceChip
                      key={area._id}
                      label={area.label}
                      selected={destination.kind === 'startup' && destination.areaId === area._id}
                      onPress={() => {
                        setDestinationTouched(true);
                        setDestination({ kind: 'startup', startupId: selectedStartup._id, areaId: area._id });
                      }}
                    />
                  ))}
                </ChipGroup>
              ) : (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.notice, { color: colors.mutedForeground, backgroundColor: colors.muted }]}>
                  {NO_AREA_REASON}
                </Text>
              )
            ) : null}

            <DueChoiceChips
              now={now}
              selected={dueChoice === null ? 'none' : dueChoice}
              dateLabel={customDue === null ? null : formatDateShort(customDue)}
              onShortcut={(shortcut) => setDueChoice(shortcut)}
              onPickDate={() => {
                Keyboard.dismiss();
                setFocusOnMount(false);
                setPickingDate(true);
              }}
              onNone={() => setDueChoice(null)}
            />

            <ToggleRow
              label="Dodaj i u Moj dan"
              checked={addToMyDay}
              onChange={(next) => setAddOverride(next)}
            />
          </ScrollView>

          {/* Dugmad izvan skrola: uz tastaturu na malom ekranu ostaju vidljiva. */}
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Button label="Otkaži" variant="ghost" size="md" onPress={onClose} style={styles.actionButton} />
            <Button
              label="Dodaj"
              size="md"
              loading={busy}
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={styles.actionButton}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

/**
 * „Dodaj i u Moj dan": ceo red je prekidač (uloga `switch` sa stanjem), a
 * unutrašnji `Switch` je samo slika — dodir bilo gde u redu ga menja.
 */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const colors = useThemeColors();
  const flip = (next: boolean) => {
    haptics.select();
    onChange(next);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => flip(!checked)}
      style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: colors.muted }]}>
      <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch
        value={checked}
        onValueChange={flip}
        trackColor={{ true: colors.primary, false: colors.muted }}
        thumbColor={colors.surface}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  overline: {
    ...text.meta,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    ...text.body,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  error: {
    ...text.body,
  },
  notice: {
    ...text.body,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  toggleLabel: {
    ...text.body,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    minWidth: 96,
  },
});
