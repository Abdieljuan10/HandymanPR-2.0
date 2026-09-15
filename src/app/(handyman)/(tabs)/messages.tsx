import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function HandymanMessagesScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('messages.title')} description={t('messages.handymanDescription')} />;
}
