import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobPhoto } from '@/components/job-photo';
import { PhotoViewer } from '@/components/photo-viewer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';

type ProjectPhoto = { id: string; photo_url: string; sort_order: number };
type ProjectDetail = {
  id: string;
  title: string;
  description: string | null;
  trades: { name_es: string; name_en: string } | null;
  pueblos: { name: string } | null;
};

export default function PortfolioProjectDetailScreen() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const [project, setProject] = useState<ProjectDetail | null | undefined>(undefined);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // A failed load used to read as "not found"; failed photos, as no photos.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let isMounted = true;

    supabase
      .from('handyman_portfolio_projects')
      .select('id, title, description, trades(name_es, name_en), pueblos(name)')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Portfolio project failed to load:', error.message);
          setLoadError(error.message);
        }
        setProject(error ? null : ((data as unknown as ProjectDetail | null) ?? null));
      });

    supabase
      .from('handyman_portfolio_photos')
      .select('id, photo_url, sort_order')
      .eq('project_id', projectId)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error('Portfolio photos failed to load:', error.message);
          setLoadError(error.message);
          return;
        }
        setPhotos(data ?? []);
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  if (project === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (project === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">
            {loadError !== null ? t('common.loadError', { error: loadError }) : t('handymanPublicProfile.notFound')}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const tradeName = project.trades ? (language === 'en' ? project.trades.name_en : project.trades.name_es) : null;
  const subtitle = [tradeName, project.pueblos?.name].filter(Boolean).join(' · ');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="subtitle">{project.title}</ThemedText>
          {subtitle.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          )}
          {project.description && <ThemedText type="default">{project.description}</ThemedText>}
          {loadError !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('common.loadError', { error: loadError })}
            </ThemedText>
          )}

          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <Pressable key={photo.id} onPress={() => setViewerIndex(index)}>
                <JobPhoto uri={photo.photo_url} style={styles.photoThumb} />
              </Pressable>
            ))}
          </View>

          <PhotoViewer
            photos={photos.map((photo) => photo.photo_url)}
            initialIndex={viewerIndex ?? 0}
            visible={viewerIndex !== null}
            onClose={() => setViewerIndex(null)}
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
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  photoThumb: {
    width: 156,
    height: 156,
    borderRadius: Spacing.two,
  },
});
