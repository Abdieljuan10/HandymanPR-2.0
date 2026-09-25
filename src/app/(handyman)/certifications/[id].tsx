import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { JobPhoto } from '@/components/job-photo';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';

type CertificationRow = {
  title: string;
  issuing_org: string | null;
  is_verified: boolean;
  file_url: string | null;
};

type FieldErrors = { title?: string };

export default function EditCertificationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [issuingOrg, setIssuingOrg] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    supabase
      .from('handyman_certifications')
      .select('title, issuing_org, is_verified, file_url')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!isMounted) return;
        // This used to return early on any failure without ever clearing
        // `loading`, so the screen sat on "Loading..." forever.
        if (error || !data) {
          if (error) console.error('Certification failed to load:', error.message);
          setLoadError(error?.message ?? t('certifications.notFound'));
          return;
        }
        const row = data as CertificationRow;
        setTitle(row.title);
        setIssuingOrg(row.issuing_org ?? '');
        setIsVerified(row.is_verified);
        setFileUrl(row.file_url);

        if (row.file_url) {
          const { data: signed, error: signError } = await supabase.storage
            .from('certifications')
            .createSignedUrl(row.file_url, 3600);
          if (signError) console.warn('Certification image link failed:', signError.message);
          if (isMounted && signed) setSignedPhotoUrl(signed.signedUrl);
        }

        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, t]);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = t('certifications.errors.title');
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !id) return;

    setSubmitting(true);
    const { data: updated, error: updateError } = await supabase
      .from('handyman_certifications')
      .update({ title: title.trim(), issuing_org: issuingOrg.trim() || null })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    setSubmitting(false);
    if (updateError) {
      setSubmitError(updateError.message);
      return;
    }
    if (!updated) {
      setSubmitError(t('certifications.notAllowed'));
      return;
    }
    router.back();
  }

  function handleDelete() {
    confirmDestructive({
      title: t('certifications.removeConfirmTitle'),
      message: t('certifications.removeConfirmMessage'),
      confirmLabel: t('certifications.remove'),
      cancelLabel: t('certifications.cancel'),
      onConfirm: async () => {
        setSubmitError(null);
        // Row first, confirmed with .select() (an RLS-skipped delete returns
        // 0 rows and no error) -- this used to navigate back as if removed
        // no matter what. The file after: the certifications bucket is keyed
        // by the handyman's own folder, not the row, and a leftover private
        // file is invisible to everyone.
        const { data: deleted, error: deleteError } = await supabase
          .from('handyman_certifications')
          .delete()
          .eq('id', id)
          .select('id');
        if (deleteError || !deleted || deleted.length === 0) {
          setSubmitError(t('common.deleteError', { error: deleteError?.message ?? t('common.nothingChanged') }));
          return;
        }
        if (fileUrl) {
          const { error: storageError } = await supabase.storage.from('certifications').remove([fileUrl]);
          if (storageError) console.warn('Certification file cleanup failed:', storageError.message);
        }
        router.back();
      },
    });
  }

  if (loadError !== null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
          <ThemedText type="default">{t('common.loadError', { error: loadError })}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (loading) {
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
        <KeyboardAvoidingScreen>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {isVerified && (
              <ThemedText type="small" themeColor="textSecondary">
                {t('certifications.verifiedEditNotice')}
              </ThemedText>
            )}

            {signedPhotoUrl && (
              <Pressable onPress={() => setViewerOpen(true)}>
                <JobPhoto uri={signedPhotoUrl} style={styles.photo} />
              </Pressable>
            )}

            <FormField
              label={t('certifications.titleLabel')}
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder={t('certifications.titlePlaceholder')}
              error={fieldErrors.title}
            />

            <FormField
              label={t('certifications.orgLabel')}
              value={issuingOrg}
              onChangeText={setIssuingOrg}
            />

            {submitError && (
              <ThemedText type="small" style={styles.error}>
                {submitError}
              </ThemedText>
            )}

            <PrimaryButton
              label={submitting ? t('certifications.saving') : t('certifications.save')}
              onPress={handleSave}
              loading={submitting}
            />

            <Pressable onPress={handleDelete} style={styles.deleteButton}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                {t('certifications.remove')}
              </ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingScreen>
      </SafeAreaView>

      {signedPhotoUrl && (
        <PhotoViewer
          photos={[signedPhotoUrl]}
          initialIndex={0}
          visible={viewerOpen}
          onClose={() => setViewerOpen(false)}
        />
      )}
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
  photo: {
    width: 160,
    height: 160,
    borderRadius: Spacing.two,
  },
  deleteButton: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  deleteText: {
    color: '#d64545',
  },
  error: {
    color: '#d64545',
  },
});
