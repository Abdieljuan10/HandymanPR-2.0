import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (matches the pattern already used for job/bid archiving).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { hideConversation } from '@/lib/chat';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ConversationRow = {
  id: string;
  created_at: string;
  last_message_at: string;
  jobs: { title: string } | null;
  handyman_profiles: { full_name: string } | null;
};

type HideRow = { conversation_id: string; hidden_at: string };

export default function ClientMessagesScreen() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  // A conversation only actually disappears from the list -- deleting it
  // never touches the other party's copy or Storage on its own (see
  // job_conversation_hides). It resurfaces on its own if a new message
  // arrives after hidden_at, so this is keyed by conversation id, not a
  // one-way removal from `conversations`.
  const [hides, setHides] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data }, { data: hidesData }] = await Promise.all([
      supabase
        .from('job_conversations')
        .select('id, created_at, last_message_at, jobs(title), handyman_profiles(full_name)')
        .eq('client_id', session.user.id)
        .order('last_message_at', { ascending: false }),
      supabase.from('job_conversation_hides').select('conversation_id, hidden_at').eq('user_id', session.user.id),
    ]);
    setConversations((data as unknown as ConversationRow[] | null) ?? []);
    const hideMap: Record<string, string> = {};
    for (const row of (hidesData as HideRow[] | null) ?? []) {
      hideMap[row.conversation_id] = row.hidden_at;
    }
    setHides(hideMap);
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

  async function handleHide(conversationId: string) {
    if (!session) return;
    setHides((prev) => ({ ...prev, [conversationId]: new Date().toISOString() }));
    const { error } = await hideConversation(conversationId, session.user.id);
    if (error) {
      console.error('Failed to hide conversation:', error);
      setHides((prev) => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    }
  }

  function confirmHide(conversationId: string) {
    Alert.alert(t('messages.hideConfirmTitle'), t('messages.hideConfirmMessage'), [
      { text: t('jobDelete.cancelDialog'), style: 'cancel' },
      { text: t('messages.hide'), style: 'destructive', onPress: () => handleHide(conversationId) },
    ]);
  }

  // Date.parse, not a string compare: PostgREST returns timestamps as
  // "...+00:00" while the optimistic local value is Date.toISOString()'s
  // "...Z", so comparing them as text gives the wrong answer for anything
  // landing in the same second as the delete.
  const visible = (conversations ?? []).filter((item) => {
    const hiddenAt = hides[item.id];
    if (!hiddenAt) return true;
    return Date.parse(item.last_message_at) > Date.parse(hiddenAt);
  });

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
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('conversation.listEmpty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <Swipeable
                renderRightActions={(_progress, _drag, swipeable) => (
                  <Pressable
                    style={styles.hideAction}
                    onPress={() => {
                      swipeable.close();
                      confirmHide(item.id);
                    }}>
                    <ThemedText type="smallBold" style={styles.hideActionText}>
                      {t('messages.hide')}
                    </ThemedText>
                  </Pressable>
                )}>
                <Link href={`/conversation/${item.id}`} asChild>
                  <Pressable>
                    <ThemedView type="backgroundElement" style={styles.card}>
                      <ThemedText type="default">{item.handyman_profiles?.full_name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.jobs?.title} ·{' '}
                        {t('conversation.startedAgo', { time: formatRelativeTime(item.last_message_at, t) })}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                </Link>
              </Swipeable>
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
    marginBottom: Spacing.two,
  },
  hideAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: '#d64545',
  },
  hideActionText: {
    color: '#ffffff',
  },
});
