import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Database } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type Strategy = Database['public']['Tables']['strategies']['Row'];

interface StrategiesContextValue {
  strategies: Strategy[];
  loading: boolean;
  refetch: () => Promise<void>;
  createStrategy: (name: string, rAmount: number | null, color?: string | null) => Promise<Strategy | null>;
  updateStrategy: (id: string, patch: Partial<Pick<Strategy, 'name' | 'r_amount' | 'color'>>) => Promise<void>;
  deleteStrategy: (id: string) => Promise<void>;
  calculateRMultiple: (netPnl: number | null, strategyId: string | null) => number | null;
  ownerId: string | null;
}

const StrategiesContext = createContext<StrategiesContextValue | null>(null);

export const useStrategies = () => {
  const ctx = useContext(StrategiesContext);
  if (!ctx) throw new Error('useStrategies must be used inside StrategiesProvider');
  return ctx;
};

export function StrategiesProvider({ children, viewingUserId = null }: { children: React.ReactNode; viewingUserId?: string | null }) {
  const { user } = useAuth();
  const ownerId = viewingUserId ?? user?.id ?? null;
  const isReadOnly = !!viewingUserId && viewingUserId !== user?.id;

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!ownerId) { setStrategies([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('strategies').select('*')
      .eq('user_id', ownerId).order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'שגיאה בטעינת אסטרטגיות', description: error.message, variant: 'destructive' });
    } else {
      setStrategies((data ?? []) as Strategy[]);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const guard = () => {
    if (isReadOnly) {
      toast({ title: 'מצב צפייה בלבד', description: 'אינך יכול לערוך אסטרטגיות של תלמיד', variant: 'destructive' });
      return false;
    }
    return !!user?.id;
  };

  const createStrategy: StrategiesContextValue['createStrategy'] = async (name, rAmount, color) => {
    if (!guard()) return null;
    const { data, error } = await supabase
      .from('strategies')
      .insert({ user_id: user!.id, name, r_amount: rAmount, color: color ?? null })
      .select().single();
    if (error) {
      toast({ title: 'שגיאת יצירה', description: error.message, variant: 'destructive' });
      return null;
    }
    // Append the returned row locally (list is ordered by created_at asc, so new goes last)
    setStrategies((curr) => [...curr, data as Strategy]);
    return data as Strategy;
  };

  const updateStrategy: StrategiesContextValue['updateStrategy'] = async (id, patch) => {
    if (!guard()) return;
    const { data, error } = await supabase
      .from('strategies').update(patch).eq('id', id)
      .select().single();
    if (error) {
      toast({ title: 'שגיאת עדכון', description: error.message, variant: 'destructive' });
    } else {
      // Apply the server-returned row in place — no full-table refetch needed
      setStrategies((curr) => curr.map((s) => (s.id === id ? (data as Strategy) : s)));
    }
  };

  const deleteStrategy = async (id: string) => {
    if (!guard()) return;
    const { error } = await supabase.from('strategies').delete().eq('id', id);
    if (error) {
      toast({ title: 'שגיאת מחיקה', description: error.message, variant: 'destructive' });
    } else {
      setStrategies((curr) => curr.filter((s) => s.id !== id));
    }
  };

  const calculateRMultiple: StrategiesContextValue['calculateRMultiple'] = (netPnl, strategyId) => {
    if (netPnl == null || !strategyId) return null;
    const s = strategies.find((x) => x.id === strategyId);
    if (!s?.r_amount || s.r_amount === 0) return null;
    return netPnl / Number(s.r_amount);
  };

  const value = useMemo(() => ({
    strategies, loading, ownerId, refetch,
    createStrategy, updateStrategy, deleteStrategy, calculateRMultiple,
  }), [strategies, loading, ownerId, refetch]);

  return <StrategiesContext.Provider value={value}>{children}</StrategiesContext.Provider>;
}
