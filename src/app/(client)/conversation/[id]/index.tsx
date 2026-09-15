import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/components/conversation-screen';

export default function ClientConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen conversationId={id} />;
}
