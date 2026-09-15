import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';

type TradePickerProps = {
  mode: 'single' | 'multi';
  selected: number[];
  onChange: (ids: number[]) => void;
};

export function TradePicker({ mode, selected, onChange }: TradePickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { trades, error } = useTrades();
  const selectedSet = new Set(selected);

  function handleToggle(tradeId: number) {
    if (mode === 'single') {
      onChange(selectedSet.has(tradeId) ? [] : [tradeId]);
      return;
    }

    const next = new Set(selectedSet);
    if (next.has(tradeId)) {
      next.delete(tradeId);
    } else {
      next.add(tradeId);
    }
    onChange([...next]);
  }

  if (error) {
    return (
      <ThemedText type="small" style={styles.errorText}>
        {t('common.loadError', { error })}
      </ThemedText>
    );
  }

  if (!trades) {
    return <ThemedText type="default">{t('common.loading')}</ThemedText>;
  }

  return (
    <FlatList
      data={trades}
      keyExtractor={(item) => String(item.id)}
      scrollEnabled={false}
      renderItem={({ item }) => {
        const isSelected = selectedSet.has(item.id);
        return (
          <Pressable
            onPress={() => handleToggle(item.id)}
            style={[
              styles.row,
              { backgroundColor: isSelected ? theme.backgroundSelected : 'transparent' },
            ]}>
            <ThemedText type="default">{item.name}</ThemedText>
            {isSelected && <ThemedText type="smallBold">✓</ThemedText>}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  errorText: {
    color: '#d64545',
  },
});
