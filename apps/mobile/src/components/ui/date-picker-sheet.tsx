import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { startOfLocalDay } from '@/lib/deadline';
import { haptics } from '@/lib/haptics';
import { SR_MONTHS_SHORT } from '@/lib/task-meta';
import { useThemeColors } from '@/theme/theme-provider';
import { fontWeight, MIN_TOUCH_TARGET, radius, space, text } from '@/theme/tokens';

/** Ponedeljak prvi — isti početak nedelje koji Puls koristi. */
const WEEKDAYS = ['P', 'U', 'S', 'Č', 'P', 'S', 'N'];

const SR_MONTHS_LONG = [
  'januar',
  'februar',
  'mart',
  'april',
  'maj',
  'jun',
  'jul',
  'avgust',
  'septembar',
  'oktobar',
  'novembar',
  'decembar',
];

/**
 * Rok se čuva u podne lokalno — isto što `dueDateInDays` radi za presete, pa
 * pomeranje vremenske zone ne prebaci datum na susedni dan.
 */
function noonOf(year: number, month: number, day: number): number {
  const date = new Date(year, month, day, 12, 0, 0, 0);
  return date.getTime();
}

/** Mreža od 6 nedelja × 7 dana; `null` je prazno polje pre/posle meseca. */
function monthGrid(year: number, month: number): Array<number | null> {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7; // pomeraj do ponedeljka
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Izbor proizvoljnog datuma — pandan `<input type="date">` sa weba.
 *
 * Namerno je pisan u čistom React Native umesto preko native picker modula:
 * dodavanje `@react-native-community/datetimepicker` traži nov development build
 * na oba sistema, a ovde je potrebna jedna mreža dana. Ovako radi i u Expo Go i u
 * postojećem buildu, i izgleda isto na iOS-u i na Androidu.
 *
 * Presete („Danas", „Sutra", „Za 7 dana") i dalje nosi pozivalac; ovaj sheet je
 * treći korak — „neki drugi dan".
 */
export function DatePickerSheet({
  visible,
  value,
  onSelect,
  onClose,
  title = 'Izaberi rok',
}: {
  visible: boolean;
  /** Trenutno izabran datum (ms) ili `null`. */
  value: number | null;
  onSelect: (dueDate: number | null) => void;
  onClose: () => void;
  title?: string;
}) {
  const colors = useThemeColors();
  const initial = value === null ? new Date() : new Date(value);
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const today = startOfLocalDay(Date.now());
  const selectedDay = value === null ? null : startOfLocalDay(value);
  const cells = monthGrid(year, month);

  function shiftMonth(delta: number) {
    haptics.select();
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  return (
    <Sheet visible={visible} onClose={onClose} dragAnywhere style={styles.sheet}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>
        {title}
      </Text>

      <View style={styles.monthNav}>
        <IconButton accessibilityLabel="Prethodni mesec" onPress={() => shiftMonth(-1)}>
          <ChevronLeft size={20} color={colors.foreground} />
        </IconButton>
        <Text
          // Mesec i godina su jedini kontekst mreže — čitač ekrana mora da ih
          // izgovori kad se promeni, inače su svi dani „isti broj".
          accessibilityLiveRegion="polite"
          style={[styles.monthLabel, { color: colors.foreground }]}>
          {SR_MONTHS_LONG[month]} {year}
        </Text>
        <IconButton accessibilityLabel="Sledeći mesec" onPress={() => shiftMonth(1)}>
          <ChevronRight size={20} color={colors.foreground} />
        </IconButton>
      </View>

      <View
        style={styles.weekdays}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((label, index) => (
          <Text key={index} style={[styles.weekday, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={index} style={styles.cell} />;
          const dayStart = startOfLocalDay(noonOf(year, month, day));
          const isSelected = selectedDay === dayStart;
          const isToday = dayStart === today;
          const isPast = dayStart < today;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${day}. ${SR_MONTHS_LONG[month]} ${year}${
                isToday ? ', danas' : ''
              }${isPast ? ', prošlo' : ''}`}
              onPress={() => {
                haptics.tap();
                onSelect(noonOf(year, month, day));
              }}
              style={({ pressed }) => [
                styles.cell,
                isSelected && { backgroundColor: colors.primary },
                !isSelected && pressed && { backgroundColor: colors.muted },
              ]}>
              <Text
                style={[
                  styles.dayLabel,
                  {
                    color: isSelected
                      ? colors.primaryForeground
                      : isPast
                        ? colors.subtle
                        : colors.foreground,
                    fontWeight: isToday ? fontWeight.semibold : fontWeight.medium,
                  },
                ]}>
                {day}
              </Text>
              {/* Tačka za „danas" — jedini nenumerički signal u mreži. */}
              {isToday && !isSelected ? (
                <View style={[styles.todayDot, { backgroundColor: colors.primaryText }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          label="Bez roka"
          variant="ghost"
          onPress={() => {
            haptics.tap();
            onSelect(null);
          }}
          style={styles.flexBtn}
        />
        <Button label="Zatvori" variant="secondary" onPress={onClose} style={styles.flexBtn} />
      </View>
    </Sheet>
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
    fontSize: 18,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: space[1],
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    ...text.body,
    fontWeight: fontWeight.semibold,
    textTransform: 'capitalize',
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
