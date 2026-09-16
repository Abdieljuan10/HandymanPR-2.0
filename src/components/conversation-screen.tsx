import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, TextInput, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAvoidingScreen } from '@/components/keyboard-avoiding-screen';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { formatRelativeTime } from '@/utils/relative-time';

type ConversationHeader = {
  jobTitle: string;
  otherPartyName: string;
};

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type ConversationRow = {
  client_id: string;
  jobs: { title: string } | null;
  client_profiles: { full_name: string } | null;
  handyman_profiles: { full_name: string } | null;
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
      .select('client_id, jobs(title), client_profiles(full_name), handyman_profiles(full_name)')
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
        setHeader({
          jobTitle: row.jobs?.title ?? '',
          otherPartyName: (isClient ? row.handyman_profiles?.full_name : row.client_profiles?.full_name) ?? '',
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

    const channel = supabase
      .channel(`conversation-${conversationId}`)
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
        <KeyboardAvoidingScreen>
          <ThemedText type="small" themeColor="textSecondary" style={styles.headerText}>
            {header.jobTitle} · {header.otherPartyName}
          </ThemedText>

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
            <PrimaryButton
              label={t('conversation.send')}
              onPress={handleSend}
              loading={sending}
              style={styles.sendButton}
            />
          </View>
        </KeyboardAvoidingScreen>
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
  headerText: {
    marginBottom: Spacing.two,
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
    marginTop: 0,
  },
});
