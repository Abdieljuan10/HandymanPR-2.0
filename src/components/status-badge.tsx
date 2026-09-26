import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

// 'warning' isn't part of the brand brief (teal primary / green success /
// red destructive) -- it exists because today's ad hoc status color map
// (client Home's STATUS_COLORS) already has a 5th case, pending_completion,
// that's genuinely neither: '#e0a72e', an amber "awaiting someone's action"
// color. Kept here, matching that same amber, but flagged for explicit
// sign-off before any screen adopts this tone -- see the chat writeup's
// status -> tone table.
const WARNING_LIGHT = { background: '#FBF0DC', foreground: '#96660E' };
const WARNING_DARK = { background: 'rgba(224,167,46,0.18)', foreground: '#E0A72E' };

// New in the 2026-09-25 design-system pass. Purely a tone -> color mapping --
// it doesn't know about job_status or bid.status strings. Each screen maps
// its own status to a tone when it adopts this (not done yet).
export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const warning = isDark ? WARNING_DARK : WARNING_LIGHT;

  const { background, foreground } = {
    neutral: { background: theme.backgroundElement, foreground: theme.textSecondary },
    info: { background: theme.tintBackground, foreground: theme.tint },
    success: { background: theme.successBackground, foreground: theme.success },
    warning,
    error: { background: theme.errorBackground, foreground: theme.error },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <ThemedText type="metadata" style={[styles.label, { color: foreground }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingVertical: Spacing.half + 2,
    paddingHorizontal: Spacing.two,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
