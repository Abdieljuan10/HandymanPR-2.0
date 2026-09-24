import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTrades } from '@/hooks/use-trades';

type TradePickerProps = {
  mode: 'single' | 'multi';
  selected: number[];
  onChange: (ids: number[]) => void;
};

// Visual pass 2026-09-24, option "Oficio A -- Refined List": a leading
// radio-style dot (tint border/fill + white check when selected) in place
// of the trailing text checkmark, hairline row dividers, tighter rows. No
// row-background highlight anymore -- the dot alone carries selected state,
// so it isn't said twice.
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
      showsVerticalScrollIndicator={false}
      data={trades}
      keyExtractor={(item) => String(item.id)}
      scrollEnabled={false}
      renderItem={({ item, index }) => {
        const isSelected = selectedSet.has(item.id);
        return (
          <Pressable
            onPress={() => handleToggle(item.id)}
            style={[styles.row, index > 0 && { borderTopColor: theme.backgroundSelected, borderTopWidth: 1 }]}>
            <View
              style={[
                styles.dot,
                {
                  borderColor: isSelected ? theme.tint : theme.textSecondary,
                  backgroundColor: isSelected ? theme.tint : 'transparent',
                },
              ]}>
              {isSelected && <Ionicons name="checkmark" size={12} color="#ffffff" />}
            </View>
            <ThemedText type="default" style={styles.label}>
              {item.name}
            </ThemedText>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 13,
    paddingHorizontal: Spacing.one,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    flexGrow: 1,
  },
  errorText: {
    color: '#d64545',
  },
});
