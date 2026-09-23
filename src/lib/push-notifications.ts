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
export async function registerForPushNotifications(): Promise<void> {
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

  // Not a direct upsert: register_push_token() also removes any OTHER
  // account's row for this device/token (20261013000000). A phone's token
  // has exactly one owner -- whoever logged in on it last -- otherwise every
  // account that ever logged in here keeps receiving pushes on it.
  const { error } = await supabase.rpc('register_push_token', {
    p_device_id: deviceId,
    p_expo_push_token: expoPushToken,
    p_platform: Platform.OS,
  });

  // Every earlier early-return above is an intentional no-op (Expo Go,
  // simulator, no EAS project yet, permission declined) — this one isn't.
  // Getting this far means we have a real token and it still didn't save,
  // which is worth knowing about instead of silently looking like "no push
  // support" from the outside.
  if (error) {
    console.error('Failed to save push token:', error.message);
  }
}

// Stops this device receiving the current account's pushes. Must run
// BEFORE supabase.auth.signOut(): deleting the row needs the session to pass
// push_tokens' own-rows-only RLS. Reads the device id without creating one
// -- no stored id means this device never registered, so nothing to remove.
export async function unregisterPushToken(): Promise<void> {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) return;
  const { error } = await supabase.from('push_tokens').delete().eq('device_id', deviceId);
  if (error) console.error('Failed to remove push token on sign-out:', error.message);
}

// The one way to log out. A bare supabase.auth.signOut() left this
// device's push token registered, so a logged-out phone kept receiving (and
// displaying) that account's notifications.
export async function signOutAndUnregister(): Promise<void> {
  try {
    await unregisterPushToken();
  } catch (err) {
    // Never block logging out on this -- if it failed (e.g. offline), the
    // next login on this device reclaims the token via register_push_token.
    console.error('Failed to remove push token on sign-out:', err);
  }
  await supabase.auth.signOut();
}

// Every notification payload (see 20260922000000_push_notifications_send.sql
// and later migrations) carries either a conversation_id (new_message) or a
// job_id (every other type) — mapping generically on whichever key is
// present, rather than switching on `type`, means a new notification type
// added server-side deep-links correctly without an app change as long as
// it reuses one of these two keys.
export function getNotificationDeepLink(
  data: unknown
): `/job/${string}` | `/conversation/${string}` | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (typeof record.conversation_id === 'string') {
    return `/conversation/${record.conversation_id}`;
  }
  if (typeof record.job_id === 'string') {
    return `/job/${record.job_id}`;
  }
  return null;
}
