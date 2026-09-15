import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { useSession } from '@/providers/session-provider';

export default function ClientProfileScreen() {
  const { t } = useTranslation();
  const { session } = useSession();

  return (
    <PlaceholderScreen
      title={t('clientProfile.title')}
      description={t('clientProfile.description', { email: session?.user.email })}>
      <Link href="/profile-settings" asChild>
        <PrimaryButton label={t('common.settings')} variant="secondary" />
      </Link>
    </PlaceholderScreen>
  );
}
