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
      <Stack.Screen name="portfolio/index" options={{ title: t('headers.portfolio') }} />
      <Stack.Screen name="portfolio/new" options={{ title: t('headers.newProject') }} />
      <Stack.Screen name="portfolio/[id]/index" options={{ title: t('headers.editProject') }} />
      <Stack.Screen name="certifications" options={{ title: t('headers.certifications') }} />
      <Stack.Screen name="certifications/[id]" options={{ title: t('headers.editCertification') }} />
      <Stack.Screen name="client/[id]" options={{ title: t('headers.clientProfile') }} />
      <Stack.Screen name="profile-settings" options={{ title: t('headers.settings') }} />
    </Stack>
  );
}
