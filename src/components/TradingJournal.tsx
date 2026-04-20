import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Plus, Search, Trash2, RotateCcw, X, Star, Tag, Filter, Image as ImageIcon,
  TrendingUp, TrendingDown, Pencil, Eye, AlertTriangle, ChevronLeft, Save, Upload,
  CalendarDays, Wallet, Hash, FileText, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import ImportIbkrDialog from './ImportIbkrDialog';
import ImportHistoryDialog from './ImportHistoryDialog';
import AnalyticsPanel from './AnalyticsPanel';
import { BarChart3, History, Layers } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface TradeRow {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_date: string | null;
  exit_date: string | null;
  net_pnl: number | null;
  commission: number | null;
  status: 'open' | 'closed' | 'expired' | 'cancelled';
  tags: string[];
  strategy_id: string | null;
  images: string[];
  notes: string | null;
  is_demo: boolean;
  option_strategy: string | null;
  option_legs: Array<{
    right: 'C' | 'P';
    strike: number;
    expiry: string;
    side: 'long' | 'short';
    quantity: number;
    open_price: number | null;
    close_price: number | null;
    open_date: string | null;
    close_date: string | null;
    commission: number;
    pnl: number | null;
    status: string;
  }> | null;
  strike: number | null;
  expiry_date: string | null;
  mentor_rating: number | null;
  mentor_notes: string | null;
  deleted_at: string | null;
  import_batch_id: string | null;
  import_source: string | null;
}

interface StrategyRow { id: string; name: string; r_amount: number | null; color: string | null; }
interface TagRow { id: string; name: string; }

export interface TradingJournalProps {
  /** The student whose journal we're showing (always = trades.user_id) */
  studentId: string;
  /** The viewer's user id */
  viewerId: string;
  /** 'student' = full edit; 'mentor' = read-only + mentor fields */
  viewerRole: 'student' | 'mentor';
  /** Optional: student name for header (mentor view) */
  studentName?: string;
  /** Optional: back action (mentor view) */
  onBack?: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────
const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  const v = Number(n);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n: number | null | undefined, digits = 4) => {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits });
};
const fmtDate = (s: string | null | undefined) => (s ? format(parseISO(s), 'dd.MM.yy HH:mm', { locale: he }) : '—');

// Compute net P&L if not provided (long: (exit-entry)*qty; short: (entry-exit)*qty)
function computePnl(t: Pick<TradeRow, 'side' | 'entry_price' | 'exit_price' | 'quantity' | 'commission'>): number | null {
  if (t.entry_price == null || t.exit_price == null || !t.quantity) return null;
  const gross = t.side === 'long'
    ? (Number(t.exit_price) - Number(t.entry_price)) * Number(t.quantity)
    : (Number(t.entry_price) - Number(t.exit_price)) * Number(t.quantity);
  return gross - Number(t.commission ?? 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
export default function TradingJournal({ studentId, viewerId, viewerRole, studentName, onBack }: TradingJournalProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMentor = viewerRole === 'mentor';

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [filterSide, setFilterSide] = useState<'all' | 'long' | 'short'>('all');
  const [filterStrategy, setFilterStrategy] = useState<string | 'all'>('all');
  const [filterTag, setFilterTag] = useState<string | 'all'>('all');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const [editingTrade, setEditingTrade] = useState<TradeRow | null>(null);
  const [creatingTrade, setCreatingTrade] = useState(false);
  const [detailTrade, setDetailTrade] = useState<TradeRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['trades', studentId, showTrash ? 'trash' : 'active'],
    queryFn: async () => {
      let q = supabase.from('trades').select('*').eq('user_id', studentId);
      q = showTrash ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
      const { data, error } = await q.order('entry_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as TradeRow[];
    },
  });

  const { data: strategies = [] } = useQuery({
    queryKey: ['strategies', studentId],
    queryFn: async () => {
      const { data } = await supabase.from('strategies').select('id, name, r_amount, color').eq('user_id', studentId).order('name');
      return (data ?? []) as StrategyRow[];
    },
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['user_tags', studentId],
    queryFn: async () => {
      const { data } = await supabase.from('user_tags').select('id, name').eq('user_id', studentId).order('name');
      return (data ?? []) as TagRow[];
    },
  });

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (!includeDemo && t.is_demo) return false;
      if (filterSide !== 'all' && t.side !== filterSide) return false;
      if (filterStrategy !== 'all' && t.strategy_id !== filterStrategy) return false;
      if (filterTag !== 'all' && !t.tags.includes(filterTag)) return false;
      if (search.trim()) {
        const s = search.trim().toUpperCase();
        if (!t.symbol.toUpperCase().includes(s) && !(t.notes ?? '').toUpperCase().includes(s)) return false;
      }
      if (dateRange?.from) {
        const d = t.entry_date ? new Date(t.entry_date) : null;
        if (!d) return false;
        if (d < dateRange.from) return false;
        if (dateRange.to && d > dateRange.to) return false;
      }
      return true;
    });
  }, [trades, includeDemo, filterSide, filterStrategy, filterTag, search, dateRange]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const softDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('trades').update({ deleted_at: new Date().toISOString() }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      setSelectedIds(new Set());
      toast({ title: 'נמחק', description: 'העסקאות הועברו לפח. ניתן לשחזר תוך 30 יום.' });
    },
    onError: (e: any) => toast({ title: 'שגיאה', description: e.message, variant: 'destructive' }),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trades').update({ deleted_at: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      toast({ title: 'שוחזר' });
    },
  });

  const hardDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('trades').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      toast({ title: 'נמחק לצמיתות' });
    },
  });

  const bulkApplyTag = useMutation({
    mutationFn: async ({ ids, tag }: { ids: string[]; tag: string }) => {
      // Fetch current tags then merge per row
      const { data: current } = await supabase.from('trades').select('id, tags').in('id', ids);
      if (!current) return;
      await Promise.all(current.map(row => {
        const next = Array.from(new Set([...(row.tags as string[] ?? []), tag]));
        return supabase.from('trades').update({ tags: next }).eq('id', row.id);
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      setSelectedIds(new Set());
      setBulkTagOpen(false);
      toast({ title: 'תגית נוספה' });
    },
  });

  // Mentor field updates (rating + notes)
  const saveMentorFields = useMutation({
    mutationFn: async ({ id, mentor_rating, mentor_notes }: { id: string; mentor_rating: number | null; mentor_notes: string | null }) => {
      const { error } = await supabase.from('trades').update({ mentor_rating, mentor_notes }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      toast({ title: 'נשמר' });
    },
    onError: (e: any) => toast({ title: 'שגיאה', description: e.message, variant: 'destructive' }),
  });

  // ── Render helpers ───────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = filteredTrades.filter(t => !t.is_demo || includeDemo);
    const closed = active.filter(t => t.exit_price != null);
    const wins = closed.filter(t => (t.net_pnl ?? 0) > 0);
    const losses = closed.filter(t => (t.net_pnl ?? 0) < 0);
    const totalPnl = active.reduce((s, t) => s + Number(t.net_pnl ?? 0), 0);
    return {
      total: active.length,
      totalAll: trades.filter(t => !t.is_demo || includeDemo).length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
      totalPnl,
    };
  }, [filteredTrades, trades, includeDemo]);

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            {onBack && (
              <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-5 h-5 rotate-180" />
              </button>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">יומן מסחר</h1>
            {isMentor && studentName && (
              <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                {studentName} · קריאה בלבד
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {showTrash ? 'פח עסקאות שנמחקו (נמחק אוטומטית לאחר 30 יום)' : `${stats.total} מתוך ${stats.totalAll} עסקאות`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isMentor && (
            <>
              <Button
                variant={showTrash ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTrash(s => !s)}
                className="h-9 gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {showTrash ? 'חזרה ליומן' : 'פח'}
              </Button>
              {!showTrash && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 gap-2">
                    <Upload className="w-4 h-4" />
                    ייבוא IBKR
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setClearAllOpen(true)} className="h-9 gap-2 text-destructive hover:text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    מחק הכל
                  </Button>
                  <Button onClick={() => setCreatingTrade(true)} size="sm" className="h-9 gap-2">
                    <Plus className="w-4 h-4" />
                    עסקה חדשה
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stat bar */}
      {!showTrash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="P&L נטו" value={fmtMoney(stats.totalPnl)} accent={stats.totalPnl >= 0 ? 'up' : 'down'} />
          <StatCard label="עסקאות" value={String(stats.total)} />
          <StatCard label="אחוז הצלחה" value={`${stats.winRate}%`} />
          <StatCard label="זכיות / הפסדים" value={`${stats.wins} / ${stats.losses}`} />
        </div>
      )}

      {/* Filters */}
      {!showTrash && (
        <div className="bg-card border border-border rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש סימול / הערה..."
              className="pe-9 h-9"
            />
          </div>

          <DateRangeFilter range={dateRange} onChange={setDateRange} />

          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value as any)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">כל הכיוונים</option>
            <option value="long">לונג</option>
            <option value="short">שורט</option>
          </select>

          <select
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">כל האסטרטגיות</option>
            {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {tags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="all">כל התגיות</option>
              {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          )}

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={includeDemo} onCheckedChange={setIncludeDemo} />
            הצג Demo
          </label>

          {!isMentor && selectedIds.size > 0 && (
            <>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground">{selectedIds.size} נבחרו</span>
              <Button size="sm" variant="outline" className="h-9 gap-2" onClick={() => setBulkTagOpen(true)}>
                <Tag className="w-3.5 h-3.5" /> תייג
              </Button>
              <Button size="sm" variant="outline" className="h-9 gap-2 text-destructive" onClick={() => softDelete.mutate(Array.from(selectedIds))}>
                <Trash2 className="w-3.5 h-3.5" /> מחק
              </Button>
            </>
          )}
        </div>
      )}

      {/* Trades table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">טוען...</div>
        ) : filteredTrades.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{showTrash ? 'הפח ריק' : 'אין עסקאות עדיין'}</p>
            {!showTrash && !isMentor && <p className="text-xs mt-1">לחץ "עסקה חדשה" כדי להתחיל</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-xs text-muted-foreground">
                  {!isMentor && !showTrash && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        className="cursor-pointer"
                        checked={filteredTrades.length > 0 && filteredTrades.every(t => selectedIds.has(t.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredTrades.map(t => t.id)));
                          else setSelectedIds(new Set());
                        }}
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 text-start font-medium">סימול</th>
                  <th className="px-3 py-3 text-start font-medium">כיוון</th>
                  <th className="px-3 py-3 text-start font-medium">כמות</th>
                  <th className="px-3 py-3 text-start font-medium">כניסה</th>
                  <th className="px-3 py-3 text-start font-medium">יציאה</th>
                  <th className="px-3 py-3 text-start font-medium">תאריך</th>
                  <th className="px-3 py-3 text-start font-medium">P&L</th>
                  <th className="px-3 py-3 text-start font-medium">סטטוס</th>
                  <th className="px-3 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => {
                  const pnl = t.net_pnl ?? computePnl(t);
                  const pnlPositive = pnl != null && pnl >= 0;
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-border hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setDetailTrade(t)}
                    >
                      {!isMentor && !showTrash && (
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="cursor-pointer"
                            checked={selectedIds.has(t.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(t.id); else next.delete(t.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{t.symbol}</span>
                          {t.is_demo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">DEMO</span>}
                          {t.option_strategy && <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">OPT</span>}
                          {t.images?.length > 0 && <ImageIcon className="w-3 h-3 text-muted-foreground" />}
                          {t.mentor_rating != null && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                              <Star className="w-3 h-3 fill-amber-500" />{t.mentor_rating}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {t.side === 'long' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <TrendingUp className="w-3 h-3" />Long
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                            <TrendingDown className="w-3 h-3" />Short
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-foreground">{fmtNum(t.quantity, 2)}</td>
                      <td className="px-3 py-3 text-foreground">{fmtNum(t.entry_price)}</td>
                      <td className="px-3 py-3 text-foreground">{fmtNum(t.exit_price)}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{fmtDate(t.entry_date)}</td>
                      <td className={`px-3 py-3 font-semibold ${pnl == null ? 'text-muted-foreground' : pnlPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {fmtMoney(pnl)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {showTrash ? (
                            <>
                              <button
                                onClick={() => restore.mutate(t.id)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="שחזר"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => { if (confirm('למחוק לצמיתות?')) hardDelete.mutate([t.id]); }}
                                className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                                title="מחק לצמיתות"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : !isMentor ? (
                            <>
                              <button
                                onClick={() => setEditingTrade(t)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="ערוך"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => softDelete.mutate([t.id])}
                                className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                                title="העבר לפח"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setDetailTrade(t)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="צפה"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade detail panel */}
      <AnimatePresence>
        {detailTrade && (
          <TradeDetailPanel
            trade={detailTrade}
            strategies={strategies}
            isMentor={isMentor}
            onClose={() => setDetailTrade(null)}
            onSaveMentor={(rating, notes) => saveMentorFields.mutate({ id: detailTrade.id, mentor_rating: rating, mentor_notes: notes })}
            onEdit={!isMentor ? () => { setEditingTrade(detailTrade); setDetailTrade(null); } : undefined}
          />
        )}
      </AnimatePresence>

      {/* Create / Edit dialog */}
      {(creatingTrade || editingTrade) && !isMentor && (
        <TradeFormDialog
          trade={editingTrade}
          studentId={studentId}
          strategies={strategies}
          tags={tags}
          onClose={() => { setCreatingTrade(false); setEditingTrade(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['trades', studentId] });
            qc.invalidateQueries({ queryKey: ['user_tags', studentId] });
            qc.invalidateQueries({ queryKey: ['strategies', studentId] });
            setCreatingTrade(false);
            setEditingTrade(null);
          }}
        />
      )}

      {/* IBKR import */}
      {!isMentor && (
        <ImportIbkrDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          studentId={studentId}
          onImported={() => qc.invalidateQueries({ queryKey: ['trades', studentId] })}
        />
      )}

      {/* Bulk tag dialog */}
      <BulkTagDialog
        open={bulkTagOpen}
        onClose={() => setBulkTagOpen(false)}
        tags={tags}
        onApply={(name) => bulkApplyTag.mutate({ ids: Array.from(selectedIds), tag: name })}
      />

      {/* Clear all dialog */}
      <ClearAllDialog
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        onConfirm={() => {
          softDelete.mutate(filteredTrades.map(t => t.id));
          setClearAllOpen(false);
        }}
        count={filteredTrades.length}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'up' | 'down' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent === 'up' ? 'text-emerald-500' : accent === 'down' ? 'text-rose-500' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: TradeRow['status'] }) {
  const map = {
    open: { label: 'פתוח', cls: 'bg-blue-500/10 text-blue-500' },
    closed: { label: 'סגור', cls: 'bg-emerald-500/10 text-emerald-500' },
    expired: { label: 'פג תוקף', cls: 'bg-amber-500/10 text-amber-500' },
    cancelled: { label: 'בוטל', cls: 'bg-muted text-muted-foreground' },
  } as const;
  const m = map[status];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
}

function DateRangeFilter({ range, onChange }: { range: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const hasFilter = !!range?.from;
  const label = hasFilter
    ? range?.to && range.to.getTime() !== range.from!.getTime()
      ? `${format(range.from!, 'dd.MM.yy', { locale: he })} – ${format(range.to, 'dd.MM.yy', { locale: he })}`
      : format(range.from!, 'dd.MM.yy', { locale: he })
    : 'תאריך';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 gap-2 text-xs ${hasFilter ? 'border-primary text-primary bg-primary/5' : ''}`}>
          <CalendarDays className="w-3.5 h-3.5" />
          {label}
          {hasFilter && (
            <X className="w-3 h-3 hover:text-destructive" onClick={(e) => { e.stopPropagation(); onChange(undefined); }} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={range} onSelect={onChange} numberOfMonths={1} locale={he} />
      </PopoverContent>
    </Popover>
  );
}

// ─── Trade detail panel (slide-in) ────────────────────────────────────────────
function TradeDetailPanel({
  trade, strategies, isMentor, onClose, onSaveMentor, onEdit,
}: {
  trade: TradeRow;
  strategies: StrategyRow[];
  isMentor: boolean;
  onClose: () => void;
  onSaveMentor: (rating: number | null, notes: string | null) => void;
  onEdit?: () => void;
}) {
  const [rating, setRating] = useState<number | null>(trade.mentor_rating);
  const [mNotes, setMNotes] = useState<string>(trade.mentor_notes ?? '');
  const strategy = strategies.find(s => s.id === trade.strategy_id);
  const pnl = trade.net_pnl ?? computePnl(trade);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 end-0 h-full w-full md:w-[480px] bg-card z-50 shadow-2xl border-s border-border overflow-y-auto"
        dir="rtl"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              {trade.symbol}
              <StatusBadge status={trade.status} />
            </h2>
            <div>
              {onEdit && (
                <button onClick={onEdit} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <DetailItem icon={<Hash />} label="כיוון" value={trade.side === 'long' ? 'Long' : 'Short'} />
            <DetailItem icon={<Wallet />} label="כמות" value={fmtNum(trade.quantity, 2)} />
            <DetailItem label="כניסה" value={fmtNum(trade.entry_price)} />
            <DetailItem label="יציאה" value={fmtNum(trade.exit_price)} />
            <DetailItem label="תאריך כניסה" value={fmtDate(trade.entry_date)} />
            <DetailItem label="תאריך יציאה" value={fmtDate(trade.exit_date)} />
            <DetailItem label="עמלה" value={fmtMoney(trade.commission)} />
            <DetailItem
              label="P&L נטו"
              value={fmtMoney(pnl)}
              accent={pnl == null ? undefined : pnl >= 0 ? 'up' : 'down'}
            />
          </div>

          {strategy && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">אסטרטגיה</p>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                {strategy.name}
              </span>
            </div>
          )}

          {trade.tags?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1.5">תגיות</p>
              <div className="flex flex-wrap gap-1.5">
                {trade.tags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded bg-muted text-foreground text-[11px]">{t}</span>
                ))}
              </div>
            </div>
          )}

          {trade.option_strategy && (
            <div className="mb-4 bg-accent/5 border border-accent/20 rounded-lg p-3">
              <p className="text-xs text-accent font-medium mb-1">אופציות</p>
              <p className="text-xs text-muted-foreground">
                סוג: {trade.option_strategy} · Strike: {fmtNum(trade.strike)} · תפוגה: {trade.expiry_date ?? '—'}
              </p>
            </div>
          )}

          {trade.notes && (
            <div className="mb-5">
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><FileText className="w-3 h-3" />הערות</p>
              <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{trade.notes}</p>
            </div>
          )}

          {trade.images?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-muted-foreground mb-1.5">צילומי מסך</p>
              <div className="grid grid-cols-2 gap-2">
                {trade.images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-video rounded-lg overflow-hidden bg-muted">
                    <img src={url} alt={`screenshot ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Mentor section */}
          {isMentor ? (
            <div className="mt-6 pt-5 border-t border-border space-y-3">
              <p className="text-sm font-bold text-foreground">משוב מנטור</p>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">דירוג</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setRating(n === rating ? null : n)}
                      className="p-1"
                    >
                      <Star className={`w-5 h-5 ${rating != null && n <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">הערות מנטור</p>
                <textarea
                  value={mNotes}
                  onChange={(e) => setMNotes(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background p-2.5 text-sm"
                  placeholder="כתוב משוב לתלמיד..."
                />
              </div>
              <Button onClick={() => onSaveMentor(rating, mNotes.trim() ? mNotes : null)} className="w-full gap-2">
                <Save className="w-4 h-4" />שמור משוב
              </Button>
            </div>
          ) : (trade.mentor_rating != null || trade.mentor_notes) ? (
            <div className="mt-6 pt-5 border-t border-border space-y-2 bg-amber-500/5 -mx-6 px-6 py-4 border-amber-500/20">
              <p className="text-sm font-bold text-amber-500 flex items-center gap-2">
                <Star className="w-4 h-4 fill-amber-500" />משוב מנטור
              </p>
              {trade.mentor_rating != null && (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} className={`w-4 h-4 ${n <= trade.mentor_rating! ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`} />
                  ))}
                </div>
              )}
              {trade.mentor_notes && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{trade.mentor_notes}</p>
              )}
            </div>
          ) : null}
        </div>
      </motion.div>
    </>
  );
}

function DetailItem({ label, value, icon, accent }: { label: string; value: string; icon?: React.ReactNode; accent?: 'up' | 'down' }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">{icon ? <span className="[&_svg]:w-3 [&_svg]:h-3">{icon}</span> : null}{label}</p>
      <p className={`text-sm font-semibold ${accent === 'up' ? 'text-emerald-500' : accent === 'down' ? 'text-rose-500' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

// ─── Trade form dialog (create/edit) ──────────────────────────────────────────
function TradeFormDialog({
  trade, studentId, strategies, tags, onClose, onSaved,
}: {
  trade: TradeRow | null;
  studentId: string;
  strategies: StrategyRow[];
  tags: TagRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!trade;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    symbol: trade?.symbol ?? '',
    side: trade?.side ?? 'long' as 'long' | 'short',
    quantity: trade?.quantity?.toString() ?? '',
    entry_price: trade?.entry_price?.toString() ?? '',
    exit_price: trade?.exit_price?.toString() ?? '',
    entry_date: trade?.entry_date ? trade.entry_date.slice(0, 16) : '',
    exit_date: trade?.exit_date ? trade.exit_date.slice(0, 16) : '',
    commission: trade?.commission?.toString() ?? '0',
    status: trade?.status ?? 'open',
    strategy_id: trade?.strategy_id ?? '',
    is_demo: trade?.is_demo ?? false,
    notes: trade?.notes ?? '',
    tagInput: '',
    tags: trade?.tags ?? [],
    images: trade?.images ?? [] as string[],
  });

  const addTag = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (form.tags.includes(name)) return;
    setForm(f => ({ ...f, tags: [...f.tags, name], tagInput: '' }));
  };

  const removeTag = (name: string) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== name) }));

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() || 'png';
        const path = `trade-images/${studentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('lesson-assets').upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('lesson-assets').getPublicUrl(path);
        uploaded.push(pub.publicUrl);
      }
      setForm(f => ({ ...f, images: [...f.images, ...uploaded] }));
    } catch (e: any) {
      toast({ title: 'שגיאת העלאה', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.symbol.trim() || !form.quantity) {
      toast({ title: 'חסרים שדות', description: 'יש למלא סימול וכמות', variant: 'destructive' });
      return;
    }

    // Save any new tags to user_tags dictionary (best-effort)
    for (const t of form.tags) {
      if (!tags.find(x => x.name === t)) {
        await supabase.from('user_tags').insert({ user_id: studentId, name: t }).select().single().then(() => {}, () => {});
      }
    }

    const payload: any = {
      user_id: studentId,
      symbol: form.symbol.trim().toUpperCase(),
      side: form.side,
      quantity: Number(form.quantity),
      entry_price: form.entry_price ? Number(form.entry_price) : null,
      exit_price: form.exit_price ? Number(form.exit_price) : null,
      entry_date: form.entry_date ? new Date(form.entry_date).toISOString() : null,
      exit_date: form.exit_date ? new Date(form.exit_date).toISOString() : null,
      commission: form.commission ? Number(form.commission) : 0,
      status: form.status,
      strategy_id: form.strategy_id || null,
      is_demo: form.is_demo,
      notes: form.notes.trim() || null,
      tags: form.tags,
      images: form.images,
      import_source: trade?.id ? undefined : 'manual',
    };

    // Auto-compute net_pnl if we have both prices
    payload.net_pnl = computePnl({
      side: payload.side,
      entry_price: payload.entry_price,
      exit_price: payload.exit_price,
      quantity: payload.quantity,
      commission: payload.commission,
    });

    if (isEditing) {
      const { error } = await supabase.from('trades').update(payload).eq('id', trade!.id);
      if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase.from('trades').insert(payload);
      if (error) { toast({ title: 'שגיאה', description: error.message, variant: 'destructive' }); return; }
    }

    toast({ title: isEditing ? 'נשמר' : 'נוצר' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'עריכת עסקה' : 'עסקה חדשה'}</DialogTitle>
          <DialogDescription>הזן את פרטי העסקה. P&L יחושב אוטומטית מהמחירים.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs text-muted-foreground">סימול *</label>
            <Input value={form.symbol} onChange={(e) => setForm(f => ({ ...f, symbol: e.target.value }))} placeholder="AAPL" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">כיוון</label>
            <select value={form.side} onChange={(e) => setForm(f => ({ ...f, side: e.target.value as any }))} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">כמות *</label>
            <Input type="number" step="any" value={form.quantity} onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מחיר כניסה</label>
            <Input type="number" step="any" value={form.entry_price} onChange={(e) => setForm(f => ({ ...f, entry_price: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מחיר יציאה</label>
            <Input type="number" step="any" value={form.exit_price} onChange={(e) => setForm(f => ({ ...f, exit_price: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">תאריך כניסה</label>
            <Input type="datetime-local" value={form.entry_date} onChange={(e) => setForm(f => ({ ...f, entry_date: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">תאריך יציאה</label>
            <Input type="datetime-local" value={form.exit_date} onChange={(e) => setForm(f => ({ ...f, exit_date: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">עמלה</label>
            <Input type="number" step="any" value={form.commission} onChange={(e) => setForm(f => ({ ...f, commission: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">סטטוס</label>
            <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as any }))} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              <option value="open">פתוח</option>
              <option value="closed">סגור</option>
              <option value="expired">פג תוקף</option>
              <option value="cancelled">בוטל</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">אסטרטגיה</label>
            <select value={form.strategy_id} onChange={(e) => setForm(f => ({ ...f, strategy_id: e.target.value }))} className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              <option value="">— ללא —</option>
              {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">תגיות</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={form.tagInput}
                onChange={(e) => setForm(f => ({ ...f, tagInput: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(form.tagInput); } }}
                placeholder="הוסף תגית ולחץ Enter"
                list="tag-suggestions"
              />
              <datalist id="tag-suggestions">
                {tags.map(t => <option key={t.id} value={t.name} />)}
              </datalist>
              <Button type="button" variant="outline" onClick={() => addTag(form.tagInput)}>הוסף</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-foreground text-xs">
                    {t}
                    <button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">הערות</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background p-2.5 text-sm"
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">צילומי מסך</label>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                <Upload className="w-3.5 h-3.5" />{uploading ? 'מעלה...' : 'העלה'}
              </Button>
              {form.images.map((url, i) => (
                <div key={i} className="relative w-16 h-12 rounded overflow-hidden bg-muted group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}
                    className="absolute top-0.5 end-0.5 w-4 h-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2 flex items-center gap-2 pt-2">
            <Switch checked={form.is_demo} onCheckedChange={(v) => setForm(f => ({ ...f, is_demo: v }))} />
            <span className="text-sm text-foreground">עסקת Demo (לא נכללת בסטטיסטיקות)</span>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" />{isEditing ? 'שמור שינויים' : 'צור עסקה'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk tag dialog ──────────────────────────────────────────────────────────
function BulkTagDialog({ open, onClose, tags, onApply }: { open: boolean; onClose: () => void; tags: TagRow[]; onApply: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>הוסף תגית לעסקאות נבחרות</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם תגית"
          list="bulk-tag-suggestions"
          className="mt-2"
        />
        <datalist id="bulk-tag-suggestions">
          {tags.map(t => <option key={t.id} value={t.name} />)}
        </datalist>
        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => name.trim() && onApply(name.trim())}>החל</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clear all dialog (typed DELETE confirmation) ─────────────────────────────
function ClearAllDialog({ open, onClose, onConfirm, count }: { open: boolean; onClose: () => void; onConfirm: () => void; count: number }) {
  const [text, setText] = useState('');
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />מחיקת כל העסקאות</AlertDialogTitle>
          <AlertDialogDescription>
            פעולה זו תעביר לפח {count} עסקאות. ניתן לשחזר תוך 30 יום.
            <br /><br />
            כדי לאשר, הקלד <span className="font-bold text-destructive">DELETE</span> בתיבה למטה.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" className="mt-2" />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setText('')}>ביטול</AlertDialogCancel>
          <AlertDialogAction
            disabled={text !== 'DELETE'}
            onClick={() => { onConfirm(); setText(''); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            מחק הכל
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
