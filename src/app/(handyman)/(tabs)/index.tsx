import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function HandymanJobFeedScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen title={t('handymanJobFeed.title')} description={t('handymanJobFeed.description')} />
  );
}
