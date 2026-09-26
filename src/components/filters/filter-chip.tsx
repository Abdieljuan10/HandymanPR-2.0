import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';

import { Chip } from '@/components/chip';
import { useTheme } from '@/hooks/use-theme';

type FilterChipProps = {
  /** The filter's own name, e.g. "Oficio" / "Pueblo". */
  label: string;
  /** Display names of what's currently selected in this filter (localized by the caller). */
  selectedNames: string[];
  onPress: () => void;
  icon?: ReactNode;
};

// "Oficio" / "Plomería" / "Oficio · 2" -- the summary rule for an on-screen
// filter entry chip. Exported separately so a screen can reuse the same
// wording elsewhere (e.g. an accessibility label) without re-deriving it.
export function filterChipLabel(label: string, selectedNames: string[]): string {
  if (selectedNames.length === 0) return label;
  if (selectedNames.length === 1) return selectedNames[0];
  return `${label} · ${selectedNames.length}`;
}

// On-screen entry point into one focused filter view (new 2026-09-26,
// filter UX redesign). A Chip with a dropdown chevron, highlighted while
// anything in its filter is selected. Opening/closing the view is the
// caller's job -- this is presentation only.
export function FilterChip({ label, selectedNames, onPress, icon }: FilterChipProps) {
  const theme = useTheme();
  const active = selectedNames.length > 0;

  return (
    <Chip
      label={filterChipLabel(label, selectedNames)}
      selected={active}
      onPress={onPress}
      icon={icon}
      trailingIcon={<Ionicons name="chevron-down" size={14} color={active ? theme.tint : theme.textSecondary} />}
    />
  );
}
