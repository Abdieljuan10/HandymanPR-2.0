import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
// The root-export Swipeable is deprecated in favor of this Reanimated-backed
// one (matches the pattern already used for job/bid archiving).
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadingState } from '@/components/loading-state';
import { SectionHeader } from '@/components/section-header';
import { SwipeAction, SWIPE_OVERSHOOT_FRICTION, SWIPE_SPRING } from '@/components/swipe-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { archiveConversation, hideConversation, unarchiveConversation } from '@/lib/chat';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type OtherParty = { full_name: string; avatar_url: string | null };

type ConversationRow = {
  id: string;
  last_message_at: string;
  jobs: { title: string } | null;
  client_profiles?: OtherParty | null;
  handyman_profiles?: OtherParty | null;
  job_messages: { count: number }[];
  // New, 2026-09-26 (visual redesign) -- a second, differently-ordered embed
  // of the SAME job_messages relation already used for the count above
  // (aliased, same pattern as hired_bid:bids!hired_bid_id elsewhere in this
  // app). Ordered/limited server-side via the query builder below, so this
  // is still exactly one round trip, not one query per conversation.
  latest_message?: { body: string | null; created_at: string }[];
};

type Section = { key: 'main' | 'archived'; data: ConversationRow[] };

const AVATAR_SIZE = 54;

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
        .select(
          `id, last_message_at, jobs(title), ${otherParty}(full_name, avatar_url), job_messages(count), ` +
            'latest_message:job_messages(body, created_at)'
        )
        .eq(myColumn, session.user.id)
        .order('last_message_at', { ascending: false })
        // Scoped to the `latest_message` embed only -- the top-level order
        // above (by last_message_at) is untouched. This is what keeps the
        // preview to "one round trip," not a query per conversation.
        .order('created_at', { foreignTable: 'latest_message', ascending: false })
        .limit(1, { foreignTable: 'latest_message' }),
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
      <SafeAreaView edges={['top', 'left', 'right']}>
        <AppHeader pageTitle={t('messages.title')} />
      </SafeAreaView>
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {archivedCount > 0 && (
          <Pressable onPress={() => setShowArchived((prev) => !prev)} style={styles.archiveToggle}>
            <ThemedText type="small" themeColor="textSecondary">
              {showArchived ? t('messages.hideArchived') : t('messages.showArchived', { count: archivedCount })}
            </ThemedText>
          </Pressable>
        )}

        {conversations === null ? (
          <LoadingState label={t('common.loading')} />
        ) : (
          <SectionList
            showsVerticalScrollIndicator={false}
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={<EmptyState title={t('conversation.listEmpty')} />}
            renderSectionHeader={({ section }) => (
              <SectionHeader
                title={section.key === 'archived' ? t('messages.archivedSection') : t('messages.activeSection')}
              />
            )}
            renderItem={({ item, section }) => {
              const isArchived = section.key === 'archived';
              const other = item[otherParty];
              // latest_message is server-ordered/limited to 1 (see the
              // query above), but sorted again here as a cheap correctness
              // safety net in case that server-side scoping doesn't apply
              // the way I expect -- this always picks the true latest
              // regardless, at the cost of a few extra rows in that
              // (unverified against a live project) worse case.
              const latest =
                item.latest_message && item.latest_message.length > 0
                  ? [...item.latest_message].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0]
                  : null;

              const row = (
                <Link href={`/conversation/${item.id}`} asChild>
                  <Pressable>
                    <Card style={styles.card}>
                      <Avatar uri={other?.avatar_url} name={other?.full_name} size={AVATAR_SIZE} />
                      <View style={styles.cardText}>
                        <ThemedText type="cardTitle" numberOfLines={1}>
                          {other?.full_name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {item.jobs?.title}
                        </ThemedText>
                        {!!latest?.body && (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {latest.body}
                          </ThemedText>
                        )}
                        <ThemedText type="metadata" themeColor="textSecondary" style={styles.time}>
                          {formatRelativeTime(item.last_message_at, t)}
                        </ThemedText>
                      </View>
                    </Card>
                  </Pressable>
                </Link>
              );

              return (
                <Swipeable
                  animationOptions={SWIPE_SPRING}
                  overshootFriction={SWIPE_OVERSHOOT_FRICTION}
                  renderRightActions={(progress, _drag, swipeable) => (
                    <View style={styles.swipeActions}>
                      <SwipeAction
                        kind={isArchived ? 'unarchive' : 'archive'}
                        label={t(isArchived ? 'messages.unarchive' : 'messages.archive')}
                        progress={progress}
                        onPress={() => {
                          swipeable.close();
                          if (isArchived) {
                            handleUnarchive(item.id);
                          } else {
                            handleArchive(item.id);
                          }
                        }}
                      />
                      <SwipeAction
                        kind="hide"
                        label={t('messages.hide')}
                        progress={progress}
                        index={1}
                        onPress={() => {
                          swipeable.close();
                          confirmHide(item);
                        }}
                      />
                    </View>
                  )}>
                  {row}
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
  archiveToggle: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.two,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  cardText: {
    flex: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  time: {
    textAlign: 'right',
  },
  swipeActions: {
    flexDirection: 'row',
  },
});
