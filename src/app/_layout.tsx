import '@/i18n';

import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { LanguageProvider, useLanguage } from '@/providers/language-provider';
import { SessionProvider, useSession } from '@/providers/session-provider';
import { getNotificationDeepLink, isExpoGo } from '@/lib/push-notifications';

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

// Handles tapping a push notification: reads the deep link out of its data
// payload and navigates there, covering both a tap while the app is already
// running (addNotificationResponseReceivedListener) and one that launched
// the app from cold (getLastNotificationResponseAsync). Only enabled once a
// session exists — with no session, the target route isn't in the mounted
// Stack yet (only the auth screens are). Re-running when `enabled` flips to
// true also means a notification tapped from a logged-out state still
// deep-links once sign-in resolves, since we don't clear it until handled.
function useNotificationDeepLinking(enabled: boolean) {
  // Persists across the effect re-running (e.g. session logout/login), unlike
  // a variable declared inside the effect.
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || isExpoGo) return;

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay deferred, see isExpoGo comment in push-notifications.ts
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    function handleResponse(response: import('expo-notifications').NotificationResponse) {
      // getLastNotificationResponseAsync() and addNotificationResponseReceivedListener()
      // can both fire for the SAME cold-start tap (observed on Android — the response
      // listener also emits once JS finishes initializing, for the very response that
      // getLastNotificationResponseAsync already returned). Without this guard that means
      // router.push() runs twice for one tap, stacking two instances of the target screen.
      // For the conversation screen that crashed for real: both instances' effects build a
      // realtime channel with the identical topic, and RealtimeClient.channel() returns the
      // SAME channel object for a repeated topic rather than a new one — so the second
      // instance's `.on(...)` call lands on a channel the first instance already
      // `.subscribe()`d, which throws.
      const id = response.notification.request.identifier;
      if (id === handledResponseId.current) return;
      handledResponseId.current = id;

      const url = getNotificationDeepLink(response.notification.request.content.data);
      if (url) router.push(url);
    }

    let isCancelled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (isCancelled || !response) return;
      handleResponse(response);
      // Prevents replaying the same deep link on a later cold start that
      // wasn't itself triggered by tapping a notification.
      Notifications.clearLastNotificationResponseAsync();
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      isCancelled = true;
      subscription.remove();
    };
  }, [enabled]);
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

  useNotificationDeepLinking(!isSessionLoading && !isLanguageLoading && !!session);

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
