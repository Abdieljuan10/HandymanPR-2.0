import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredTabBarButton } from '@/components/centered-tab-bar-button';
import { CenterPostJobButton } from '@/components/center-post-job-button';
import { FloatingTabBarBackground } from '@/components/floating-tab-bar-background';
import { TabBarIcon } from '@/components/tab-bar-icon';
import { Colors, Radius } from '@/constants/theme';
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
          borderRadius: Radius.xlarge,
          borderTopWidth: Platform.OS === 'android' ? StyleSheet.hairlineWidth : 0,
          paddingTop: 0,
          paddingBottom: 0,
          // Was 'hidden'. The center Post-a-Job button (CenterPostJobButton)
          // deliberately rises above this bar's own top edge -- 'hidden'
          // would clip exactly that part off. FloatingTabBarBackground now
          // carries its own borderRadius (see that file), so the bar still
          // reads as a rounded pill without this container clipping it.
          overflow: 'visible',
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
      {/* Rendered order = visual order in the bar. Route names/files are
          unchanged (post-job is still exactly the same screen/route) --
          only its position in this list moved, from 2nd to 3rd (center of
          5), per the redesign. */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.clientHome'),
          tabBarIcon: ({ focused }) => <TabBarIcon name="home" focused={focused} />,
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
        name="post-job"
        options={{
          title: t('tabs.postJob'),
          // Overrides screenOptions.tabBarButton (CenteredTabBarButton) for
          // this one screen only -- the other four tabs are untouched. No
          // tabBarIcon here: CenterPostJobButton draws its own icon+label
          // and ignores the children react-navigation would otherwise pass.
          tabBarButton: (props) => <CenterPostJobButton {...props} />,
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
