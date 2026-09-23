import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/language-toggle';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { signOutAndUnregister } from '@/lib/push-notifications';

export default function HandymanSettingsScreen() {
  const { t } = useTranslation();

  return (
    <PlaceholderScreen title={t('common.settings')}>
      <ThemedText type="smallBold">{t('common.language')}</ThemedText>
      <LanguageToggle />
      <PrimaryButton label={t('common.logOut')} onPress={signOutAndUnregister} />
    </PlaceholderScreen>
  );
}
