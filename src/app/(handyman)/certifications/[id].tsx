import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { JobPhoto } from '@/components/job-photo';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
      .then(async ({ data }: { data: CertificationRow | null }) => {
        if (!isMounted || !data) return;
        setTitle(data.title);
        setIssuingOrg(data.issuing_org ?? '');
        setIsVerified(data.is_verified);
        setFileUrl(data.file_url);

        if (data.file_url) {
          const { data: signed } = await supabase.storage
            .from('certifications')
            .createSignedUrl(data.file_url, 3600);
          if (isMounted && signed) setSignedPhotoUrl(signed.signedUrl);
        }

        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

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
    Alert.alert(t('certifications.removeConfirmTitle'), t('certifications.removeConfirmMessage'), [
      { text: t('certifications.cancel'), style: 'cancel' },
      {
        text: t('certifications.remove'),
        style: 'destructive',
        onPress: async () => {
          if (fileUrl) {
            await supabase.storage.from('certifications').remove([fileUrl]);
          }
          await supabase.from('handyman_certifications').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  if (loading) {
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
        <KeyboardAvoidingScreen>
          <ScrollView contentContainerStyle={styles.scrollContent}>
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
