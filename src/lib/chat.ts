import { supabase } from '@/lib/supabase';

// Shared between both Messages screens (client + handyman) so the cleanup
// logic can't drift between them.
//
// Deleting a chat is per-user, immediate, and never touches the other
// party's copy, whatever the job's status. It comes back (full history
// included) if a new message arrives after the delete. Only once BOTH
// parties have deleted it, with nothing new since either delete, is it
// actually removed -- chat_conversation_deletable() owns that condition,
// since job_conversation_hides' select policy only shows a user their own
// hide rows. hide_conversation() stamps hidden_at with the server clock so
// it compares correctly against last_message_at. The real delete runs from
// the acting user's own authenticated client (same pattern as the existing
// job/portfolio-photo delete flows: storage.remove() before the row
// delete, since chat-photos' delete policy needs the row to still exist).
// The 90-day cron is the backstop for everything this never reaches.
export async function hideConversation(conversationId: string): Promise<{ error: string | null }> {
  const { data: deletable, error } = await supabase.rpc('hide_conversation', {
    p_conversation_id: conversationId,
  });
  if (error) return { error: error.message };

  if (deletable) {
    const { data: files } = await supabase.storage.from('chat-photos').list(conversationId);
    if (files && files.length > 0) {
      await supabase.storage.from('chat-photos').remove(files.map((file) => `${conversationId}/${file.name}`));
    }
    // The job_conversations_delete policy re-checks chat_conversation_deletable()
    // itself, so this can't succeed unless it's actually still true.
    await supabase.from('job_conversations').delete().eq('id', conversationId);
  }

  return { error: null };
}

// Archive is a pure view preference -- nothing is deleted, and it stays
// archived even if new messages arrive, until the user unarchives it.
export async function archiveConversation(
  conversationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('job_conversation_archives')
    .insert({ conversation_id: conversationId, user_id: userId });
  return { error: error?.message ?? null };
}

export async function unarchiveConversation(
  conversationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('job_conversation_archives')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}
