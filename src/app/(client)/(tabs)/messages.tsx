import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ConversationRow = {
  id: string;
  created_at: string;
  jobs: { title: string } | null;
  handyman_profiles: { full_name: string } | null;
};

export default function ClientMessagesScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('job_conversations')
      .select('id, created_at, jobs(title), handyman_profiles(full_name)')
      .eq('client_id', session.user.id)
      .order('created_at', { ascending: false });
    setConversations((data as unknown as ConversationRow[] | null) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      load().then(() => {
        if (!isMounted) return;
      });
      return () => {
        isMounted = false;
      };
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          {t('messages.title')}
        </ThemedText>

        {conversations === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('conversation.listEmpty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Link href={`/conversation/${item.id}`} asChild>
                <Pressable>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    <ThemedText type="default">{item.handyman_profiles?.full_name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.jobs?.title} ·{' '}
                      {t('conversation.startedAgo', { time: formatRelativeTime(item.created_at, t) })}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              </Link>
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
