import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

import { PhotoViewer } from '@/components/photo-viewer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { compressJobPhoto } from '@/lib/job-photos';
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
  photo_url: string | null;
  created_at: string;
};

type ConversationRow = {
  client_id: string;
  job_id: string;
  jobs: { title: string } | null;
  client_profiles: { id: string; full_name: string; avatar_url: string | null } | null;
  handyman_profiles: { id: string; full_name: string; avatar_url: string | null } | null;
};

type PendingPhoto = { uri: string; mimeType: string };

export function ConversationScreen({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useSession();
  const listRef = useRef<FlatList<MessageRow>>(null);

  const [header, setHeader] = useState<ConversationHeader | null | undefined>(undefined);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  // chat-photos is a private bucket -- job_messages.photo_url only ever
  // stores the bare Storage path (same convention as certifications'
  // file_url), so every photo message needs a signed URL to actually
  // render. Keyed by path so both the initial batch fetch and a realtime
  // insert can share the same map.
  const [signedPhotoUrls, setSignedPhotoUrls] = useState<Record<string, string>>({});
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);

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
      .select('id, sender_id, body, photo_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        if (!isMounted) return;
        const rows = data ?? [];
        setMessages(rows);
        await signPhotoPaths(rows.map((row) => row.photo_url).filter((url): url is string => !!url));
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
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, row]);
          if (row.photo_url) signPhotoPaths([row.photo_url]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, session]);

  async function signPhotoPaths(paths: string[]) {
    if (paths.length === 0) return;
    const { data, error } = await supabase.storage.from('chat-photos').createSignedUrls(paths, 3600);
    if (error || !data) return;
    setSignedPhotoUrls((prev) => {
      const next = { ...prev };
      for (const entry of data) {
        if (entry.signedUrl) next[entry.path ?? ''] = entry.signedUrl;
      }
      return next;
    });
  }

  async function handleAttach() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const compressed = await compressJobPhoto(asset.uri, asset.width, asset.height);
    setPendingPhoto(compressed);
  }

  async function handleSend() {
    const body = draft.trim();
    if ((!body && !pendingPhoto) || !session) return;
    setDraft('');
    const photoToSend = pendingPhoto;
    setPendingPhoto(null);
    setSending(true);

    let photoPath: string | null = null;
    if (photoToSend) {
      const response = await fetch(photoToSend.uri);
      const arrayBuffer = await response.arrayBuffer();
      const path = `${conversationId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('chat-photos')
        .upload(path, arrayBuffer, { contentType: photoToSend.mimeType });
      if (uploadError) {
        console.error('Chat photo upload failed:', uploadError.message);
        setSending(false);
        setDraft(body);
        setPendingPhoto(photoToSend);
        return;
      }
      photoPath = path;
      await signPhotoPaths([path]);
    }

    const { error } = await supabase
      .from('job_messages')
      .insert({ conversation_id: conversationId, sender_id: session.user.id, body, photo_url: photoPath });
    setSending(false);
    if (error) {
      setDraft(body);
      setPendingPhoto(photoToSend);
    }
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
              const photoUri = item.photo_url ? signedPhotoUrls[item.photo_url] : null;
              return (
                <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
                  <ThemedView
                    type={isMine ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.bubble}>
                    {photoUri && (
                      <Pressable onPress={() => setViewerPhoto(photoUri)}>
                        <Image source={{ uri: photoUri }} style={styles.messagePhoto} contentFit="cover" />
                      </Pressable>
                    )}
                    {item.body ? <ThemedText type="default">{item.body}</ThemedText> : null}
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatRelativeTime(item.created_at, t)}
                    </ThemedText>
                  </ThemedView>
                </View>
              );
            }}
          />

          {pendingPhoto && (
            <View style={styles.pendingPhotoRow}>
              <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingPhotoThumb} contentFit="cover" />
              <Pressable
                onPress={() => setPendingPhoto(null)}
                accessibilityLabel={t('conversation.removePhoto')}
                style={styles.pendingPhotoRemove}>
                <Ionicons name="close" size={16} color="#ffffff" />
              </Pressable>
            </View>
          )}

          <View style={styles.inputRow}>
            <Pressable
              onPress={handleAttach}
              accessibilityLabel={t('conversation.attach')}
              style={styles.attachButton}>
              <Ionicons name="image-outline" size={22} color={theme.textSecondary} />
            </Pressable>
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

      <PhotoViewer
        photos={viewerPhoto ? [viewerPhoto] : []}
        initialIndex={0}
        visible={!!viewerPhoto}
        onClose={() => setViewerPhoto(null)}
      />
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
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
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
  messagePhoto: {
    width: 200,
    height: 200,
    borderRadius: Spacing.one,
  },
  pendingPhotoRow: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
  },
  pendingPhotoThumb: {
    width: 64,
    height: 64,
    borderRadius: Spacing.one,
  },
  pendingPhotoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  attachButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
