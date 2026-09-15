import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function ClientMessagesScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('messages.title')} description={t('messages.clientDescription')} />;
}
