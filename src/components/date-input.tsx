import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Spacing } from '@/constants/theme';

type DateInputProps = {
  onChange: (isoDate: string | null) => void;
};

// JS-only, no native date-picker dependency -- three linked number fields,
// validated as a real calendar date. See TODO.md's "Mutual agreed date"
// entry for why (avoids another EAS build cycle); swap in a native picker
// later without touching anything that reads the resulting ISO date.
export function DateInput({ onChange }: DateInputProps) {
  const { t } = useTranslation();
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  function update(m: string, d: string, y: string) {
    if (!m.trim() || !d.trim() || !y.trim()) {
      setError(undefined);
      onChange(null);
      return;
    }

    const mi = Number(m);
    const di = Number(d);
    const yi = Number(y);
    const candidate = new Date(yi, mi - 1, di);
    const valid =
      Number.isInteger(mi) &&
      Number.isInteger(di) &&
      Number.isInteger(yi) &&
      yi > 1900 &&
      candidate.getFullYear() === yi &&
      candidate.getMonth() === mi - 1 &&
      candidate.getDate() === di;

    if (!valid) {
      setError(t('jobDate.invalidDate'));
      onChange(null);
      return;
    }

    setError(undefined);
    onChange(`${yi.toString().padStart(4, '0')}-${mi.toString().padStart(2, '0')}-${di.toString().padStart(2, '0')}`);
  }

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <FormField
          label={t('jobDate.month')}
          value={month}
          onChangeText={(value) => {
            setMonth(value);
            update(value, day, year);
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="MM"
        />
      </View>
      <View style={styles.field}>
        <FormField
          label={t('jobDate.day')}
          value={day}
          onChangeText={(value) => {
            setDay(value);
            update(month, value, year);
          }}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="DD"
        />
      </View>
      <View style={styles.field}>
        <FormField
          label={t('jobDate.year')}
          value={year}
          onChangeText={(value) => {
            setYear(value);
            update(month, day, value);
          }}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="YYYY"
          error={error}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
  },
});
