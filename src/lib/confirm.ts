import { Alert, Platform } from 'react-native';

// react-native-web ships Alert as a literal no-op:
//
//   class Alert { static alert() {} }
//
// so on web every Alert.alert silently does nothing. For a CONFIRM dialog
// that's severe -- no dialog appears, and the action behind it is never
// reached, with no error anywhere. That made swipe-to-delete on the Messages
// screens look completely dead in a browser, while swipe-to-archive (which
// calls its handler directly, with no confirm step) kept working. For an
// informational alert it's milder: the message just never shows.
//
// Since the client tests client-side flows on web and the handyman side on a
// device, neither half can rely on Alert directly. Everything in the app goes
// through these three helpers instead.
//
// window.confirm/window.alert are plain, but they're real: they block, and
// confirm returns a boolean. Swap them for themed modals during the visual
// polish pass if wanted -- call sites won't need to change.

type NotifyOptions = {
  title: string;
  message: string;
};

type ConfirmOptions = NotifyOptions & {
  confirmLabel: string;
  cancelLabel: string;
  /** Marks the confirm button destructive on iOS. Defaults to false. */
  destructive?: boolean;
};

/** Informational message, single dismiss. */
export function notify({ title, message }: NotifyOptions) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

/**
 * Two-button confirm resolving to the user's answer. Resolves false if the
 * dialog is dismissed without choosing (Android back / tap-outside), so an
 * awaiting caller can't hang.
 */
export function confirmAsync({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) }
    );
  });
}

/** Callback-style destructive confirm, for the common delete/discard case. */
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmOptions & { onConfirm: () => void }) {
  void confirmAsync({ title, message, confirmLabel, cancelLabel, destructive: true }).then(
    (confirmed) => {
      if (confirmed) onConfirm();
    }
  );
}
