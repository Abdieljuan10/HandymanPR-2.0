import { supabase } from '@/lib/supabase';

// Shared between both Messages screens (client + handyman) so the
// both-sides-hidden cleanup logic can't drift between them.
//
// Hiding a chat is per-user and never touches Storage or the other party's
// copy by itself. But once BOTH parties have hidden the same conversation,
// nobody is left to see it, so it's actually removed here -- run from the
// acting user's own authenticated client (same pattern as the existing
// job/portfolio-photo delete flows: storage.remove() before the row
// delete), not a cron. chat_both_parties_hidden() is the only way to know
// the other party has also hidden it -- job_conversation_hides' own select
// policy only shows a user their own hide rows.
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

  const { data: bothHidden } = await supabase.rpc('chat_both_parties_hidden', {
    p_conversation_id: conversationId,
  });

  if (bothHidden) {
    const { data: files } = await supabase.storage.from('chat-photos').list(conversationId);
    if (files && files.length > 0) {
      await supabase.storage.from('chat-photos').remove(files.map((file) => `${conversationId}/${file.name}`));
    }
    // The job_conversations_delete policy re-checks chat_both_parties_hidden()
    // itself, so this can't succeed unless it's actually still true.
    await supabase.from('job_conversations').delete().eq('id', conversationId);
  }

  return { error: null };
}
