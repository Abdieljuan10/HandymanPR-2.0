import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { FormField } from '@/components/form-field';
import { useTheme } from '@/hooks/use-theme';

type PasswordFieldProps = Omit<React.ComponentProps<typeof FormField>, 'secureTextEntry' | 'rightElement'>;

// A FormField with a show/hide eye toggle, used everywhere a password is
// typed: sign-in, both signup screens (new + confirm), and Settings' change
// password screen. Wraps FormField instead of duplicating its styling.
export function PasswordField(props: PasswordFieldProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <FormField
      {...props}
      secureTextEntry={!visible}
      rightElement={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'common.hidePassword' : 'common.showPassword')}>
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
        </Pressable>
      }
    />
  );
}
