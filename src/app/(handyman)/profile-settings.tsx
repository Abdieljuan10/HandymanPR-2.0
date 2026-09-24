import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { signOutAndUnregister } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

type SubscriptionRow = {
  is_subscribed: boolean;
  subscription_expires_at: string | null;
  is_promoted: boolean;
  promotion_expires_at: string | null;
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Matches the exact condition enforce_bid_insert()/jobs_select use for the
// 15-minute free-tier head start, and browse.tsx's isPromotedNow() for
// promotion -- this screen shows whether the perk actually applies right
// now, not just the raw admin-set flag, which can lag past its own
// expiration date since nothing clears it automatically.
function isActive(flag: boolean, expiresAt: string | null): boolean {
  return flag && (expiresAt === null || Date.parse(expiresAt) > Date.now());
}

export default function HandymanSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetch on focus, not just mount: this is admin-managed via Table
  // Editor today (see supabase/README.md), so it can change while the
  // handyman has the app open, and Settings is exactly where they'd come
  // back to check.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let isMounted = true;

      supabase
        .from('handyman_profiles')
        .select('is_subscribed, subscription_expires_at, is_promoted, promotion_expires_at')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            console.error('Failed to load subscription status:', error.message);
            setLoadError(error.message);
            return;
          }
          setLoadError(null);
          setSubscription((data as SubscriptionRow | null) ?? null);
        });

      return () => {
        isMounted = false;
      };
    }, [session])
  );

  const subscribed = subscription ? isActive(subscription.is_subscribed, subscription.subscription_expires_at) : false;
  const promoted = subscription ? isActive(subscription.is_promoted, subscription.promotion_expires_at) : false;

  return (
    <PlaceholderScreen title={t('common.settings')}>
      <ThemedText type="smallBold">{t('handymanSettings.subscriptionTitle')}</ThemedText>

      {loadError !== null ? (
        <ThemedText type="small" style={styles.error}>
          {t('common.loadError', { error: loadError })}
        </ThemedText>
      ) : subscription === undefined ? (
        <ThemedText type="default">{t('common.loading')}</ThemedText>
      ) : (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="default" themeColor={subscribed ? 'tint' : 'textSecondary'}>
            {subscribed ? t('handymanSettings.subscribed') : t('handymanSettings.free')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subscribed
              ? subscription?.subscription_expires_at
                ? t('handymanSettings.subscriptionExpires', {
                    date: formatDate(subscription.subscription_expires_at),
                  })
                : t('handymanSettings.subscriptionNoExpiration')
              : t('handymanSettings.freeDescription')}
          </ThemedText>

          {promoted && (
            <View style={styles.promotionRow}>
              <ThemedText type="smallBold" themeColor="tint">
                {t('handymanSettings.promoted')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {subscription?.promotion_expires_at
                  ? t('handymanSettings.promotionExpires', { date: formatDate(subscription.promotion_expires_at) })
                  : t('handymanSettings.promotionNoExpiration')}
              </ThemedText>
            </View>
          )}

          <ThemedText type="small" themeColor="textSecondary" style={styles.adminNote}>
            {t('handymanSettings.adminManaged')}
          </ThemedText>
        </ThemedView>
      )}

      <ThemedText type="smallBold">{t('common.language')}</ThemedText>
      <LanguageToggle />
      <PrimaryButton
        label={t('common.changePassword')}
        variant="secondary"
        onPress={() => router.push('/change-password')}
      />
      <PrimaryButton label={t('common.logOut')} onPress={signOutAndUnregister} />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  promotionRow: {
    marginTop: Spacing.one,
    gap: Spacing.half,
  },
  adminNote: {
    marginTop: Spacing.two,
  },
  error: {
    color: '#d64545',
  },
});
