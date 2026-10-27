import {
  CALENDAR_WEEKDAYS,
  datePickerChips,
  dayAriaLabel,
  dayKeyOf,
  dayKeyOfDue,
  dueFromDayKey,
  formatDateShort,
  formatMonthTitle,
  initialMonth,
  monthGrid,
  selectedDatePickerChip,
  shiftMonth,
  type MonthKey,
} from '@devotion/shared';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFadeUp } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import { SR_MONTHS_SHORT } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text } from '@/theme/tokens';

/**
 * Izbor proizvoljnog datuma — pandan `<input type="date">` sa weba, od K13 i
 * pandan web `DatePicker`-a (K11): mreža meseca, nazivi i izbor dana su iz
 * zajedničkog `@devotion/shared` (`calendar.ts`), pa su čipovi, srpski format
 * i vrednost (uvek LOKALNO PODNE izabranog dana, kao `fromDateInputValue`) isti
 * na obe platforme.
 *
 * Namerno je pisan u čistom React Native umesto preko native picker modula:
 * dodavanje `@react-native-community/datetimepicker` traži nov development build
 * na oba sistema, a ovde je potrebna jedna mreža dana. Ovako radi i u Expo Go i u
 * postojećem buildu, i izgleda isto na iOS-u i na Androidu.
 *
 * Bez `shortcuts` sheet radi kao i pre (pozivalac nosi svoje presete, a ovde je
 * samo „neki drugi dan" i „Bez roka"). Sa `shortcuts` sheet sam nudi čipove
 * Danas · Sutra · Vikend · Sledeće nedelje · Bez roka iz shared datuma.
 */
export function DatePickerSheet({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Izaberi rok',
  shortcuts = false,
  now,
}: {
  visible: boolean;
  /** Trenutno izabran datum (ms) ili `null`. */
  value: number | null;
  onSelect: (dueDate: number | null) => void;
  onClose: () => void;
  title?: string;
  /** Čipovi brzog izbora iz shared datuma; podrazumevano isključeni (postojeći pozivi). */
  shortcuts?: boolean;
  /** Sat za čipove i „danas" (podrazumevano trenutni). */
  now?: number;
}) {
  const colors = useThemeColors();

  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {title}
      </Text>

      {shortcuts ? <ShortcutChips value={value} now={now} onSelect={onSelect} /> : null}

      <MonthCalendar value={value} now={now} onSelect={onSelect} />

      <View style={styles.actions}>
        {shortcuts ? null : (
          <Button
            label="Bez roka"
            variant="ghost"
            onPress={() => {
              haptics.tap();
              onSelect(null);
            }}
            style={styles.flexBtn}
          />
        )}
        <Button label="Zatvori" variant="secondary" onPress={onClose} style={styles.flexBtn} />
      </View>
    </Sheet>
  );
}

/**
 * Čipovi birača (plan K07 §2): Danas · Sutra · Vikend · Sledeće nedelje · Bez
 * roka. Datum ispod oznake i vrednost su iz `datePickerChips` (lokalno podne);
 * izabran je prvi čip čiji je dan isti (petkom, subotom i nedeljom dve prečice
 * mogu biti isti dan).
 */
export function ShortcutChips({
  value,
  now,
  onSelect,
}: {
  value: number | null;
  now?: number;
  onSelect: (dueDate: number | null) => void;
}) {
  const colors = useThemeColors();
  const [anchor] = useState(() => now ?? Date.now());
  const selected = selectedDatePickerChip(value, anchor);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Brzi izbor roka" style={styles.chips}>
      {datePickerChips(anchor).map((chip) => {
        const active = selected === chip.id;
        const detail = chip.value === null ? null : formatDateShort(chip.value);
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={detail ? `${chip.label}, ${detail}` : chip.label}
            onPress={() => {
              haptics.select();
              onSelect(chip.value);
            }}
            style={({ pressed }) => [
              styles.chip,
              active
                ? { backgroundColor: colors.accent, borderColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.input },
              pressed && !active && { backgroundColor: colors.muted },
            ]}>
            <View>
              <Text
                numberOfLines={1}
                style={[styles.chipLabel, { color: active ? colors.accentForeground : colors.foreground }]}>
                {chip.label}
              </Text>
              {detail ? (
                <Text
                  numberOfLines={1}
                  style={[styles.chipDetail, { color: active ? colors.accentForeground : colors.mutedForeground }]}>
                  {detail}
                </Text>
              ) : null}
            </View>
            {/* Rezervisano mesto kvačice: izbor ne menja širinu čipa. */}
            <View style={active ? null : styles.checkHidden}>
              <Check size={16} color={colors.accentForeground} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Mreža meseca (navigacija + dani) bez sopstvenog sheet-a — K12 je izdvojio
 * telo `DatePickerSheet`-a da sheet koji je već otvoren (brzi unos, „Rok i
 * plan", radnje reda) prikaže kalendar U SEBI, umesto drugog `Modal`-a preko
 * sebe (iOS ne prikazuje drugi `Modal` dok je prvi otvoren). Izbor je lokalno
 * podne izabranog dana; mesec počinje od izabranog datuma (inače danas).
 * Mreža, nazivi i oznake dana su iz shared `calendar.ts` (K13).
 */
export function MonthCalendar({
  value,
  onSelect,
  now,
}: {
  value: number | null;
  onSelect: (dueDate: number) => void;
  /** Sat za „danas" (podrazumevano trenutni, uzet jednom pri montiranju). */
  now?: number;
}) {
  const colors = useThemeColors();
  const reduced = useReducedMotion();
  const [anchor] = useState(() => now ?? Date.now());
  const [month, setMonth] = useState<MonthKey>(() => initialMonth(value, anchor));
  // Na ekranima užim od ~340 dp sedam ćelija u sheet-u sa bočnim razmakom je uže
  // od 44 pt: kalendar tada izlazi u razmak sheet-a taman koliko treba (K20).
  const { width: windowWidth } = useWindowDimensions();
  const bleed = Math.min(
    space[3],
    Math.max(0, Math.ceil((7 * MIN_TOUCH_TARGET - (windowWidth - 2 * space[4])) / 2)),
  );

  const todayKey = dayKeyOf(anchor);
  const selectedKey = dayKeyOfDue(value);
  // Uvek 6 nedelja (visina ne skače pri promeni meseca), kao web; dani susednih
  // meseci su prigušeni i birljivi.
  const days = monthGrid(month, { todayKey, selectedKey }).flat();

  function moveMonth(delta: number) {
    haptics.select();
    const next = shiftMonth(month, delta);
    setMonth(next);
    // `accessibilityLiveRegion` važi samo na Androidu: na iOS-u se novi mesec najavljuje izričito.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(formatMonthTitle(next));
  }

  return (
    <View style={[styles.calendar, bleed > 0 && { marginHorizontal: -bleed }]}>
      <View style={styles.monthNav}>
        <IconButton accessibilityLabel="Prethodni mesec" onPress={() => moveMonth(-1)}>
          <ChevronLeft size={20} color={colors.foreground} />
        </IconButton>
        <Text
          // Mesec i godina su jedini kontekst mreže — čitač ekrana mora da ih
          // izgovori kad se promeni, inače su svi dani „isti broj".
          accessibilityLiveRegion="polite"
          style={[styles.monthLabel, { color: colors.foreground }]}>
          {formatMonthTitle(month)}
        </Text>
        <IconButton accessibilityLabel="Sledeći mesec" onPress={() => moveMonth(1)}>
          <ChevronRight size={20} color={colors.foreground} />
        </IconButton>
      </View>

      <View
        style={styles.weekdays}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {CALENDAR_WEEKDAYS.map((label) => (
          <Text key={label} style={[styles.weekday, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        ))}
      </View>

      {/* Promena meseca: mreža se pretapa i podiže (trenutak 8), smanjen pokret samo pretapanje. */}
      <Animated.View key={month} entering={enterFadeUp(0, reduced)} style={styles.grid}>
        {days.map((day) => {
          const isPast = day.key < todayKey;
          return (
            <Pressable
              key={day.key}
              accessibilityRole="button"
              accessibilityState={{ selected: day.isSelected }}
              accessibilityLabel={`${dayAriaLabel(day.key, todayKey)}${isPast ? ', prošlo' : ''}`}
              onPress={() => {
                haptics.tap();
                onSelect(dueFromDayKey(day.key));
              }}
              style={({ pressed }) => [
                styles.cell,
                day.isSelected && { backgroundColor: colors.primary },
                !day.isSelected && pressed && { backgroundColor: colors.muted },
              ]}>
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: day.isSelected
                      ? colors.primaryForeground
                      : isPast || !day.inMonth
                        ? colors.subtle
                        : colors.foreground,
                    fontWeight: day.isToday ? fontWeight.semibold : fontWeight.medium,
                  },
                ]}>
                {day.day}
              </Text>
              {/* Tačka za „danas" — jedini nenumerički signal u mreži. */}
              {day.isToday && !day.isSelected ? (
                <View style={[styles.todayDot, { backgroundColor: colors.primaryText }]} />
              ) : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

/** „14. avgust 2026" — labela izabranog datuma na dugmetu koje otvara ovaj sheet. */
export function formatDueDate(dueDate: number): string {
  const date = new Date(dueDate);
  return `${date.getDate()}. ${SR_MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: space[4],
    gap: space[2],
  },
  heading: {
    ...text.title,
    paddingHorizontal: space[1],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  chipLabel: {
    ...text.body,
    fontWeight: fontWeight.medium,
  },
  chipDetail: {
    ...text.meta,
  },
  checkHidden: {
    opacity: 0,
  },
  // Isti razmak kao kad su delovi bili direktna deca sheet-a (`gap: space[2]`).
  calendar: {
    gap: space[2],
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
  },
  weekdays: {
    flexDirection: 'row',
  },
  weekday: {
    ...text.meta,
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    // 1/7 širine; visina ≥ 44pt da svaki dan ostane ispravna dodirna meta.
    width: `${100 / 7}%`,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  dayLabel: {
    ...text.body,
  },
  todayDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: radius.pill,
  },
  actions: {
    flexDirection: 'row',
    gap: space[2],
    paddingTop: space[1],
  },
  flexBtn: {
    flex: 1,
  },
});
