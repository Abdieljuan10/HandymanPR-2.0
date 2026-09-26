import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { ServiceIcon } from '@/components/service-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { TradeRecord } from '@/hooks/use-trades';
import { useTheme } from '@/hooks/use-theme';

type TradeFilterGridProps = {
  /** The options to show -- the caller decides which (all trades, or only ones with results). */
  trades: TradeRecord[];
  selected: number[];
  onChange: (ids: number[]) => void;
  /** Optional per-trade result count, from data the screen already has loaded. */
  counts?: ReadonlyMap<number, number>;
  /** Wording for a count, e.g. (n) => t('...', { count: n }). Required for counts to show. */
  countLabel?: (count: number) => string;
};

// Multi-select trade tiles for filtering (new 2026-09-26, filter UX
// redesign). Same visual pattern as the Post Job wizard's trade step
// (post-job-wizard.tsx): 2-column Card + ServiceIcon tiles, tint border and
// check when selected -- but multi-select, and with an optional count.
// Not a replacement for TradePicker, which stays the editing/config picker
// (Post Job form, job edit, portfolio, handyman Trades settings).
export function TradeFilterGrid({ trades, selected, onChange, counts, countLabel }: TradeFilterGridProps) {
  const theme = useTheme();
  const selectedSet = new Set(selected);

  function handleToggle(tradeId: number) {
    const next = new Set(selectedSet);
    if (next.has(tradeId)) next.delete(tradeId);
    else next.add(tradeId);
    onChange([...next]);
  }

  return (
    <View style={styles.grid}>
      {trades.map((trade) => {
        const isSelected = selectedSet.has(trade.id);
        const count = counts?.get(trade.id);
        return (
          <Pressable
            key={trade.id}
            style={styles.tilePressable}
            onPress={() => handleToggle(trade.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}>
            <Card
              style={[
                styles.tile,
                isSelected && { borderColor: theme.tint, borderWidth: 2, backgroundColor: theme.tintBackground },
              ]}>
              <ServiceIcon slug={trade.slug} size={36} />
              <View style={styles.tileText}>
                <ThemedText type="smallBold" numberOfLines={3}>
                  {trade.name}
                </ThemedText>
                {count !== undefined && countLabel && (
                  <ThemedText type="metadata">{countLabel(count)}</ThemedText>
                )}
              </View>
              {isSelected && (
                <View style={styles.check}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.tint} />
                </View>
              )}
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.two,
  },
  // Fixed share rather than flexGrow, so an odd last tile stays half-width
  // instead of stretching across the row.
  tilePressable: {
    width: '48.5%',
  },
  // Icon stacked ABOVE the name (the Post Job wizard puts them side by
  // side): side by side leaves ~82px for the name at phone width, and
  // Spanish names like "Reparación de Electrodomésticos" / "HVAC / Aire
  // Acondicionado" have single words wider than that. Stacked, the name
  // gets the tile's full inner width (~134px). flex: 1 keeps both tiles in
  // a row the same height when one name wraps more than the other.
  tile: {
    flex: 1,
    gap: Spacing.two,
    minHeight: 112,
  },
  tileText: {
    gap: Spacing.half,
  },
  check: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
  },
});
