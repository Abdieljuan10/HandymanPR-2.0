import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PuebloList } from '@/components/pueblo-picker/pueblo-list';
import { PuebloMap } from '@/components/pueblo-picker/pueblo-map';
import { PrimaryButton } from '@/components/primary-button';
import { PUEBLO_SHAPES } from '@/constants/pueblo-shapes';
import { Spacing } from '@/constants/theme';

type PuebloPickerProps = {
  mode: 'single' | 'multi';
  selected: string[];
  onChange: (slugs: string[]) => void;
};

export function PuebloPicker({ mode, selected, onChange }: PuebloPickerProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<'map' | 'list'>('map');
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function handleToggle(slug: string) {
    if (mode === 'single') {
      onChange(selectedSet.has(slug) ? [] : [slug]);
      return;
    }

    const next = new Set(selectedSet);
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    onChange([...next]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <PrimaryButton
          label={t('common.map')}
          variant={view === 'map' ? 'primary' : 'secondary'}
          onPress={() => setView('map')}
          style={styles.toggleButton}
        />
        <PrimaryButton
          label={t('common.searchList')}
          variant={view === 'list' ? 'primary' : 'secondary'}
          onPress={() => setView('list')}
          style={styles.toggleButton}
        />
      </View>

      {mode === 'multi' && (
        <View style={styles.toggleRow}>
          <PrimaryButton
            label={t('puebloPicker.selectAll')}
            variant="secondary"
            onPress={() => onChange(PUEBLO_SHAPES.map((shape) => shape.slug))}
            style={styles.toggleButton}
          />
          <PrimaryButton
            label={t('puebloPicker.clearAll')}
            variant="secondary"
            onPress={() => onChange([])}
            style={styles.toggleButton}
          />
        </View>
      )}

      {view === 'map' ? (
        <PuebloMap selected={selectedSet} onToggle={handleToggle} />
      ) : (
        <PuebloList selected={selectedSet} onToggle={handleToggle} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  toggleButton: {
    flex: 1,
  },
});
