import type { StartupMini } from '@devotion/shared';
import { ArrowRightLeft, ChevronLeft, Lock, RefreshCw, SearchX, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text } from '@/theme/tokens';

import { ChipGroup, ChoiceChip } from './choice-chips';
import { StartupChip } from './startup-chip';

/** Najviše znakova u naslovu (server `cleanRequiredText(…, 200)`). */
export const PANEL_TITLE_MAX = 200;
/** Najviše znakova beleške ličnog zadatka (server `PERSONAL_TASK_NOTES_MAX`). */
export const PANEL_NOTES_MAX = 5_000;
/** Najviše znakova instrukcija (server `MAX_TASK_INSTRUCTIONS_LENGTH`). */
export const PANEL_INSTRUCTIONS_MAX = 20_000;
/** Brojač znakova se pojavljuje blizu granice. */
export const COUNTER_BEFORE_MAX = 500;

/** Zaglavlje sub-prikaza panela (izbor statusa, roka…): „Nazad" + naslov. */
export function SubViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useThemeColors();
  // Čip koji je otvorio podprikaz nestaje: čitač ekrana dobija naslov novog prikaza.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  return (
    <View style={styles.subHeader}>
      <IconButton
        accessibilityLabel="Nazad"
        onPress={() => {
          haptics.select();
          onBack();
        }}>
        <ChevronLeft size={22} color={colors.foreground} />
      </IconButton>
      <Text accessibilityRole="header" style={[styles.subTitle, { color: colors.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

/** „{startup} · {oblast}" / „Lično" sa čipom startupa. */
export function PanelPlace({
  startup,
  areaLabel,
}: {
  startup: Pick<StartupMini, 'name' | 'logoUrl'> | null;
  areaLabel: string | null;
}) {
  const colors = useThemeColors();
  const place = [startup === null ? 'Lično' : startup.name, areaLabel].filter(Boolean).join(' · ');
  return (
    <View style={styles.place}>
      <StartupChip startup={startup} size="sm" />
      <Text numberOfLines={1} style={[styles.placeText, { color: colors.mutedForeground }]}>
        {place}
      </Text>
    </View>
  );
}

/**
 * Naslov panela: uređiv (kreator / lični) je polje koje čuva na kraj unosa
 * (blur ili „Gotovo"); prazno ili predugo vraća staru vrednost. Ostalima je
 * običan tekst (par web `PanelTitle`).
 */
export function TitleField({
  value,
  editable,
  onCommit,
}: {
  value: string;
  editable: boolean;
  onCommit?: (title: string) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // Kad se naslov promeni spolja (drugi uređaj), a ne uređuje se — prati ga.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!editing) setDraft(value);
  }

  // Hook-ovi idu PRE ranog return-a (dozvola `editable` može da se promeni u živom podatku).
  // Zatvaranje panela (pozadina, prevlačenje, Android „nazad“) ne garantuje
  // `onBlur`: nacrt koji je još u polju se čuva pri demontiranju.
  const latest = useRef({ draft, value, editing, onCommit, sent: null as string | null });
  latest.current = { ...latest.current, draft, value, editing, onCommit };
  useEffect(
    () => () => {
      const { draft: pending, value: saved, editing: wasEditing, onCommit: save, sent } = latest.current;
      const next = pending.trim();
      if (wasEditing && next && next.length <= PANEL_TITLE_MAX && next !== saved && next !== sent) save?.(next);
    },
    [],
  );

  if (!editable || !onCommit) {
    return (
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
        {value}
      </Text>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (!next || next.length > PANEL_TITLE_MAX) {
      setDraft(value);
      return;
    }
    if (next !== value) {
      // Isti naslov se ne šalje dvaput (blur pa demontiranje u istom batch-u).
      latest.current.sent = next;
      onCommit(next);
    }
    setDraft(next);
  };

  return (
    <TextInput
      value={draft}
      multiline
      blurOnSubmit
      returnKeyType="done"
      maxLength={PANEL_TITLE_MAX}
      accessibilityLabel="Naslov zadatka"
      selectionColor={colors.primary}
      onFocus={() => setEditing(true)}
      onChangeText={(next) => setDraft(next.replace(/\n/g, ' '))}
      onBlur={() => {
        setEditing(false);
        commit();
      }}
      style={[styles.title, styles.titleInput, { color: colors.foreground }]}
    />
  );
}

/** Overline sekcije panela sa opcionom bravom (razlog je tekst, ne samo ikonica). */
export function PanelSection({
  title,
  lockedReason,
  aside,
  children,
}: {
  title: string;
  lockedReason?: string | null;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text
            accessibilityRole="header"
            style={[styles.overline, { color: colors.foreground }]}>
            {title}
          </Text>
          {lockedReason ? <Lock size={13} color={colors.mutedForeground} /> : null}
        </View>
        {aside}
      </View>
      {lockedReason ? (
        <Text style={[styles.reason, { color: colors.mutedForeground }]}>{lockedReason}</Text>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Višelinijsko polje koje čuva na blur (beleška ličnog zadatka, instrukcije
 * zadatka u startupu); par web `NotesSection` / `InstructionsSection`.
 * Neuređiv je običan tekst ili „prazno" poruka. Brojač se vidi blizu granice.
 */
export function TextBlockField({
  title,
  value,
  editable,
  lockedReason,
  max,
  placeholder,
  emptyText,
  accessibilityLabel,
  onFocusField,
  onSave,
}: {
  title: string;
  value: string | null;
  editable: boolean;
  lockedReason?: string | null;
  max: number;
  placeholder: string;
  emptyText: string;
  accessibilityLabel: string;
  /** Fokus u polju (panel doskrola do njega iznad tastature). */
  onFocusField?: () => void;
  onSave: (value: string | null) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setDraft(value ?? '');
  }
  const near = editable && draft.length >= max - COUNTER_BEFORE_MAX;
  // Nacrt se čuva i pri demontiranju (zatvaranje panela ne garantuje `onBlur`).
  const latest = useRef({ draft, value, focused, onSave });
  latest.current = { draft, value, focused, onSave };
  useEffect(
    () => () => {
      const { draft: pending, value: saved, focused: wasFocused, onSave: save } = latest.current;
      const next = pending.trim() ? pending : null;
      if (wasFocused && (next ?? null) !== (saved ?? null)) save(next);
    },
    [],
  );

  return (
    <PanelSection
      title={title}
      lockedReason={lockedReason}
      aside={
        near ? (
          <Text style={[styles.counter, { color: colors.mutedForeground }]}>
            {draft.length}/{max}
          </Text>
        ) : null
      }>
      {editable ? (
        <TextInput
          value={draft}
          multiline
          maxLength={max}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={accessibilityLabel}
          selectionColor={colors.primary}
          textAlignVertical="top"
          onFocus={() => {
            setFocused(true);
            onFocusField?.();
          }}
          onChangeText={setDraft}
          onBlur={() => {
            setFocused(false);
            const next = draft.trim() ? draft : null;
            if ((next ?? null) !== (value ?? null)) onSave(next);
          }}
          style={[
            styles.textBlock,
            { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.input },
          ]}
        />
      ) : value ? (
        <Text style={[styles.textRead, { color: colors.foreground, backgroundColor: colors.muted }]}>{value}</Text>
      ) : (
        <Text style={[styles.reason, { color: colors.mutedForeground }]}>{emptyText}</Text>
      )}
    </PanelSection>
  );
}

/** Učitavanje panela: naslov, čipovi i redovi (oblik pravog panela). */
export function PanelLoading({ title }: { title?: string }) {
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={title ? `Učitavanje zadatka: ${title}` : 'Učitavanje zadatka'}
      style={styles.loading}>
      <Skeleton width="45%" height={14} />
      <Skeleton width="80%" height={24} />
      <View style={styles.skeletonChips}>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} width={112} height={MIN_TOUCH_TARGET} borderRadius={radius.pill} />
        ))}
      </View>
      <Skeleton width="30%" height={13} />
      <Skeleton width="100%" height={44} borderRadius={radius.card} />
      <Skeleton width="100%" height={44} borderRadius={radius.card} />
    </View>
  );
}

/** Zadatak je obrisan, arhiviran ili više nemaš pristup. */
export function PanelGone({ onClose }: { onClose: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={styles.state}>
      <SearchX size={36} color={colors.mutedForeground} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Zadatak više ne postoji</Text>
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        Možda je obrisan ili više nemaš pristup.
      </Text>
      <Button label="Zatvori" variant="secondary" onPress={onClose} style={styles.stateButton} />
    </View>
  );
}

/**
 * Greška panela. U produkciji Convex skriva poruku obične greške servera, pa se
 * obrisan zadatak ne razlikuje od prekida veze — tekst zato pokriva oba slučaja.
 */
export function PanelError({ retry, onClose }: { retry: () => void; onClose: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={styles.state}>
      <TriangleAlert size={36} color={colors.destructive} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Zadatak se ne može učitati</Text>
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        Proveri vezu i pokušaj ponovo. Ako je zadatak obrisan ili više nemaš pristup, zatvori panel.
      </Text>
      <View style={styles.stateActions}>
        <Button
          label="Pokušaj ponovo"
          variant="secondary"
          icon={<RefreshCw size={16} color={colors.foreground} />}
          onPress={retry}
        />
        <Button label="Zatvori" variant="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

export type MoveTargetStartup = StartupMini & {
  areas: ReadonlyArray<{ _id: string; label: string }>;
};

/**
 * „Prebaci u startup" (D12): startup → oblast → potvrda. Bez „Poništi":
 * zadatak postaje stranica u startupu i dodeljuje se tebi. Greška servera ostaje
 * u koraku (ispod potvrde), kao na webu.
 */
export function MoveToStartupStep({
  title,
  startups,
  onCancel,
  onMove,
}: {
  title: string;
  startups: ReadonlyArray<MoveTargetStartup>;
  onCancel: () => void;
  onMove: (startupId: string, areaId: string) => Promise<void>;
}) {
  const colors = useThemeColors();
  const [startupId, setStartupId] = useState<string | null>(null);
  const startup = startups.find((item) => item._id === startupId) ?? null;
  const [areaId, setAreaId] = useState<string | null>(null);
  const area = startup?.areas.find((item) => item._id === areaId) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!startup || !area || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMove(startup._id, area._id);
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error && cause.message ? cause.message : 'Zadatak nije prebačen. Pokušaj ponovo.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.move}>
      <SubViewHeader title="Prebaci u startup" onBack={onCancel} />
      <ChipGroup label="Izaberi startup" scroll>
        {startups.map((item) => (
          <ChoiceChip
            key={item._id}
            label={item.name}
            selected={startupId === item._id}
            leading={<StartupChip startup={item} size="sm" />}
            onPress={() => {
              setStartupId(item._id);
              setAreaId(item.areas[0]?._id ?? null);
              setError(null);
            }}
          />
        ))}
      </ChipGroup>
      {startup ? (
        startup.areas.length === 0 ? (
          <Text accessibilityRole="alert" style={[styles.notice, { color: colors.mutedForeground, backgroundColor: colors.muted }]}>
            Ovaj startup još nema oblasti — dodaj ih u startupu.
          </Text>
        ) : (
          <ChipGroup label="Izaberi oblast">
            {startup.areas.map((item) => (
              <ChoiceChip
                key={item._id}
                label={item.label}
                selected={areaId === item._id}
                onPress={() => {
                  setAreaId(item._id);
                  setError(null);
                }}
              />
            ))}
          </ChipGroup>
        )
      ) : null}
      {startup && area ? (
        <Text style={[styles.stateText, styles.leftText, { color: colors.mutedForeground }]}>
          Zadatak „{title}“ prelazi u {startup.name} · {area.label} i dodeljuje se tebi. Ovo ne može da se poništi.
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.moveActions}>
        <Button label="Otkaži" variant="ghost" onPress={onCancel} disabled={busy} style={styles.flex} />
        <Button
          label="Prebaci"
          icon={<ArrowRightLeft size={16} color={colors.primaryForeground} />}
          onPress={() => void submit()}
          disabled={!startup || !area}
          loading={busy}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Strelica optički na ivici sadržaja (dodirna meta ostaje 44 pt).
    marginLeft: -10,
  },
  subTitle: {
    ...text.title,
    flex: 1,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeText: {
    ...text.meta,
    flexShrink: 1,
  },
  title: {
    ...text.title,
  },
  titleInput: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 4,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overline: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  reason: {
    ...text.body,
  },
  counter: {
    ...text.meta,
    fontVariant: ['tabular-nums'],
  },
  textBlock: {
    ...text.body,
    minHeight: 112,
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textRead: {
    ...text.body,
    padding: space[3],
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  loading: {
    gap: space[3],
  },
  skeletonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  state: {
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[6],
  },
  stateTitle: {
    ...text.title,
    textAlign: 'center',
  },
  stateText: {
    ...text.body,
    textAlign: 'center',
  },
  leftText: {
    textAlign: 'left',
  },
  stateButton: {
    marginTop: space[2],
  },
  stateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space[2],
    marginTop: space[2],
  },
  move: {
    gap: space[3],
  },
  moveActions: {
    flexDirection: 'row',
    gap: space[2],
  },
  flex: {
    flex: 1,
  },
  notice: {
    ...text.body,
    padding: space[3],
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  error: {
    ...text.body,
  },
});
