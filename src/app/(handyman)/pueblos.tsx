import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { PuebloPicker } from '@/components/pueblo-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { usePueblos } from '@/hooks/use-pueblos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function HandymanPueblosScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const { pueblos, error: pueblosError } = usePueblos();
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !pueblos) return;

    let isMounted = true;
    supabase
      .from('handyman_pueblos')
      .select('pueblo_id')
      .eq('handyman_id', session.user.id)
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError || !data) {
          // Never fall through to an empty selection: saving that would
          // remove every pueblo this handyman has.
          setLoadError(fetchError?.message ?? '');
          return;
        }
        const idToSlug = new Map(pueblos.map((p) => [p.id, p.slug]));
        const slugs = data
          .map((row) => idToSlug.get(row.pueblo_id))
          .filter((slug): slug is string => !!slug);
        setSelected(slugs);
        setLoadingExisting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session, pueblos]);

  async function handleSave() {
    if (!session || !pueblos) return;
    setError(null);
    setSaving(true);
    setSaved(false);

    const slugToId = new Map(pueblos.map((p) => [p.slug, p.id]));
    const selectedIds = selected
      .map((slug) => slugToId.get(slug))
      .filter((id): id is number => id !== undefined);

    // Add first, then remove what was deselected -- never "delete all, then
    // insert": if the second step of that failed, the handyman was left with
    // no pueblos at all and vanished from every job feed. In this order a
    // failure part-way leaves extra pueblos, never none.
    if (selectedIds.length > 0) {
      const { error: insertError } = await supabase.from('handyman_pueblos').upsert(
        selectedIds.map((pueblo_id) => ({ handyman_id: session.user.id, pueblo_id })),
        { onConflict: 'handyman_id,pueblo_id', ignoreDuplicates: true }
      );
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    let removeQuery = supabase.from('handyman_pueblos').delete().eq('handyman_id', session.user.id);
    if (selectedIds.length > 0) removeQuery = removeQuery.not('pueblo_id', 'in', `(${selectedIds.join(',')})`);
    const { error: deleteError } = await removeQuery;
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  if (pueblosError || loadError !== null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: pueblosError ?? loadError })}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!pueblos || loadingExisting) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ThemedText type="default" themeColor="textSecondary">
          {t('handymanPueblos.intro')}
        </ThemedText>

        <PuebloPicker mode="multi" selected={selected} onChange={setSelected} />

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}
        {saved && <ThemedText type="small">{t('handymanPueblos.saved')}</ThemedText>}

        <PrimaryButton
          label={t('handymanPueblos.saveButton', { count: selected.length })}
          onPress={handleSave}
          loading={saving}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  error: {
    color: '#d64545',
  },
});
