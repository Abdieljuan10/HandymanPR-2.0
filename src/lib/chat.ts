import { supabase } from '@/lib/supabase';

// Shared between both Messages screens (client + handyman) so the cleanup
// logic can't drift between them.
//
// Hiding a chat is per-user and never touches Storage or the other party's
// copy by itself. A conversation is only actually removed once its job has
// ENDED and both parties have hidden it -- on a live job, mutual delete
// only ever hides, so the message history survives as dispute evidence even
// if both sides tidy up their inbox. chat_conversation_deletable() owns
// that whole condition: the app can't evaluate it itself, since
// job_conversation_hides' select policy only shows a user their own hide
// rows. The real delete runs from the acting user's own authenticated
// client (same pattern as the existing job/portfolio-photo delete flows:
// storage.remove() before the row delete), not a cron.
export async function hideConversation(
  conversationId: string,
  userId: string
): Promise<{ error: string | null }> {
  const hiddenAt = new Date().toISOString();
  const { error } = await supabase
    .from('job_conversation_hides')
    .upsert(
      { conversation_id: conversationId, user_id: userId, hidden_at: hiddenAt },
      { onConflict: 'conversation_id,user_id' }
    );
  if (error) return { error: error.message };

  const { data: deletable } = await supabase.rpc('chat_conversation_deletable', {
    p_conversation_id: conversationId,
  });

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
