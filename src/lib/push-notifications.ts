import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const DEVICE_ID_KEY = 'handymanpr_device_id';

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// Silently does nothing on a simulator/emulator, before an EAS project is
// linked (no projectId yet), or if the user declines the permission prompt
// — none of those are errors worth surfacing to a screen, they just mean
// this device won't receive pushes yet.
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;

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
