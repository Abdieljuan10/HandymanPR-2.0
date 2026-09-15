import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const DEVICE_ID_KEY = 'handymanpr_device_id';

// expo-notifications' native module was removed from Expo Go on Android as
// of SDK 53 — merely importing the package (never mind calling anything)
// throws there, so it can't be a static top-level `import` in this file or
// in _layout.tsx; every use has to be a require() gated behind this check.
// A dev/production build (ExecutionEnvironment.Bare or .Standalone) is
// unaffected; this only skips the Expo Go "store client" case.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// Silently does nothing in Expo Go, on a simulator/emulator, before an EAS
// project is linked (no projectId yet), or if the user declines the
// permission prompt — none of those are errors worth surfacing to a
// screen, they just mean this device won't receive pushes yet.
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (isExpoGo) return;
  if (!Device.isDevice) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay deferred, see isExpoGo comment above
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  const deviceId = await getOrCreateDeviceId();

  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      device_id: deviceId,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
    },
    { onConflict: 'user_id,device_id' }
  );
}
