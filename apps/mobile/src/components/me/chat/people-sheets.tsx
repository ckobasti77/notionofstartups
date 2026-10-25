import {
  filterPeople,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  GROUP_OTHER_MEMBERS_MAX,
  groupDraftProblem,
  groupMembersLabel,
  sharedStartupsLabel,
} from '@devotion/shared';
import { Check, Lock, LogOut, RefreshCw } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row } from '@/components/ui/row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList, SkeletonRow } from '@/components/ui/skeletons';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, radius, spacing, text } from '@/theme/tokens';

import { leaveGroupPrompt } from './hub-model';

/** Osoba iz `chat.listPeople` (samo ime, avatar i zajednički startupi — bez e-pošte). */
export type HubPersonModel = {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  sharedStartupNames: ReadonlyArray<string>;
};

export type PeopleState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; people: ReadonlyArray<HubPersonModel> };

const OWNER_ONLY = 'Podešavanja grupe menja samo njen vlasnik.';

// --- Delovi ----------------------------------------------------------------------

function SheetTitle({ title, description }: { title: string; description?: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {title}
      </Text>
      {description ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>{description}</Text>
      ) : null}
    </View>
  );
}

function PeopleLoading({ rows }: { rows: number }) {
  return (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel="Učitavanje ljudi">
      <SkeletonList
        count={rows}
        item={(index) => <SkeletonRow index={index} leading="circle" subtitle />}
      />
    </View>
  );
}

function PeopleError({ title, retry }: { title: string; retry: () => void }) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="alert" style={[styles.errorBox, { borderColor: colors.border }]}>
      <Text style={[styles.errorTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        Proveri vezu pa pokušaj ponovo.
      </Text>
      <Button
        label="Pokušaj ponovo"
        variant="secondary"
        icon={<RefreshCw size={16} color={colors.secondaryForeground} />}
        onPress={retry}
      />
    </View>
  );
}

function Hint({ children }: { children: string }) {
  const colors = useThemeColors();
  return <Text style={[styles.hint, { color: colors.mutedForeground }]}>{children}</Text>;
}

/** Polje naziva grupe (≤ 120 znakova, isto kao server). */
function GroupNameField({
  value,
  onChange,
  locked = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  locked?: boolean;
  autoFocus?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>Naziv grupe</Text>
      <Input
        value={value}
        onChangeText={(next) => {
          if (!locked) onChange(next);
        }}
        editable={!locked}
        autoFocus={autoFocus}
        maxLength={GROUP_NAME_MAX}
        placeholder="npr. Vikend plan"
        returnKeyType="done"
        accessibilityLabel="Naziv grupe"
        accessibilityHint={locked ? OWNER_ONLY : undefined}
        accessibilityState={{ disabled: locked }}
        style={locked ? { color: colors.mutedForeground } : undefined}
      />
    </View>
  );
}

/** Izbor članova kvačicama (ili spisak bez kvačica kad nisi vlasnik). */
function PeoplePicker({
  people,
  selected,
  onToggle,
  locked = false,
  disabled = false,
}: {
  people: ReadonlyArray<HubPersonModel>;
  selected: ReadonlySet<string>;
  onToggle: (personId: string) => void;
  locked?: boolean;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const visible = filterPeople(people, query);
  const full = selected.size >= GROUP_OTHER_MEMBERS_MAX;

  return (
    <View style={styles.picker}>
      {locked ? (
        <View style={styles.lockedRow}>
          <Lock size={14} color={colors.mutedForeground} />
          <Text style={[styles.meta, styles.flex, { color: colors.mutedForeground }]}>
            {OWNER_ONLY}
          </Text>
        </View>
      ) : (
        <SearchField value={query} onChange={setQuery} placeholder="Pretraži ljude…" />
      )}
      {!locked && full ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.meta, { color: colors.mutedForeground }]}>
          Grupa je puna ({GROUP_MEMBERS_MAX} članova sa tobom). Ukloni nekog da dodaš drugog.
        </Text>
      ) : null}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {people.length === 0 ? (
          <Hint>U timu još nema drugih ljudi.</Hint>
        ) : visible.length === 0 ? (
          <Hint>Nema rezultata.</Hint>
        ) : (
          visible.map((person) => {
            const checked = selected.has(person._id);
            const blocked = !locked && !checked && full;
            const subtitle = sharedStartupsLabel(person.sharedStartupNames);
            return (
              <Row
                key={person._id}
                icon={<Avatar name={person.displayName} uri={person.avatarUrl} size={36} />}
                title={person.displayName}
                subtitle={subtitle}
                value={
                  !locked && checked ? <Check size={20} color={colors.primaryText} /> : undefined
                }
                showChevron={false}
                // Zaključan spisak (nisi vlasnik) je samo za čitanje, ne prigušen:
                // red bez `onPress` je statičan, a čitljiv.
                disabled={!locked && (blocked || disabled)}
                onPress={
                  locked
                    ? undefined
                    : () => {
                        haptics.select();
                        onToggle(person._id);
                      }
                }
                accessibilityLabel={
                  locked
                    ? `${person.displayName}. ${subtitle}`
                    : `${person.displayName}, ${checked ? 'izabran' : 'nije izabran'}. ${subtitle}`
                }
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function FormError({ message }: { message: string | null }) {
  const colors = useThemeColors();
  if (message === null) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.error, { color: colors.destructive }]}>
      {message}
    </Text>
  );
}

function toggled(current: ReadonlySet<string>, personId: string): Set<string> {
  const next = new Set(current);
  if (next.has(personId)) next.delete(personId);
  else next.add(personId);
  return next;
}

// --- Nova poruka -------------------------------------------------------------------

/** „Nova poruka" (plan K07 §2): izbor osobe iz tima → `chat.openPersonalDm`. */
export function NewDmSheet({
  open,
  onClose,
  people,
  onPick,
  pendingId,
}: {
  open: boolean;
  onClose: () => void;
  people: PeopleState;
  onPick: (personId: string) => void;
  /** Osoba čiji se razgovor upravo otvara (ostali redovi čekaju). */
  pendingId: string | null;
}) {
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const visible = people.status === 'ready' ? filterPeople(people.people, query) : [];
  // Upit se briše pri svakom otvaranju (i posle izbora osobe, kad sheet zatvara
  // roditelj, a ne korisnik) — ne tokom izlazne animacije.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery('');
  }

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard style={styles.sheet}>
      <SheetTitle title="Nova poruka" description="Izaberi osobu iz tima." />
      {people.status === 'loading' ? (
        <PeopleLoading rows={5} />
      ) : people.status === 'error' ? (
        <PeopleError title="Ljudi se ne mogu učitati" retry={people.retry} />
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Pretraži ljude…" />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {people.people.length === 0 ? (
              <Hint>U timu još nema drugih ljudi.</Hint>
            ) : visible.length === 0 ? (
              <Hint>Nema rezultata.</Hint>
            ) : (
              visible.map((person) => {
                const subtitle = sharedStartupsLabel(person.sharedStartupNames);
                const pending = pendingId === person._id;
                return (
                  <Row
                    key={person._id}
                    icon={<Avatar name={person.displayName} uri={person.avatarUrl} size={36} />}
                    title={person.displayName}
                    subtitle={subtitle}
                    value={pending ? <ActivityIndicator color={colors.primary} /> : undefined}
                    showChevron={false}
                    disabled={pendingId !== null && !pending}
                    onPress={() => {
                      if (pendingId !== null) return;
                      haptics.tap();
                      onPick(person._id);
                    }}
                    accessibilityLabel={`${person.displayName}. ${subtitle}`}
                    accessibilityHint="Otvara lični razgovor"
                  />
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

// --- Nova grupa --------------------------------------------------------------------

/** „Nova grupa" (plan K07 §2): naziv + članovi → `chat.createPersonalGroup`. */
export function NewGroupSheet({
  open,
  onClose,
  people,
  onCreate,
  initialName = '',
  initialSelected = [],
}: {
  open: boolean;
  onClose: () => void;
  people: PeopleState;
  /** Pravi grupu; greška servera se vraća kao tekst (prikazuje se iznad dugmadi). */
  onCreate: (name: string, memberIds: string[]) => Promise<string | null>;
  /** Početno stanje (katalog). */
  initialName?: string;
  initialSelected?: ReadonlyArray<string>;
}) {
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const colors = useThemeColors();

  // Nacrt se briše pri sledećem otvaranju (ne tokom izlazne animacije).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialName);
      setSelected(new Set(initialSelected));
      setError(null);
    }
  }

  async function submit() {
    if (busy) return;
    const problem = groupDraftProblem({ name, otherCount: selected.size });
    if (problem) {
      haptics.warning();
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onCreate(name.trim(), [...selected]);
    setBusy(false);
    if (failure) {
      haptics.error();
      setError(failure);
    }
  }

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="90%" style={styles.sheet}>
      <SheetTitle
        title="Nova grupa"
        description="Lična grupa ne pripada nijednom startupu. Vide je samo njeni članovi."
      />
      <GroupNameField value={name} onChange={setName} />
      <Text style={[styles.label, { color: colors.foreground }]}>
        {groupMembersLabel(selected.size)}
      </Text>
      {people.status === 'loading' ? (
        <PeopleLoading rows={4} />
      ) : people.status === 'error' ? (
        <PeopleError title="Ljudi se ne mogu učitati" retry={people.retry} />
      ) : (
        <PeoplePicker
          people={people.people}
          selected={selected}
          disabled={busy}
          onToggle={(personId) => setSelected((current) => toggled(current, personId))}
        />
      )}
      <FormError message={error} />
      <View style={styles.actions}>
        <Button
          label="Otkaži"
          variant="ghost"
          disabled={busy}
          onPress={onClose}
          style={styles.flex}
        />
        <Button
          label="Napravi grupu"
          loading={busy}
          onPress={() => void submit()}
          style={styles.flex}
        />
      </View>
    </Sheet>
  );
}

// --- Podešavanja grupe -------------------------------------------------------------

export type GroupSettingsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      name: string;
      isOwner: boolean;
      /** Trenutni članovi BEZ mene (vlasnik ostaje uvek). */
      members: ReadonlyArray<HubPersonModel>;
      /** Ostali ljudi koje vlasnik može da doda. */
      people: ReadonlyArray<HubPersonModel>;
    };

/**
 * „Podešavanja grupe" (plan K07 §2): vlasnik menja ime i članove
 * (`chat.updatePersonalGroup`, „Poništi" u traci radi pozivalac); svi mogu da
 * napuste grupu (`chat.leavePersonalGroup`, uz potvrdu).
 */
export function GroupSettingsSheet({
  open,
  onClose,
  state,
  onSave,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  state: GroupSettingsState;
  /** Čuva ime i članove; vraća grešku servera kao tekst ili `null`. */
  onSave: (name: string, memberIds: string[]) => Promise<string | null>;
  /** Napušta grupu; vraća grešku servera kao tekst ili `null`. */
  onLeave: () => Promise<string | null>;
}) {
  const colors = useThemeColors();
  const ready = state.status === 'ready' ? state : null;
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftSelected, setDraftSelected] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'leave' | null>(null);

  // Nacrt kreće od stanja servera i živi dok se sheet ne zatvori.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraftName(null);
      setDraftSelected(null);
      setError(null);
    }
  }

  const name = draftName ?? ready?.name ?? '';
  const currentIds = useMemo(
    () => new Set(ready?.members.map((member) => member._id) ?? []),
    [ready],
  );
  const selected = draftSelected ?? currentIds;
  const candidates = useMemo(() => {
    if (!ready) return [];
    const seen = new Set(ready.members.map((member) => member._id));
    return [...ready.members, ...ready.people.filter((person) => !seen.has(person._id))];
  }, [ready]);
  const locked = ready !== null && !ready.isOwner;

  async function save() {
    if (!ready || locked || busy) return;
    // Bez izmene nema šta da se čuva (ni trake „Poništi" za praznu radnju).
    const unchanged =
      name.trim() === ready.name &&
      selected.size === currentIds.size &&
      [...selected].every((id) => currentIds.has(id));
    if (unchanged) {
      onClose();
      return;
    }
    const problem = groupDraftProblem({ name, otherCount: selected.size });
    if (problem) {
      haptics.warning();
      setError(problem);
      return;
    }
    setBusy('save');
    setError(null);
    const failure = await onSave(name.trim(), [...selected]);
    setBusy(null);
    if (failure) {
      haptics.error();
      setError(failure);
    } else {
      onClose();
    }
  }

  function confirmLeave() {
    if (!ready || busy) return;
    haptics.warning();
    const prompt = leaveGroupPrompt(ready.name);
    Alert.alert(prompt.title, prompt.message, [
      { text: 'Otkaži', style: 'cancel' },
      {
        text: 'Napusti grupu',
        style: 'destructive',
        onPress: async () => {
          setBusy('leave');
          setError(null);
          const failure = await onLeave();
          setBusy(null);
          if (failure) {
            haptics.error();
            setError(failure);
          } else {
            onClose();
          }
        },
      },
    ]);
  }

  return (
    <Sheet visible={open} onClose={onClose} avoidKeyboard maxHeight="90%" style={styles.sheet}>
      <SheetTitle title="Podešavanja grupe" description={ready ? ready.name : undefined} />
      {state.status === 'loading' ? (
        <PeopleLoading rows={4} />
      ) : state.status === 'error' ? (
        <PeopleError title="Podešavanja se ne mogu učitati" retry={state.retry} />
      ) : (
        <>
          <GroupNameField value={name} onChange={setDraftName} locked={locked} />
          <Text style={[styles.label, { color: colors.foreground }]}>
            {locked ? `Članovi (${state.members.length + 1})` : groupMembersLabel(selected.size)}
          </Text>
          <PeoplePicker
            people={locked ? state.members : candidates}
            selected={selected}
            locked={locked}
            disabled={busy !== null}
            onToggle={(personId) => setDraftSelected(toggled(selected, personId))}
          />
          <FormError message={error} />
          <View style={styles.actions}>
            <Button
              label="Napusti grupu"
              variant="ghost"
              disabled={busy !== null}
              loading={busy === 'leave'}
              icon={<LogOut size={18} color={colors.destructive} />}
              onPress={confirmLeave}
              style={styles.flex}
            />
            {locked ? (
              <Button label="Zatvori" variant="secondary" onPress={onClose} style={styles.flex} />
            ) : (
              <Button
                label="Sačuvaj"
                loading={busy === 'save'}
                disabled={busy !== null}
                onPress={() => void save()}
                style={styles.flex}
              />
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  heading: {
    fontSize: 18,
    fontWeight: fontWeight.semibold,
  },
  meta: {
    ...text.meta,
  },
  label: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  field: {
    gap: spacing.sm,
  },
  // Izbor se skuplja kad panel dostigne `maxHeight` (tastatura, mali ekran), da
  // red dugmadi ostane vidljiv i na malom ekranu; ispod 88 pt ne ide.
  picker: {
    gap: spacing.sm,
    flexShrink: 1,
    minHeight: 88,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    maxHeight: 300,
    flexShrink: 1,
  },
  hint: {
    ...text.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: radius.card,
  },
  errorTitle: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  error: {
    ...text.body,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  flex: {
    flex: 1,
  },
});
