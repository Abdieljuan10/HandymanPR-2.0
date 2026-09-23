import { supabase } from '@/lib/supabase';

// A client's private list of saved handymen (client_saved_handymen,
// 20261010000000). Shared by the public profile's heart and Browse so the
// two can't drift. The handyman never sees who saved them.
export async function saveHandyman(clientId: string, handymanId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('client_saved_handymen')
    .insert({ client_id: clientId, handyman_id: handymanId });
  return { error: error?.message ?? null };
}

export async function unsaveHandyman(clientId: string, handymanId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('client_saved_handymen')
    .delete()
    .eq('client_id', clientId)
    .eq('handyman_id', handymanId);
  return { error: error?.message ?? null };
}
