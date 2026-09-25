import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradePicker } from '@/components/trade-picker';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

export default function HandymanTradesScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [selected, setSelected] = useState<number[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    let isMounted = true;
    supabase
      .from('handyman_trades')
      .select('trade_id')
      .eq('handyman_id', session.user.id)
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError || !data) {
          // Never fall through to an empty selection: saving that would
          // remove every trade this handyman has.
          setLoadError(fetchError?.message ?? '');
          return;
        }
        setSelected(data.map((row) => row.trade_id));
        setLoadingExisting(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function handleSave() {
    if (!session) return;
    setError(null);
    setSaving(true);
    setSaved(false);

    // Add first, then remove what was deselected -- never "delete all, then
    // insert": if the second step of that failed, the handyman was left with
    // no trades at all and vanished from every job feed. In this order a
    // failure part-way leaves extra trades, never none.
    if (selected.length > 0) {
      const { error: insertError } = await supabase.from('handyman_trades').upsert(
        selected.map((trade_id) => ({ handyman_id: session.user.id, trade_id })),
        { onConflict: 'handyman_id,trade_id', ignoreDuplicates: true }
      );
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    let removeQuery = supabase.from('handyman_trades').delete().eq('handyman_id', session.user.id);
    if (selected.length > 0) removeQuery = removeQuery.not('trade_id', 'in', `(${selected.join(',')})`);
    const { error: deleteError } = await removeQuery;
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  if (loadError !== null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="small" style={styles.error}>
            {t('common.loadError', { error: loadError })}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loadingExisting) {
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <ThemedText type="default" themeColor="textSecondary">
            {t('handymanTrades.intro')}
          </ThemedText>

          <TradePicker mode="multi" selected={selected} onChange={setSelected} />

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
          {saved && <ThemedText type="small">{t('handymanTrades.saved')}</ThemedText>}

          <PrimaryButton
            label={t('handymanTrades.saveButton', { count: selected.length })}
            onPress={handleSave}
            loading={saving}
          />
        </ScrollView>
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
  },
  scrollContent: {
    gap: Spacing.three,
  },
  error: {
    color: '#d64545',
  },
});
