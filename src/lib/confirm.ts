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
// Since 2026-09-24 both helpers render the app's own themed dialog
// (DialogHost, mounted once in the root layout) on every platform, instead
// of the OS popup. Alert / window.alert / window.confirm remain only as the
// fallback for the brief window before DialogHost mounts (splash/loading).

type NotifyOptions = {
  title: string;
  message: string;
};

type ConfirmOptions = NotifyOptions & {
  confirmLabel: string;
  cancelLabel: string;
  /** Styles the confirm button as destructive (red). Defaults to false. */
  destructive?: boolean;
};

export type DialogRequest =
  | (NotifyOptions & { kind: 'notify'; resolve: () => void })
  | (ConfirmOptions & { kind: 'confirm'; resolve: (confirmed: boolean) => void });

let presenter: ((request: DialogRequest) => void) | null = null;

/** Called by DialogHost on mount; returns the unregister function. */
export function registerDialogPresenter(present: (request: DialogRequest) => void) {
  presenter = present;
  return () => {
    if (presenter === present) presenter = null;
  };
}

/** Informational message, single dismiss. */
export function notify({ title, message }: NotifyOptions) {
  if (presenter) {
    presenter({ kind: 'notify', title, message, resolve: () => {} });
    return;
  }

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
  const present = presenter;
  if (present) {
    return new Promise((resolve) => {
      present({ kind: 'confirm', title, message, confirmLabel, cancelLabel, destructive, resolve });
    });
  }

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
