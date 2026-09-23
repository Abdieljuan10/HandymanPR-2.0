import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
};

// react-native-web ships Alert as a literal no-op:
//
//   class Alert { static alert() {} }
//
// so on web every Alert.alert confirmation silently does nothing -- no dialog,
// no error, and the destructive action behind it is simply never reached. That
// made swipe-to-delete on the Messages screens look completely dead in a
// browser, while swipe-to-archive (which calls its handler directly, with no
// confirm step) kept working. Since the client tests client-side flows on web
// and on a device, a confirm that only works on one of them isn't good enough.
//
// window.confirm is plain, but it's real: it blocks, it returns a boolean, and
// the destructive action actually runs. Swap it for a themed modal if the
// visual polish pass ever wants one -- the call sites won't need to change.
export function confirmDestructive({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmOptions) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
