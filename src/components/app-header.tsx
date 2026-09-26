import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Visual pass 2026-09-24, option "Header C -- Consolidated": the wordmark
// bar REPLACES each top-level tab screen's own big per-screen title (option
// B, keeping both, was shown deliberately as the one to avoid -- two
// headings stacked on top of each other). One heading, not two.
//
// Text wordmark only -- there's no real logo mark yet, `icon.png`/
// `splash-icon.png` are still the literal default Expo template graphics
// (see TODO.md). Swap in a symbol here once real branding art exists.
//
// This is only the bar itself. Each tab screen wraps it in its own
// top-edges-only SafeAreaView, separate from the screen's main content
// SafeAreaView (which drops the top edge) -- so the safe-area top inset is
// consumed exactly once, by the header, not doubled.
export function AppHeader({ pageTitle }: { pageTitle: string }) {
  const theme = useTheme();

  return (
    <ThemedView style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.wordmarkRow}>
        <ThemedText type="smallBold" themeColor="tint" style={styles.wordmark}>
          HandymanPR
        </ThemedText>
      </View>
      {/* cardTitle (16/700), not the old ad hoc 14/600 -- a bit more
          presence for "strong typography hierarchy" without changing the
          bar's height or either screen-side's safe-area math. */}
      <ThemedText type="cardTitle" style={styles.pageTitle} numberOfLines={1}>
        {pageTitle}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    // Hairline, not a solid 1px in backgroundSelected's flat gray -- "subtle
    // borders" per the 2026-09-25 design-system pass.
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  wordmark: {
    fontSize: 17,
    letterSpacing: -0.3,
  },
  pageTitle: {
    flexShrink: 1,
    marginLeft: Spacing.three,
    textAlign: 'right',
  },
});
