import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function BrowseHandymenScreen() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen title={t('browseHandymen.title')} description={t('browseHandymen.description')} />
  );
}
