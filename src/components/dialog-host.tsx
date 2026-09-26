import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { registerDialogPresenter, type DialogRequest } from '@/lib/confirm';

// The app's themed replacement for Alert.alert / window.confirm (visual pass
// 2026-09-24). Mounted once in the root layout, above the navigator, so a
// dialog survives the screen behind it navigating away (e.g. notify() then
// router.back(), same as an OS alert). Requests arriving while one is open
// queue up and show in order. Rendered in a Modal rather than an overlay
// View so it also sits above native-stack modal screens.
export function DialogHost() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  // Keeps the last dialog's content rendered while the Modal fades out.
  const [shown, setShown] = useState<DialogRequest | null>(null);

  useEffect(
    () => registerDialogPresenter((request) => setQueue((q) => [...q, request])),
    []
  );

  const current = queue[0] ?? null;
  if (current && current !== shown) setShown(current);

  const scale = useSharedValue(0.9);
  useEffect(() => {
    if (!current) return;
    scale.value = 0.9;
    scale.value = withSpring(1, { mass: 0.6, damping: 14, stiffness: 220 });
  }, [current, scale]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function close(confirmed: boolean) {
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(confirmed);
    else current.resolve();
    setQueue((q) => q.slice(1));
  }

  const confirmColor =
    shown?.kind === 'confirm' && shown.destructive ? theme.error : theme.tint;

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close(false)}>
      <View style={styles.backdropContainer}>
        <Pressable
          style={styles.backdrop}
          onPress={() => close(false)}
          accessibilityLabel={shown?.kind === 'confirm' ? shown.cancelLabel : t('common.ok')}
        />
        {shown && (
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: isDark ? theme.backgroundElement : theme.background },
              cardStyle,
            ]}
            accessibilityRole="alert">
            {/* Was type="subtitle" (32/44) with a style override forcing it
                down to 20/26 -- sectionHeading (18/600) is the real token for
                this size now, no override needed. */}
            <ThemedText type="sectionHeading">{shown.title}</ThemedText>
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContent}>
              <ThemedText type="default" themeColor="textSecondary">
                {shown.message}
              </ThemedText>
            </ScrollView>

            <View style={styles.buttons}>
              {shown.kind === 'confirm' && (
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: isDark ? theme.backgroundSelected : theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                  onPress={() => close(false)}>
                  <ThemedText type="smallBold" style={styles.buttonLabel}>
                    {shown.cancelLabel}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.button, { backgroundColor: confirmColor }, pressed && styles.pressed]}
                onPress={() => close(true)}>
                <ThemedText type="smallBold" style={[styles.buttonLabel, styles.confirmLabel]}>
                  {shown.kind === 'confirm' ? shown.confirmLabel : t('common.ok')}
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: Radius.xlarge,
    padding: Spacing.four,
    gap: Spacing.three,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  messageScroll: {
    flexGrow: 0,
  },
  messageContent: {
    flexGrow: 0,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A long label ("Publicar de Todas Formas") wraps to two lines in the
  // half-width button; without this the wrapped lines sit left-aligned.
  buttonLabel: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  confirmLabel: {
    color: '#ffffff',
  },
});
