import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function ClientLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]/index" options={{ title: t('headers.jobDetails') }} />
      <Stack.Screen name="job/[id]/edit" options={{ title: t('headers.editJob') }} />
      <Stack.Screen name="handyman/[id]/index" options={{ title: t('headers.handymanProfile') }} />
      <Stack.Screen name="handyman/[id]/project/[projectId]" options={{ title: t('headers.portfolio') }} />
      <Stack.Screen name="invite/[handymanId]/index" options={{ title: t('headers.inviteToQuote') }} />
      <Stack.Screen name="invite/[handymanId]/new" options={{ title: t('headers.newPrivateJob') }} />
      <Stack.Screen name="conversation/[id]/index" options={{ title: t('headers.chat') }} />
      <Stack.Screen name="profile-settings" options={{ title: t('headers.settings') }} />
      <Stack.Screen name="change-password" options={{ title: t('headers.changePassword') }} />
    </Stack>
  );
}
