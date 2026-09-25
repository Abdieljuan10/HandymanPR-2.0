import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
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
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

// Same shape as the handyman side's profile-edit.tsx (avatar upload,
// unsaved-changes guard, everything) minus the fields client_profiles
// doesn't have -- no bio/years/social links for a client, just a name and
// a photo.
const AVATAR_MAX_DIMENSION = 640;
const AVATAR_COMPRESS_QUALITY = 0.8;

type FieldErrors = {
  fullName?: string;
};

type InitialSnapshot = {
  fullName: string;
};

export default function ClientProfileEditScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useSession();
  // Set right before a successful Save calls router.back() -- lets the
  // unsaved-changes guard below wave that specific navigation through
  // instead of prompting, same pattern as the handyman side.
  const justSavedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatar, setNewAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [initial, setInitial] = useState<InitialSnapshot | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasUnsavedChanges = initial !== null && (fullName !== initial.fullName || newAvatar !== null);

  usePreventRemove(hasUnsavedChanges, ({ data }) => {
    if (justSavedRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    confirmDestructive({
      title: t('profileEdit.unsavedTitle'),
      message: t('profileEdit.unsavedMessage'),
      confirmLabel: t('profileEdit.discard'),
      cancelLabel: t('profileEdit.keepEditing'),
      onConfirm: () => navigation.dispatch(data.action),
    });
  });

  useEffect(() => {
    if (!session) return;
    let isMounted = true;

    supabase
      .from('client_profiles')
      .select('full_name, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setSubmitError(error.message);
          setLoading(false);
          return;
        }
        const loadedName = data?.full_name ?? '';
        setFullName(loadedName);
        setAvatarUrl(data?.avatar_url ?? null);
        setInitial({ fullName: loadedName });
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    setNewAvatar(result.assets[0]);
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.fullName = t('profileEdit.errors.name');
    return errors;
  }

  // Same avatars bucket, same timestamped-filename approach as the handyman
  // side (see that file's comment for why: a fixed filename + remove-then-
  // upload hit "resource already exists" on a second upload, unchecked
  // remove() result, no evidence it reliably took effect before the next
  // upload reused the same key). Storage's own RLS is keyed on
  // auth.uid() only, not role, so this bucket already works for either.
  async function uploadAvatarIfNeeded(userId: string): Promise<string | null> {
    if (!newAvatar) return avatarUrl;

    const context = ImageManipulator.manipulate(newAvatar.uri);
    if (
      newAvatar.width > 0 &&
      newAvatar.height > 0 &&
      (newAvatar.width > AVATAR_MAX_DIMENSION || newAvatar.height > AVATAR_MAX_DIMENSION)
    ) {
      if (newAvatar.height > newAvatar.width) {
        context.resize({ height: AVATAR_MAX_DIMENSION });
      } else {
        context.resize({ width: AVATAR_MAX_DIMENSION });
      }
    }
    const imageRef = await context.renderAsync();
    const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: AVATAR_COMPRESS_QUALITY });

    const response = await fetch(result.uri);
    const arrayBuffer = await response.arrayBuffer();
    const path = `${userId}/avatar-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, { contentType: 'image/jpeg' });
    if (uploadError) {
      const extra = JSON.stringify(uploadError, Object.getOwnPropertyNames(uploadError));
      throw new Error(`Avatar upload failed: ${uploadError.message} | ${extra}`);
    }

    const oldPath = avatarUrl?.split('/avatars/')[1]?.split('?')[0];
    if (oldPath) {
      const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath]);
      if (removeError) console.error('Failed to remove old avatar:', removeError.message);
    }

    const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
    return publicUrl.publicUrl;
  }

  async function handleSave() {
    const errors = validate();
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length > 0) return;
    if (!session) return;

    setSubmitting(true);

    let nextAvatarUrl: string | null;
    try {
      nextAvatarUrl = await uploadAvatarIfNeeded(session.user.id);
    } catch (avatarError) {
      setSubmitError(avatarError instanceof Error ? avatarError.message : String(avatarError));
      setSubmitting(false);
      return;
    }

    const { data: updated, error } = await supabase
      .from('client_profiles')
      .update({ full_name: fullName.trim(), avatar_url: nextAvatarUrl })
      .eq('id', session.user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setSubmitError(error.message);
      setSubmitting(false);
      return;
    }
    // Postgres RLS lets an UPDATE that matches zero permitted rows "succeed"
    // with no error and no rows changed -- check for a returned row too.
    if (!updated) {
      setSubmitError(t('profileEdit.notAllowed'));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    justSavedRef.current = true;
    router.back();
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

  const displayAvatarUri = newAvatar?.uri ?? avatarUrl ?? undefined;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <KeyboardAvoidingScreen>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Pressable style={styles.avatarWrapper} onPress={handlePickAvatar}>
              {displayAvatarUri ? (
                <Image source={{ uri: displayAvatarUri }} style={styles.avatar} />
              ) : (
                <View
                  style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="title" themeColor="textSecondary">
                    {fullName.trim().charAt(0).toUpperCase() || '?'}
                  </ThemedText>
                </View>
              )}
              <ThemedText type="linkPrimary">
                {avatarUrl || newAvatar ? t('profileEdit.changePhoto') : t('profileEdit.addPhoto')}
              </ThemedText>
            </Pressable>

            <FormField
              label={t('profileEdit.nameLabel')}
              value={fullName}
              onChangeText={(value) => {
                setFullName(value);
                if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              error={fieldErrors.fullName}
            />

            {submitError && (
              <ThemedText type="small" style={styles.error}>
                {submitError}
              </ThemedText>
            )}

            <PrimaryButton
              label={submitting ? t('profileEdit.saving') : t('profileEdit.save')}
              onPress={handleSave}
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
  avatarWrapper: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#d64545',
  },
});
