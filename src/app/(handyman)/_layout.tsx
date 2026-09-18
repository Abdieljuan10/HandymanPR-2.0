import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function HandymanLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]/index" options={{ title: t('headers.jobDetails') }} />
      <Stack.Screen name="conversation/[id]/index" options={{ title: t('headers.chat') }} />
      <Stack.Screen name="trades" options={{ title: t('headers.yourTrades') }} />
      <Stack.Screen name="pueblos" options={{ title: t('headers.yourPueblos') }} />
      <Stack.Screen name="profile-edit" options={{ title: t('headers.editProfile') }} />
      <Stack.Screen name="portfolio" options={{ title: t('headers.portfolio') }} />
      <Stack.Screen name="certifications" options={{ title: t('headers.certifications') }} />
      <Stack.Screen name="profile-settings" options={{ title: t('headers.settings') }} />
    </Stack>
  );
}
