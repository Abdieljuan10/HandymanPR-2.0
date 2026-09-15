import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function MyBidsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('tabs.myBids')} description={t('myBids.description')} />;
}
