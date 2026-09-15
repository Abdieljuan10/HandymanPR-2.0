import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LanguageProvider, useLanguage } from '@/providers/language-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { isExpoGo } from '@/lib/push-notifications';

SplashScreen.preventAutoHideAsync();

// expo-notifications' native module was removed from Expo Go on Android as
// of SDK 53 — merely IMPORTING the package (even without calling anything)
// runs requireNativeModule('ExpoNotificationsHandlerModule') at that
// module's own top level and throws. So this can't be a static top-level
// `import` like every other module here; it has to be a require() that
// only ever runs once isExpoGo has already been checked. Same reasoning as
// registerForPushNotifications in push-notifications.ts.
if (!isExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay deferred, see comment above
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  // Without this, a notification that arrives while the app is open shows
  // no banner at all by default — this makes foreground notifications
  // behave the same as background ones.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </LanguageProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { session, role, isLoading: isSessionLoading } = useSession();
  const { isLoading: isLanguageLoading } = useLanguage();

  // Keep the native splash screen up (we never call hideAsync until this
  // point) so nobody sees a flash of the wrong screen/language while we
  // figure out the session, role, and saved language preference.
  if (isSessionLoading || isLanguageLoading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="client-sign-up" />
          <Stack.Screen name="handyman-sign-up" />
        </Stack.Protected>

        <Stack.Protected guard={!!session && role === 'client'}>
          <Stack.Screen name="(client)" />
        </Stack.Protected>

        <Stack.Protected guard={!!session && role === 'handyman'}>
          <Stack.Screen name="(handyman)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
