import { supabase } from '@/lib/supabase';

// Shared between both Messages screens (client + handyman) so the cleanup
// logic can't drift between them.
//
// Deleting a chat is per-user, immediate, and never touches the other
// party's copy, whatever the job's status. If a new message arrives after
// the delete it comes back as a fresh conversation showing only what was
// sent after the delete (see conversation-screen.tsx). Only once BOTH
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

  // The bonus cleanup. Its failures are logged, not returned: the user's
  // action (hiding the chat) already succeeded, and the 90-day cron is the
  // backstop for anything left behind here.
  if (deletable) {
    const { data: files, error: listError } = await supabase.storage.from('chat-photos').list(conversationId);
    if (listError) console.warn('Chat cleanup: listing photos failed:', listError.message);
    if (files && files.length > 0) {
      const { error: removeError } = await supabase.storage
        .from('chat-photos')
        .remove(files.map((file) => `${conversationId}/${file.name}`));
      if (removeError) console.warn('Chat cleanup: removing photos failed:', removeError.message);
    }
    // The job_conversations_delete policy re-checks chat_conversation_deletable()
    // itself, so this can't succeed unless it's actually still true.
    const { error: deleteError } = await supabase.from('job_conversations').delete().eq('id', conversationId);
    if (deleteError) console.warn('Chat cleanup: deleting conversation failed:', deleteError.message);
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
