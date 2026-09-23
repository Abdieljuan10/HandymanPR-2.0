import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (matches the pattern already used for job/bid archiving).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { archiveConversation, hideConversation, unarchiveConversation } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ConversationRow = {
  id: string;
  last_message_at: string;
  jobs: { title: string } | null;
  client_profiles?: { full_name: string } | null;
  handyman_profiles?: { full_name: string } | null;
  job_messages: { count: number }[];
};

type Section = { key: 'main' | 'archived'; data: ConversationRow[] };

// Shared by both Messages tabs -- the only difference between them is which
// column identifies "me" and whose name each row shows.
export function ConversationListScreen({ role }: { role: 'client' | 'handyman' }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  // Deleting a chat never touches the other party's copy -- it's a per-user
  // hide that lifts on its own if a new message arrives after hidden_at, so
  // this is keyed by conversation id, not a one-way removal from
  // `conversations`. hidden_at is server time (hide_conversation()), same
  // clock as last_message_at.
  const [hides, setHides] = useState<Record<string, string>>({});
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const otherParty = role === 'client' ? 'handyman_profiles' : 'client_profiles';
  const myColumn = role === 'client' ? 'client_id' : 'handyman_id';

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data, error }, { data: hidesData }, { data: archivesData }] = await Promise.all([
      supabase
        .from('job_conversations')
        .select(`id, last_message_at, jobs(title), ${otherParty}(full_name), job_messages(count)`)
        .eq(myColumn, session.user.id)
        .order('last_message_at', { ascending: false }),
      supabase.from('job_conversation_hides').select('conversation_id, hidden_at').eq('user_id', session.user.id),
      supabase.from('job_conversation_archives').select('conversation_id').eq('user_id', session.user.id),
    ]);
    if (error) console.error('Failed to load conversations:', error.message);
    setConversations((data as unknown as ConversationRow[] | null) ?? []);
    const hideMap: Record<string, string> = {};
    for (const row of hidesData ?? []) {
      hideMap[row.conversation_id as string] = row.hidden_at as string;
    }
    setHides(hideMap);
    setArchivedIds(new Set((archivesData ?? []).map((row) => row.conversation_id as string)));
  }, [session, otherParty, myColumn]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleHide(item: ConversationRow) {
    // Optimistically hide as of this row's own last_message_at, not the
    // device clock -- guarantees it drops out now, whatever the phone's time.
    setHides((prev) => ({ ...prev, [item.id]: item.last_message_at }));
    const { error } = await hideConversation(item.id);
    if (error) console.error('Failed to delete conversation:', error);
    await load();
  }

  function confirmHide(item: ConversationRow) {
    confirmDestructive({
      title: t('messages.hideConfirmTitle'),
      message: t('messages.hideConfirmMessage'),
      confirmLabel: t('messages.hide'),
      cancelLabel: t('jobDelete.cancelDialog'),
      onConfirm: () => handleHide(item),
    });
  }

  async function handleArchive(conversationId: string) {
    if (!session) return;
    setArchivedIds((prev) => new Set(prev).add(conversationId));
    const { error } = await archiveConversation(conversationId, session.user.id);
    if (error) {
      console.error('Failed to archive conversation:', error);
      setArchivedIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
    }
  }

  async function handleUnarchive(conversationId: string) {
    if (!session) return;
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.delete(conversationId);
      return next;
    });
    const { error } = await unarchiveConversation(conversationId, session.user.id);
    if (error) {
      console.error('Failed to unarchive conversation:', error);
      setArchivedIds((prev) => new Set(prev).add(conversationId));
    }
  }

  const { sections, archivedCount } = useMemo<{ sections: Section[]; archivedCount: number }>(() => {
    // A conversation row exists as soon as a handyman taps "Message" on a
    // job, before anything is sent -- so a row with no messages isn't a
    // conversation yet, and must not show up (empty) in anyone's list.
    // Date.parse, not a string compare: PostgREST returns "+00:00"
    // timestamps, which don't compare correctly as text against "Z" ones.
    const visible = (conversations ?? []).filter((item) => {
      if ((item.job_messages[0]?.count ?? 0) === 0) return false;
      const hiddenAt = hides[item.id];
      return !hiddenAt || Date.parse(item.last_message_at) > Date.parse(hiddenAt);
    });
    const main = visible.filter((item) => !archivedIds.has(item.id));
    const archived = visible.filter((item) => archivedIds.has(item.id));

    const list: Section[] = main.length > 0 ? [{ key: 'main', data: main }] : [];
    if (showArchived && archived.length > 0) list.push({ key: 'archived', data: archived });
    return { sections: list, archivedCount: archived.length };
  }, [conversations, hides, archivedIds, showArchived]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle">{t('messages.title')}</ThemedText>
          {archivedCount > 0 && (
            <Pressable onPress={() => setShowArchived((prev) => !prev)}>
              <ThemedText type="small" themeColor="textSecondary">
                {showArchived ? t('messages.hideArchived') : t('messages.showArchived', { count: archivedCount })}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {conversations === null ? (
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('conversation.listEmpty')}
              </ThemedText>
            }
            renderSectionHeader={({ section }) =>
              section.key === 'archived' ? (
                <ThemedText type="smallBold" style={styles.sectionHeader}>
                  {t('messages.archivedSection')}
                </ThemedText>
              ) : null
            }
            renderItem={({ item, section }) => {
              const isArchived = section.key === 'archived';
              return (
                <Swipeable
                  renderRightActions={(_progress, _drag, swipeable) => (
                    <View style={styles.swipeActions}>
                      <Pressable
                        style={[styles.swipeAction, isArchived ? styles.unarchiveAction : styles.archiveAction]}
                        onPress={() => {
                          swipeable.close();
                          if (isArchived) {
                            handleUnarchive(item.id);
                          } else {
                            handleArchive(item.id);
                          }
                        }}>
                        <ThemedText type="smallBold" style={styles.swipeActionText}>
                          {t(isArchived ? 'messages.unarchive' : 'messages.archive')}
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.swipeAction, styles.hideAction]}
                        onPress={() => {
                          swipeable.close();
                          confirmHide(item);
                        }}>
                        <ThemedText type="smallBold" style={styles.swipeActionText}>
                          {t('messages.hide')}
                        </ThemedText>
                      </Pressable>
                    </View>
                  )}>
                  <Link href={`/conversation/${item.id}`} asChild>
                    <Pressable>
                      <ThemedView type="backgroundElement" style={styles.card}>
                        <ThemedText type="default">{item[otherParty]?.full_name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.jobs?.title} ·{' '}
                          {t('conversation.startedAgo', { time: formatRelativeTime(item.last_message_at, t) })}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  </Link>
                </Swipeable>
              );
            }}
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  sectionHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  swipeActions: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginLeft: Spacing.one,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: Spacing.two,
    borderRadius: Spacing.two,
  },
  archiveAction: {
    backgroundColor: Colors.light.tint,
  },
  unarchiveAction: {
    backgroundColor: '#6b7280',
  },
  hideAction: {
    backgroundColor: '#d64545',
  },
  swipeActionText: {
    color: '#ffffff',
  },
});
