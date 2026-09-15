import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type PuebloRecord = { id: number; slug: string };

export function usePueblos() {
  const [pueblos, setPueblos] = useState<PuebloRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from('pueblos')
      .select('id, slug')
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setPueblos(data ?? []);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { pueblos, error };
}
