import {
  insertMention,
  mentionQueryAt,
  serializeComment,
  type MentionCandidate,
} from '@devotion/shared';
import { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputSelectionChangeEvent,
} from 'react-native';

import { keptMentions, mentionSuggestions } from '@/components/collab/collab-model';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { haptics } from '@/lib/haptics';
import { useThemeColors } from '@/theme/theme-provider';
import { MIN_TOUCH_TARGET, radius, text } from '@/theme/tokens';

/** Telefon prikazuje manje predloga od weba: iznad tastature mora da ostane mesta za listu. */
const PHONE_SUGGESTIONS = 4;
const COMMENT_INPUT_MAX = 4000;

export type MentionMember = MentionCandidate & { avatarUrl?: string | null };

/**
 * Polje za komentar sa @pominjanjem (K07 §6.1). `@` otvara listu članova IZNAD
 * polja (redovi 44 pt, izbor dodirom); izabrano postaje „@Ime " u tekstu, a pri
 * slanju `serializeComment` šalje samo pominjanja koja i dalje stoje u tekstu.
 * Isto polje služi za izmenu (`initialDraft` + „Sačuvaj" / „Otkaži").
 *
 * Tekst ostaje u polju dok slanje ne uspe (`onSubmit` vraća `true`) — greška
 * slanja ga ne briše. Roditelj stavlja polje na dno sheet-a sa `avoidKeyboard`.
 */
export function CommentComposer({
  members,
  selfProfileId,
  initialDraft,
  submitLabel = 'Pošalji',
  placeholder = 'Napiši komentar…  @ za pominjanje',
  busy,
  error,
  onSubmit,
  onCancel,
  onChangeText,
}: {
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  initialDraft?: { text: string; mentions: MentionCandidate[] };
  submitLabel?: string;
  placeholder?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: { content: string; mentionProfileIds: string[] }) => Promise<boolean>;
  onCancel?: () => void;
  /** Javlja unos (npr. da se očisti prikazana greška). */
  onChangeText?: () => void;
}) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState(initialDraft?.text ?? '');
  const valueRef = useRef(value);
  valueRef.current = value;
  const [picked, setPicked] = useState<MentionCandidate[]>(initialDraft?.mentions ?? []);
  const [selection, setSelection] = useState({ start: value.length, end: value.length });
  // Posle izbora člana kursor se postavlja iza ubačenog imena; kontrolisan `selection`
  // važi samo do sledećeg događaja selekcije (inače Android ume da vrati kursor).
  const [forced, setForced] = useState<{ start: number; end: number } | null>(null);

  const open = mentionQueryAt(value, selection.end);
  const suggestions =
    open === null
      ? []
      : mentionSuggestions(members, open.query, selfProfileId).slice(0, PHONE_SUGGESTIONS);

  const pick = (member: MentionMember) => {
    haptics.select();
    const next = insertMention(value, selection.end, member);
    setValue(next.text);
    setPicked((current) =>
      current.some((item) => item.profileId === member.profileId)
        ? current
        : [...current, { profileId: member.profileId, displayName: member.displayName }],
    );
    // Kursor iza ubačenog imena: prvo stanje, pa kontrolisan `selection` tek posle commit-a teksta
    // (Android ume da primeni selekciju pre novog teksta i stegne je na staru dužinu).
    setSelection({ start: next.caret, end: next.caret });
    setTimeout(() => setForced({ start: next.caret, end: next.caret }), 0);
    inputRef.current?.focus();
  };

  const canSend = value.trim() !== '' && !busy;
  const send = async () => {
    if (!canSend) return;
    const { content, mentionProfileIds } = serializeComment(value, keptMentions(value, picked));
    if (content === '') return;
    const sent = value;
    const ok = await onSubmit({ content, mentionProfileIds });
    if (ok && initialDraft === undefined) {
      // Ako je korisnik kucao dok je slanje trajalo, polje se ne dira (nov tekst se ne sme izgubiti).
      if (valueRef.current === sent) {
        setValue('');
        setPicked([]);
        setSelection({ start: 0, end: 0 });
      }
    }
  };

  const onSelectionChange = (event: TextInputSelectionChangeEvent) => {
    setSelection(event.nativeEvent.selection);
    setForced(null);
  };

  return (
    <View style={styles.wrap}>
      {suggestions.length > 0 ? (
        <View
          accessibilityRole="list"
          accessibilityLabel="Članovi za pominjanje"
          style={[styles.suggestions, { backgroundColor: colors.popover, borderColor: colors.border }]}>
          {suggestions.map((member) => (
            <Pressable
              key={member.profileId}
              accessibilityRole="button"
              accessibilityLabel={`Pomeni ${member.displayName}`}
              onPress={() => pick(member)}
              style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.muted }]}>
              <Avatar name={member.displayName} uri={member.avatarUrl ?? null} size={24} />
              <Text numberOfLines={1} style={[styles.suggestionText, { color: colors.foreground }]}>
                {member.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error === null ? null : (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.destructive }]}>
          {error}
        </Text>
      )}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => {
          setForced(null);
          setValue(next);
          onChangeText?.();
        }}
        onSelectionChange={onSelectionChange}
        selection={forced ?? undefined}
        multiline
        maxLength={COMMENT_INPUT_MAX}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        accessibilityLabel={initialDraft === undefined ? 'Napiši komentar' : 'Izmeni komentar'}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background },
        ]}
      />

      <View style={styles.actions}>
        {onCancel === undefined ? null : (
          <Button label="Otkaži" variant="ghost" onPress={onCancel} disabled={busy} style={styles.flex} />
        )}
        <Button
          label={submitLabel}
          onPress={() => void send()}
          loading={busy}
          disabled={!canSend}
          style={onCancel === undefined ? undefined : styles.flex}
          fullWidth={onCancel === undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingTop: 8,
  },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestion: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  suggestionText: {
    ...text.body,
    flex: 1,
  },
  error: {
    ...text.body,
  },
  input: {
    ...text.body,
    minHeight: MIN_TOUCH_TARGET,
    maxHeight: 132,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
});
