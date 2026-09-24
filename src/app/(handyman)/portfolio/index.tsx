import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { storagePathFromPortfolioUrl } from '@/lib/portfolio-photos';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';
import { useSession } from '@/providers/session-provider';

type ProjectPhoto = { id: string; photo_url: string; sort_order: number };
type ProjectRow = {
  id: string;
  title: string;
  trades: { name_es: string; name_en: string } | null;
  pueblos: { name: string } | null;
  handyman_portfolio_photos: ProjectPhoto[];
};

export default function PortfolioProjectsScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const theme = useTheme();
  const { session } = useSession();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let isMounted = true;

      supabase
        .from('handyman_portfolio_projects')
        .select(
          'id, title, trades(name_es, name_en), pueblos(name), handyman_portfolio_photos(id, photo_url, sort_order)'
        )
        .eq('handyman_id', session.user.id)
        .order('created_at', { ascending: false })
        .then(({ data, error: fetchError }) => {
          if (!isMounted) return;
          if (fetchError) setError(fetchError.message);
          setProjects((data as ProjectRow[] | null) ?? []);
        });

      return () => {
        isMounted = false;
      };
    }, [session])
  );

  function handleDelete(project: ProjectRow) {
    confirmDestructive({
      title: t('portfolio.deleteConfirmTitle'),
      message: t('portfolio.deleteConfirmMessage'),
      confirmLabel: t('portfolio.delete'),
      cancelLabel: t('portfolio.cancel'),
      onConfirm: async () => {
        setError(null);
        // Row first, confirmed with .select() (an RLS-skipped delete returns
        // 0 rows and no error): this used to drop the project from the list
        // whether or not it was deleted, so it came back on the next visit.
        const { data: deleted, error: deleteError } = await supabase
          .from('handyman_portfolio_projects')
          .delete()
          .eq('id', project.id)
          .select('id');
        if (deleteError || !deleted || deleted.length === 0) {
          setError(t('common.deleteError', { error: deleteError?.message ?? t('common.nothingChanged') }));
          return;
        }
        setProjects((prev) => (prev ?? []).filter((p) => p.id !== project.id));
        // The row cascade-deletes its photo rows, but nothing deletes the
        // actual Storage files without this step. After the row, not before:
        // portfolio-photos is keyed by the handyman's own folder, so this
        // doesn't need the row, and a leftover file is invisible -- whereas
        // files-first then a failed row delete left a project with broken
        // photos.
        const paths = project.handyman_portfolio_photos
          .map((p) => storagePathFromPortfolioUrl(p.photo_url))
          .filter((p): p is string => !!p);
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from('portfolio-photos').remove(paths);
          if (storageError) console.warn('Portfolio photo file cleanup failed:', storageError.message);
        }
      },
    });
  }

  if (!projects) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="default" themeColor="textSecondary">
            {t('portfolio.intro')}
          </ThemedText>

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          {projects.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('portfolio.empty')}
            </ThemedText>
          )}

          {projects.map((project) => {
            const sortedPhotos = [...project.handyman_portfolio_photos].sort(
              (a, b) => a.sort_order - b.sort_order
            );
            const cover = sortedPhotos[0];
            const tradeName = project.trades
              ? language === 'en'
                ? project.trades.name_en
                : project.trades.name_es
              : null;
            const subtitle = [tradeName, project.pueblos?.name].filter(Boolean).join(' · ');

            return (
              <Link
                key={project.id}
                href={{ pathname: '/portfolio/[id]', params: { id: project.id } }}
                asChild>
                <Pressable style={StyleSheet.flatten([styles.card, { borderColor: theme.backgroundElement }])}>
                  {cover ? (
                    <Image source={{ uri: cover.photo_url }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: theme.backgroundElement }]} />
                  )}
                  <View style={styles.cardText}>
                    <ThemedText type="smallBold">{project.title}</ThemedText>
                    {subtitle.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {subtitle}
                      </ThemedText>
                    )}
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('portfolio.photoCount', { count: project.handyman_portfolio_photos.length })}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => handleDelete(project)} hitSlop={8}>
                    <ThemedText type="smallBold" style={styles.deleteText}>
                      {t('portfolio.delete')}
                    </ThemedText>
                  </Pressable>
                </Pressable>
              </Link>
            );
          })}

          <Link href="/portfolio/new" asChild>
            <PrimaryButton label={t('portfolio.addProject')} />
          </Link>
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
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  coverPlaceholder: {},
  cardText: {
    flex: 1,
    gap: Spacing.half,
  },
  deleteText: {
    color: '#d64545',
  },
  error: {
    color: '#d64545',
  },
});
