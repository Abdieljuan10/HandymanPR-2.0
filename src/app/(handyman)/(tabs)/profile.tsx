import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { useSession } from '@/providers/session-provider';

export default function HandymanProfileScreen() {
  const { t } = useTranslation();
  const { session } = useSession();

  return (
    <PlaceholderScreen
      title={t('handymanProfile.title')}
      description={t('handymanProfile.description', { email: session?.user.email })}>
      <Link href="/trades" asChild>
        <PrimaryButton label={t('handymanProfile.editTrades')} />
      </Link>
      <Link href="/pueblos" asChild>
        <PrimaryButton label={t('handymanProfile.editPueblos')} />
      </Link>
      <Link href="/profile-settings" asChild>
        <PrimaryButton label={t('common.settings')} variant="secondary" />
      </Link>
    </PlaceholderScreen>
  );
}
