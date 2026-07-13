import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Database } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type TradeRow = Database['public']['Tables']['trades']['Row'];
export type TradeInsert = Database['public']['Tables']['trades']['Insert'];

interface TradesContextValue {
  trades: TradeRow[];
  deletedTrades: TradeRow[];
  loading: boolean;
  ownerId: string | null;
  isReadOnly: boolean;
  refetch: () => Promise<void>;
  loadDeletedTrades: () => Promise<void>;
  addTrades: (rows: TradeInsert[]) => Promise<{ inserted: number; updatedFromExpiration: number }>;
  updateTradeNotes: (id: string, notes: string) => Promise<void>;
  updateTradeStrategy: (id: string, strategyId: string | null) => Promise<void>;
  updateTradeImages: (id: string, images: string[]) => Promise<void>;
  updateTradeTags: (id: string, tags: string[]) => Promise<void>;
  updateTradeDemo: (id: string, isDemo: boolean) => Promise<void>;
  updateMentorFeedback: (id: string, rating: number | null, notes: string | null) => Promise<void>;
  bulkUpdateTradeTags: (ids: string[], tags: string[], mode: 'add' | 'replace') => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  deleteTrades: (ids: string[]) => Promise<void>;
  clearTrades: () => Promise<void>;
  restoreTrade: (id: string) => Promise<void>;
  restoreAllTrades: () => Promise<void>;
  permanentlyDeleteTrade: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
}

const TradesContext = createContext<TradesContextValue | null>(null);

export const useTrades = () => {
  const ctx = useContext(TradesContext);
  if (!ctx) throw new Error('useTrades must be used inside TradesProvider');
  return ctx;
};

interface ProviderProps {
  children: React.ReactNode;
  /** When set, load that user's trades instead of the current user (mentor view). */
  viewingUserId?: string | null;
}

export function TradesProvider({ children, viewingUserId = null }: ProviderProps) {
  const { user } = useAuth();
  const ownerId = viewingUserId ?? user?.id ?? null;
  const isReadOnly = !!viewingUserId && viewingUserId !== user?.id;

  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [deletedTrades, setDeletedTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!ownerId) { setTrades([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', ownerId)
      .is('deleted_at', null)
      .order('entry_date', { ascending: false, nullsFirst: false });
    if (error) {
      console.error('refetch trades:', error);
      toast({ title: 'שגיאה בטעינת עסקאות', description: error.message, variant: 'destructive' });
    } else {
      setTrades((data ?? []) as TradeRow[]);
    }
    setLoading(false);
  }, [ownerId]);

  const loadDeletedTrades = useCallback(async () => {
    if (!ownerId) { setDeletedTrades([]); return; }
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', ownerId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) {
      toast({ title: 'שגיאה בטעינת פח האשפה', description: error.message, variant: 'destructive' });
    } else {
      setDeletedTrades((data ?? []) as TradeRow[]);
    }
  }, [ownerId]);

  useEffect(() => { refetch(); }, [refetch]);

  // --- Mutations (owner only) ---
  const guardWrite = () => {
    if (isReadOnly) {
      toast({ title: 'מצב צפייה בלבד', description: 'מנטור אינו יכול לערוך עסקאות תלמיד', variant: 'destructive' });
      return false;
    }
    if (!user?.id) return false;
    return true;
  };

  const addTrades: TradesContextValue['addTrades'] = async (rows) => {
    if (!guardWrite()) return { inserted: 0, updatedFromExpiration: 0 };
    if (!rows.length) return { inserted: 0, updatedFromExpiration: 0 };

    // Stamp user_id and a shared import_batch_id
    const batchId = crypto.randomUUID();
    const stamped = rows.map((r) => ({
      ...r,
      user_id: user!.id,
      import_batch_id: r.import_batch_id ?? batchId,
    }));

    const { data, error } = await supabase
      .from('trades')
      .upsert(stamped, { onConflict: 'external_id', ignoreDuplicates: false })
      .select();
    if (error) {
      toast({ title: 'שגיאת ייבוא', description: error.message, variant: 'destructive' });
      return { inserted: 0, updatedFromExpiration: 0 };
    }
    await refetch();
    return { inserted: data?.length ?? 0, updatedFromExpiration: 0 };
  };

  const setLocal = (id: string, patch: Partial<TradeRow>) =>
    setTrades((curr) => curr.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const update = async (id: string, patch: Partial<TradeRow>) => {
    if (!guardWrite()) return;
    setLocal(id, patch);
    const { error } = await supabase.from('trades').update(patch).eq('id', id);
    if (error) {
      toast({ title: 'שגיאת עדכון', description: error.message, variant: 'destructive' });
      await refetch();
    }
  };

  const updateTradeNotes = (id: string, notes: string) => update(id, { notes });
  const updateTradeStrategy = (id: string, strategyId: string | null) => update(id, { strategy_id: strategyId });
  const updateTradeImages = (id: string, images: string[]) => update(id, { images });
  const updateTradeTags = (id: string, tags: string[]) => update(id, { tags });
  const updateTradeDemo = (id: string, isDemo: boolean) => update(id, { is_demo: isDemo });

  const updateMentorFeedback: TradesContextValue['updateMentorFeedback'] = async (id, rating, notes) => {
    if (!user?.id) return;
    setLocal(id, { mentor_rating: rating, mentor_notes: notes });
    const { error } = await supabase
      .from('trades')
      .update({ mentor_rating: rating, mentor_notes: notes })
      .eq('id', id);
    if (error) {
      toast({ title: 'שגיאת עדכון', description: error.message, variant: 'destructive' });
      await refetch();
    }
  };

  const bulkUpdateTradeTags: TradesContextValue['bulkUpdateTradeTags'] = async (ids, tags, mode) => {
    if (!guardWrite() || !ids.length) return;
    if (mode === 'replace') {
      const { error } = await supabase.from('trades').update({ tags }).in('id', ids);
      if (error) {
        toast({ title: 'שגיאת עדכון תגיות', description: error.message, variant: 'destructive' });
      }
    } else {
      // add: per-row merge to avoid duplicates — run updates in parallel (was sequential N+1)
      await Promise.all(
        trades
          .filter((x) => ids.includes(x.id))
          .map((t) => {
            const merged = Array.from(new Set([...(t.tags ?? []), ...tags]));
            return supabase.from('trades').update({ tags: merged }).eq('id', t.id);
          })
      );
    }
    await refetch();
  };

  const softDelete = async (filterIds: string[] | null) => {
    if (!guardWrite()) return;
    const now = new Date().toISOString();
    let query = supabase.from('trades').update({ deleted_at: now }).eq('user_id', user!.id);
    if (filterIds) query = query.in('id', filterIds);
    const { error } = await query;
    if (error) {
      toast({ title: 'שגיאת מחיקה', description: error.message, variant: 'destructive' });
    } else {
      await refetch();
      await loadDeletedTrades();
    }
  };
  const deleteTrade = (id: string) => softDelete([id]);
  const deleteTrades = (ids: string[]) => softDelete(ids);
  const clearTrades = () => softDelete(null);

  const restoreTrade = async (id: string) => {
    if (!guardWrite()) return;
    const { error } = await supabase.from('trades').update({ deleted_at: null }).eq('id', id);
    if (!error) { await refetch(); await loadDeletedTrades(); }
  };
  const restoreAllTrades = async () => {
    if (!guardWrite()) return;
    const { error } = await supabase
      .from('trades').update({ deleted_at: null })
      .eq('user_id', user!.id).not('deleted_at', 'is', null);
    if (!error) { await refetch(); await loadDeletedTrades(); }
  };
  const permanentlyDeleteTrade = async (id: string) => {
    if (!guardWrite()) return;
    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (!error) { await loadDeletedTrades(); }
  };
  const emptyTrash = async () => {
    if (!guardWrite()) return;
    const { error } = await supabase.from('trades').delete()
      .eq('user_id', user!.id).not('deleted_at', 'is', null);
    if (!error) { await loadDeletedTrades(); }
  };

  const value: TradesContextValue = useMemo(() => ({
    trades, deletedTrades, loading, ownerId, isReadOnly,
    refetch, loadDeletedTrades, addTrades,
    updateTradeNotes, updateTradeStrategy, updateTradeImages, updateTradeTags, updateTradeDemo,
    updateMentorFeedback, bulkUpdateTradeTags,
    deleteTrade, deleteTrades, clearTrades,
    restoreTrade, restoreAllTrades, permanentlyDeleteTrade, emptyTrash,
  }), [trades, deletedTrades, loading, ownerId, isReadOnly, refetch, loadDeletedTrades]);

  return <TradesContext.Provider value={value}>{children}</TradesContext.Provider>;
}
