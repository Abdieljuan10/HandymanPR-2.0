import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Keyed by trade slug (stable, language-independent), not the localized
// name -- see supabase/seed.sql for the canonical slug list. A trade added
// later with no entry here falls back to a generic icon rather than
// crashing (see DEFAULT_TRADE_ICON below).
export const TRADE_ICONS: Record<string, IconName> = {
  plumbing: 'water-outline',
  electrical: 'flash-outline',
  'hvac-ac': 'snow-outline',
  'concrete-masonry': 'cube-outline',
  carpentry: 'hammer-outline',
  roofing: 'home-outline',
  painting: 'color-palette-outline',
  landscaping: 'leaf-outline',
  'appliance-repair': 'construct-outline',
  general: 'apps-outline',
};

export const DEFAULT_TRADE_ICON: IconName = 'construct-outline';
