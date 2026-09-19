import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ConversationHeader = {
  jobId: string;
  jobTitle: string;
  otherPartyId: string;
  otherPartyName: string;
  otherPartyAvatarUrl: string | null;
  otherPartyHref: `/handyman/${string}` | `/client/${string}`;
};

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ConversationRow = {
  client_id: string;
  job_id: string;
  jobs: { title: string } | null;
  client_profiles: { id: string; full_name: string; avatar_url: string | null } | null;
  handyman_profiles: { id: string; full_name: string; avatar_url: string | null } | null;
};

export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const listRef = useRef<FlatList<MessageRow>>(null);

  const [header, setHeader] = useState<ConversationHeader | null | undefined>(undefined);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!conversationId || !session) return;
    let isMounted = true;

    supabase
      .from('job_conversations')
      .select(
        'client_id, job_id, jobs(title), client_profiles(id, full_name, avatar_url), handyman_profiles(id, full_name, avatar_url)'
      )
      .eq('id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!isMounted) return;
        const row = data as unknown as ConversationRow | null;
        if (!row) {
          setHeader(null);
          return;
        }
        const isClient = row.client_id === session.user.id;
        const other = isClient ? row.handyman_profiles : row.client_profiles;
        setHeader({
          jobId: row.job_id,
          jobTitle: row.jobs?.title ?? '',
          otherPartyId: other?.id ?? '',
          otherPartyName: other?.full_name ?? '',
          otherPartyAvatarUrl: other?.avatar_url ?? null,
          otherPartyHref: isClient ? `/handyman/${other?.id ?? ''}` : `/client/${other?.id ?? ''}`,
        });
      });

    supabase
      .from('job_messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (isMounted) setMessages(data ?? []);
      });

    // Unique per effect run (not just per conversationId): the Supabase realtime client
    // reuses the same channel object for a repeated topic name rather than creating a new
    // one, so if this screen ever mounts twice for the same conversation (deep-linking hit
    // this via a duplicate notification-response event — see _layout.tsx), a shared topic
    // means the second mount's `.on(...)` lands on a channel the first already `.subscribe()`d
    // to, which throws. A unique topic per mount makes that whole class of collision impossible.
    const channel = supabase
      .channel(`conversation-${conversationId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as MessageRow]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, session]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !session) return;
    setDraft('');
    setSending(true);
    const { error } = await supabase
      .from('job_messages')
      .insert({ conversation_id: conversationId, sender_id: session.user.id, body });
    setSending(false);
    if (error) setDraft(body);
  }

  if (header === undefined) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('common.loading')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (header === null) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default">{t('jobDetail.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="translate-with-padding"
          automaticOffset>
          <View style={styles.headerRow}>
            <Link href={header.otherPartyHref} asChild>
              <Pressable style={styles.headerIdentity}>
                {header.otherPartyAvatarUrl ? (
                  <Image source={{ uri: header.otherPartyAvatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {header.otherPartyName.trim().charAt(0).toUpperCase() || '?'}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="smallBold">{header.otherPartyName}</ThemedText>
              </Pressable>
            </Link>

            <Link href={`/job/${header.jobId}`} asChild>
              <Pressable>
                <ThemedText type="small" themeColor="textSecondary">
                  {header.jobTitle}
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.flex}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary">
                {t('conversation.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => {
              const isMine = item.sender_id === session?.user.id;
              return (
                <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
                  <ThemedView
                    type={isMine ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.bubble}>
                    <ThemedText type="default">{item.body}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatRelativeTime(item.created_at, t)}
                    </ThemedText>
                  </ThemedView>
                </View>
              );
            }}
          />

          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t('conversation.placeholder')}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={sending}
              accessibilityLabel={t('conversation.send')}
              style={[styles.sendButton, { backgroundColor: theme.tint }, sending && styles.sendButtonDisabled]}>
              {sending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#ffffff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
});
