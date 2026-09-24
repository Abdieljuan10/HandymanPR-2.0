import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredTabBarButton } from '@/components/centered-tab-bar-button';
import { FloatingTabBarBackground } from '@/components/floating-tab-bar-background';
import { TabBarIcon } from '@/components/tab-bar-icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Visual pass 2026-09-24, option "Nav B -- Floating Translucent": inset
// from the edges, rounded, blurred background (FloatingTabBarBackground)
// behind it, active tab's icon gets a soft tint pill (TabBarIcon). See
// TODO.md for the Android blur caveat and the bottom-padding follow-up
// every tab screen's scrollable content needs now that the bar floats
// instead of taking up its own row in the layout.
export default function ClientTabsLayout() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : (scheme ?? 'light')];
  // The bar is position:'absolute' now, so it no longer reserves its own row
  // in the layout and its default paddingBottom (which react-navigation
  // would normally set to insets.bottom) is overridden to 0 below -- this
  // adds that same clearance back as the bar's floating offset instead, so
  // it sits above the home indicator / gesture bar, not on top of it.
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
          borderRadius: 24,
          borderTopWidth: Platform.OS === 'android' ? StyleSheet.hairlineWidth : 0,
          paddingTop: 0,
          paddingBottom: 0,
          overflow: 'hidden',
          // Android draws an elevation shadow UNDER the view, and this bar is
          // translucent, so the shadow showed through as grey bands/edges
          // (phone test 2026-09-24). Android gets a hairline border instead.
          elevation: Platform.OS === 'android' ? 0 : 8,
          borderWidth: Platform.OS === 'android' ? StyleSheet.hairlineWidth : 0,
          borderColor: 'rgba(0,0,0,0.12)',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.clientHome'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="home" focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="post-job"
        options={{
          title: t('tabs.postJob'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="add-circle" focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="browse"
        options={{
          title: t('tabs.browse'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="search" focused={focused} />,
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
