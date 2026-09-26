import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredTabBarButton } from '@/components/centered-tab-bar-button';
import { FloatingTabBarBackground } from '@/components/floating-tab-bar-background';
import { TabBarIcon } from '@/components/tab-bar-icon';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Visual pass 2026-09-24, option "Nav B -- Floating Translucent" -- see the
// client tab layout for the full rationale (identical treatment here).
export default function HandymanTabsLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : (scheme ?? 'light')];
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        tabBarBackground: () => <FloatingTabBarBackground />,
        tabBarButton: (props) => <CenteredTabBarButton {...props} />,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: insets.bottom + 16,
          height: 68,
          borderRadius: Radius.xlarge,
          borderTopWidth: Platform.OS === 'android' ? StyleSheet.hairlineWidth : 0,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: 'hidden',
          // Android draws an elevation shadow UNDER the view, and this bar is
          // translucent, so the shadow showed through as grey bands/edges
          // (phone test 2026-09-24). Android gets a hairline border instead.
          elevation: Platform.OS === 'android' ? 0 : 8,
          borderWidth: Platform.OS === 'android' ? StyleSheet.hairlineWidth : 0,
          // Was a fixed 'rgba(0,0,0,0.12)' -- invisible against the Android
          // dark-mode fill (near-black border on a near-black background).
          // theme.border already exists precisely for this (subtle,
          // theme-aware divider), and this Android-only border is the one
          // place this bar draws a real border, so no other screen is
          // touched by using it here. Refinement 2026-09-26.
          borderColor: colors.border,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 18,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.handymanJobs'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="home" focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="my-bids"
        options={{
          title: t('tabs.myBids'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="pricetag" focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="chatbubble" focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="person" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
