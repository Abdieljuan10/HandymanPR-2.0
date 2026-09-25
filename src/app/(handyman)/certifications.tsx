import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { compressJobPhoto } from '@/lib/job-photos';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type Certification = {
  id: string;
  title: string;
  issuing_org: string | null;
  is_verified: boolean;
};

type FieldErrors = {
  title?: string;
  photo?: string;
};

export default function CertificationsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [issuingOrg, setIssuingOrg] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    supabase
      .from('handyman_certifications')
      .select('id, title, issuing_org, is_verified')
      .eq('handyman_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) setSubmitError(error.message);
        setCertifications(data ?? []);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;

    setPhoto(result.assets[0]);
    if (fieldErrors.photo) setFieldErrors((prev) => ({ ...prev, photo: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = t('certifications.errors.title');
    if (!photo) errors.photo = t('certifications.errors.photo');
    return errors;
  }

  async function handleAdd() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || !photo || !session) return;

    setSubmitting(true);

    try {
      const compressed = await compressJobPhoto(photo.uri, photo.width, photo.height);
      const response = await fetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      // The certifications bucket is private (only the owning handyman can
      // read it -- see storage_bidding_messaging.sql) so there's no public
      // URL to store. We keep the storage path itself; a signed URL would
      // need generating fresh each time it's viewed, which this screen
      // doesn't need since it never displays the file back.
      const path = `${session.user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('certifications')
        .upload(path, arrayBuffer, { contentType: compressed.mimeType });
      if (uploadError) throw new Error(uploadError.message);

      const { data: inserted, error: insertError } = await supabase
        .from('handyman_certifications')
        .insert({
          handyman_id: session.user.id,
          title: title.trim(),
          issuing_org: issuingOrg.trim() || null,
          file_url: path,
        })
        .select('id, title, issuing_org, is_verified')
        .single();

      if (insertError || !inserted) throw new Error(insertError?.message);

      setCertifications((prev) => [inserted, ...prev]);
      setTitle('');
      setIssuingOrg('');
      setPhoto(null);
    } catch (addError) {
      setSubmitError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setSubmitting(false);
    }
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
            <ThemedText type="default" themeColor="textSecondary">
              {t('certifications.intro')}
            </ThemedText>

            {certifications.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('certifications.empty')}
              </ThemedText>
            ) : (
              certifications.map((certification) => (
                <Link
                  key={certification.id}
                  href={{ pathname: '/certifications/[id]', params: { id: certification.id } }}
                  asChild>
                  <Pressable style={styles.card}>
                    <View style={styles.cardText}>
                      <ThemedText type="smallBold">{certification.title}</ThemedText>
                      {certification.issuing_org && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {certification.issuing_org}
                        </ThemedText>
                      )}
                      <ThemedText type="small" themeColor={certification.is_verified ? 'tint' : 'textSecondary'}>
                        {certification.is_verified
                          ? t('handymanPublicProfile.verified')
                          : t('certifications.pending')}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('certifications.edit')}
                    </ThemedText>
                  </Pressable>
                </Link>
              ))
            )}

            <View style={[styles.divider, { backgroundColor: theme.backgroundElement }]} />

            <ThemedText type="smallBold">{t('certifications.addTitle')}</ThemedText>

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

            <ThemedText type="smallBold">{t('certifications.photoLabel')}</ThemedText>
            {photo && <Image source={{ uri: photo.uri }} style={styles.photoPreview} />}
            {fieldErrors.photo && (
              <ThemedText type="small" style={styles.error}>
                {fieldErrors.photo}
              </ThemedText>
            )}
            <PrimaryButton
              label={photo ? t('certifications.changePhoto') : t('certifications.choosePhoto')}
              variant="secondary"
              onPress={handlePickPhoto}
            />

            {submitError && (
              <ThemedText type="small" style={styles.error}>
                {submitError}
              </ThemedText>
            )}

            <PrimaryButton
              label={submitting ? t('certifications.adding') : t('certifications.add')}
              onPress={handleAdd}
              loading={submitting}
            />
          </ScrollView>
        </KeyboardAvoidingScreen>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  cardText: {
    gap: Spacing.half,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.two,
  },
  photoPreview: {
    width: 104,
    height: 104,
    borderRadius: Spacing.two,
  },
  error: {
    color: '#d64545',
  },
});
