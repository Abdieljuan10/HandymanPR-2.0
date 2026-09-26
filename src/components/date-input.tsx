import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import type { MarkingProps } from 'react-native-calendars/src/calendar/day/marking';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function toIsoDate(date: Date) {
  // NOT date.toISOString().slice(0, 10) -- that reads UTC fields, which is
  // the wrong calendar day for part of the evening in Puerto Rico (AST,
  // UTC-4, no DST). Local fields, so "today" always means the phone's today.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type DateInputProps = {
  onChange: (isoDate: string | null) => void;
  /**
   * Dates that can't be picked (YYYY-MM-DD), shown struck through and
   * unselectable. Unused today -- for the deferred handyman
   * availability/blackout-dates feature (see TODO.md). Wiring that up later
   * is just passing this array; nothing else here needs to change.
   */
  disabledDates?: string[];
};

// A real calendar widget, swapped in 2026-09-24 for the original three
// linked month/day/year FormFields (see TODO.md's "Mutual agreed date"
// entry for why that version existed) -- pure JS, no native module, so no
// EAS build was needed for this. Kept the same file/component name and the
// same `onChange(isoDate | null)` contract so JobDateCard didn't need to
// change at all.
//
// Spanish/English month & day names: set up in LanguageProvider, not here --
// see the comment there for why (mount-order + React Compiler purity).
export function DateInput({ onChange, disabledDates = [] }: DateInputProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const markedDates = useMemo(() => {
    const marks: Record<string, MarkingProps> = {};
    for (const iso of disabledDates) {
      marks[iso] = { disabled: true, disableTouchEvent: true };
    }
    if (selected) {
      marks[selected] = { ...marks[selected], selected: true, selectedColor: theme.tint, selectedTextColor: '#ffffff' };
    }
    return marks;
  }, [disabledDates, selected, theme.tint]);

  function handleDayPress(day: DateData) {
    setSelected(day.dateString);
    onChange(day.dateString);
  }

  return (
    // No rounded corners/clipping of its own -- JobDateCard's own Card
    // already rounds this whole area (a second nested rounded box, even in
    // the identical color, produced a visible seam at the shared corners,
    // client report 2026-09-24). Background color is still explicit rather
    // than left to inherit from the parent showing through: a plain child
    // View with no color of its own rendered as a stray patch on Android
    // instead of matching the parent. JobDateCard's outer Card is white
    // (theme.background) since the 2026-09-26 Job Details restyle -- this
    // must track whatever that parent actually is, not a fixed gray, or the
    // same mismatch reappears in the opposite direction (client report
    // 2026-09-26: gray box inside a white card).
    <View style={[styles.wrapper, { backgroundColor: theme.background }]}>
      <ThemedText type="smallBold" style={styles.label}>
        {t('jobDate.selectDate')}
      </ThemedText>
      <Calendar
        current={todayIso}
        minDate={todayIso}
        markedDates={markedDates}
        onDayPress={handleDayPress}
        enableSwipeMonths
        theme={{
          // Explicit fill, not 'transparent' -- some internal panel of the
          // calendar (header vs. day grid) was still coming through a
          // different color even with the outer wrapper de-nested, so this
          // matches the card's own fill outright rather than relying on
          // layered transparency to line up (client call 2026-09-24: stop
          // fighting it, make it one flat color).
          backgroundColor: theme.background,
          calendarBackground: theme.background,
          textSectionTitleColor: theme.textSecondary,
          dayTextColor: theme.text,
          textDisabledColor: theme.textSecondary,
          todayTextColor: theme.tint,
          monthTextColor: theme.text,
          arrowColor: theme.tint,
          selectedDayBackgroundColor: theme.tint,
          selectedDayTextColor: '#ffffff',
          textDayFontWeight: '500',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '600',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingTop: Spacing.two,
  },
  label: {
    marginBottom: Spacing.one,
  },
});
