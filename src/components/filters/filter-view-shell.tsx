import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FilterViewShellProps = {
  title: string;
  onClose: () => void;
  /** Omit to hide "Limpiar" entirely; pass canClear={false} to show it disabled. */
  onClear?: () => void;
  canClear?: boolean;
  /** e.g. "Ver 6 trabajos" -- the caller owns the count and its wording. */
  ctaLabel: string;
  onCtaPress: () => void;
  children: ReactNode;
};

// Assumes the standard tab-screen body it's rendered in: a bottom-edge
// SafeAreaView with Spacing.four padding (every tab screen's `safeArea`
// style). BottomTabInset is measured from the content's bottom edge, so
// subtracting the padding that's already there puts the CTA's bottom
// exactly where every list's last item already ends -- clear of the
// floating tab bar.
//
// Plus RAISED_TAB_BUTTON_CLEARANCE: the client tab bar's center Post Job
// circle (center-post-job-button.tsx) rises 22px above the bar's top edge,
// with a shadow below that -- BottomTabInset alone left only 16px, so the
// CTA collided with it (client report 2026-09-26). This clears the circle
// + its shadow with room to spare. The handyman bar has no raised button;
// there it's just a little extra space.
const RAISED_TAB_BUTTON_CLEARANCE = 24;
const CTA_BOTTOM_MARGIN = BottomTabInset - Spacing.four + RAISED_TAB_BUTTON_CLEARANCE;

// Focused full-screen filter view (new 2026-09-26, filter UX redesign).
// Replaces the list while open -- the same "list <-> plain ScrollView"
// swap the old filter panels used, which is what scrolls correctly on
// Android (see TODO.md "Filter panel scroll -- REAL fix"). Nothing here is
// a modal/sheet on purpose. The body is a plain ScrollView; the CTA sits
// OUTSIDE it, so it stays pinned while the content scrolls.
//
// Owns no filter state -- each screen keeps its own selections and passes
// the live result count in via ctaLabel.
export function FilterViewShell({
  title,
  onClose,
  onClear,
  canClear = true,
  ctaLabel,
  onCtaPress,
  children,
}: FilterViewShellProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  // Android hardware Back closes this view (same as ✕) instead of leaving
  // the screen. Registered via useFocusEffect, not a plain effect: a tab
  // screen stays mounted when you switch tabs, so a plain listener would
  // keep swallowing Back on OTHER tabs while this view sits open behind
  // them. Only exists while the view is mounted, so the screen's normal
  // Back behavior is untouched whenever the view is closed. No-op on iOS.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => subscription.remove();
    }, [onClose])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('filters.close')}
          style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="sectionHeading" style={styles.title} numberOfLines={1}>
          {title}
        </ThemedText>
        {onClear && (
          <Pressable
            onPress={onClear}
            disabled={!canClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canClear }}>
            <ThemedText type="smallBold" themeColor={canClear ? 'tint' : 'textSecondary'}>
              {t('filters.clear')}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <PrimaryButton label={ctaLabel} onPress={onCtaPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  closeButton: {
    marginLeft: -Spacing.half,
  },
  title: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  footer: {
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: CTA_BOTTOM_MARGIN,
  },
});
