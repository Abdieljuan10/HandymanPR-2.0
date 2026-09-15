import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/providers/language-provider';

type RawTradeRecord = { id: number; slug: string; name_es: string; name_en: string };
export type TradeRecord = { id: number; slug: string; name: string };

export function useTrades() {
  const { language } = useLanguage();
  const [rawTrades, setRawTrades] = useState<RawTradeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from('trades')
      .select('id, slug, name_es, name_en')
      .order('sort_order')
      .then(({ data, error: fetchError }) => {
        if (!isMounted) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setRawTrades(data ?? []);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const trades = useMemo<TradeRecord[] | null>(() => {
    if (!rawTrades) return null;
    return rawTrades.map((trade) => ({
      id: trade.id,
      slug: trade.slug,
      name: language === 'en' ? trade.name_en : trade.name_es,
    }));
  }, [rawTrades, language]);

  return { trades, error };
}
