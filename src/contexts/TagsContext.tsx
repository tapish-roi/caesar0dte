import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Database } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export type UserTag = Database['public']['Tables']['user_tags']['Row'];

interface TagsContextValue {
  tags: UserTag[];
  tagNames: string[];
  loading: boolean;
  refetch: () => Promise<void>;
  createTag: (name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
}

const TagsContext = createContext<TagsContextValue | null>(null);

export const useTags = () => {
  const ctx = useContext(TagsContext);
  if (!ctx) throw new Error('useTags must be used inside TagsProvider');
  return ctx;
};

export function TagsProvider({ children, viewingUserId = null }: { children: React.ReactNode; viewingUserId?: string | null }) {
  const { user } = useAuth();
  const ownerId = viewingUserId ?? user?.id ?? null;
  const isReadOnly = !!viewingUserId && viewingUserId !== user?.id;
  const [tags, setTags] = useState<UserTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!ownerId) { setTags([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('user_tags').select('*').eq('user_id', ownerId).order('name');
    if (!error) setTags((data ?? []) as UserTag[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { refetch(); }, [refetch]);

  const createTag = async (name: string) => {
    if (isReadOnly || !user?.id) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const { error } = await supabase.from('user_tags').insert({ user_id: user.id, name: trimmed });
    if (error && !error.message.includes('duplicate')) {
      toast({ title: 'שגיאה ביצירת תגית', description: error.message, variant: 'destructive' });
    } else {
      await refetch();
    }
  };

  const deleteTag = async (id: string) => {
    if (isReadOnly) return;
    const { error } = await supabase.from('user_tags').delete().eq('id', id);
    if (!error) await refetch();
  };

  const value = useMemo(() => ({
    tags, tagNames: tags.map((t) => t.name), loading, refetch, createTag, deleteTag,
  }), [tags, loading, refetch]);

  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}
