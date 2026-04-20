import { useRef, useState } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseIbkrFlexCsv, type ParseResult, type ParsedTrade } from '@/lib/ibkr-import';

interface ImportIbkrDialogProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  onImported: () => void;
}

export default function ImportIbkrDialog({ open, onClose, studentId, onImported }: ImportIbkrDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const reset = () => { setFileName(null); setResult(null); setParsing(false); };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setParsing(true);
    try {
      const text = await file.text();
      const r = parseIbkrFlexCsv(text);
      setResult(r);
    } catch (err) {
      toast({ title: 'שגיאה בקריאת הקובץ', description: String((err as Error).message), variant: 'destructive' });
      setResult(null);
    } finally {
      setParsing(false);
    }
  };

  const importMutation = useMutation({
    mutationFn: async (trades: ParsedTrade[]) => {
      if (trades.length === 0) throw new Error('אין עסקאות לייבוא');
      const batchId = crypto.randomUUID();

      // Find existing external_ids to skip duplicates
      const ids = trades.map(t => t.external_id);
      const { data: existing } = await supabase
        .from('trades')
        .select('external_id')
        .eq('user_id', studentId)
        .in('external_id', ids);
      const existingSet = new Set((existing ?? []).map(r => r.external_id).filter(Boolean));

      const fresh = trades.filter(t => !existingSet.has(t.external_id));
      if (fresh.length === 0) return { inserted: 0, skipped: trades.length, batchId };

      const rows = fresh.map(t => ({
        user_id: studentId,
        symbol: t.symbol,
        side: t.side,
        quantity: t.quantity,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        entry_date: t.entry_date,
        exit_date: t.exit_date,
        commission: t.commission,
        net_pnl: t.net_pnl,
        status: t.status,
        option_strategy: t.option_strategy,
        option_legs: t.option_legs as unknown as never,
        strike: t.strike,
        expiry_date: t.expiry_date,
        notes: t.notes,
        external_id: t.external_id,
        group_key: t.group_key,
        import_source: 'ibkr_flex',
        import_batch_id: batchId,
        tags: [],
        images: [],
        is_demo: false,
      }));

      // Insert in chunks to avoid request size limits
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from('trades').insert(chunk);
        if (error) throw error;
      }
      return { inserted: fresh.length, skipped: trades.length - fresh.length, batchId };
    },
    onSuccess: (info) => {
      toast({
        title: 'הייבוא הושלם',
        description: `יובאו ${info.inserted} עסקאות (${info.skipped} כפילויות דולגו).`,
      });
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      onImported();
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'שגיאה בייבוא', description: err.message, variant: 'destructive' });
    },
  });

  const close = () => { if (!importMutation.isPending) { reset(); onClose(); } };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>ייבוא עסקאות מ-IBKR (Flex Query CSV)</DialogTitle>
          <DialogDescription>
            העלה קובץ CSV שיוצא מ-Interactive Brokers Flex Query (חלק "Trades").
            המערכת תזהה אוטומטית עסקאות מניות, רגלי אופציות, ותקבץ אסטרטגיות מרובות-רגליים.
            עסקאות שכבר יובאו (לפי TradeID) ידולגו.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          {!result && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {parsing ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>מנתח את הקובץ…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="w-8 h-8" />
                  <p className="font-medium text-foreground">גרור קובץ CSV או לחץ לבחירה</p>
                  <p className="text-xs">פורמט: IBKR Flex Query — Trades section</p>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{fileName}</span>
                </div>
                <button onClick={reset} className="p-1 hover:bg-muted rounded" title="נקה">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <SummaryCard label="שורות בקובץ" value={result.rawCount} />
                <SummaryCard label="עסקאות שזוהו" value={result.trades.length} accent="up" />
                <SummaryCard label="שורות שדולגו" value={result.skipped} />
              </div>

              {result.warnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <ul className="space-y-1">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {result.trades.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr className="text-right">
                          <th className="p-2 font-medium">סימול</th>
                          <th className="p-2 font-medium">סוג</th>
                          <th className="p-2 font-medium">כיוון</th>
                          <th className="p-2 font-medium">כמות</th>
                          <th className="p-2 font-medium">P&L</th>
                          <th className="p-2 font-medium">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.slice(0, 50).map((t, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="p-2 font-medium">{t.symbol}</td>
                            <td className="p-2 text-muted-foreground">
                              {t.asset_class === 'option'
                                ? (t.option_legs && t.option_legs.length > 1 ? `${t.option_strategy} (${t.option_legs.length})` : t.option_strategy)
                                : 'מניה'}
                            </td>
                            <td className="p-2">{t.side === 'long' ? 'לונג' : 'שורט'}</td>
                            <td className="p-2">{t.quantity}</td>
                            <td className={`p-2 ${t.net_pnl == null ? 'text-muted-foreground' : t.net_pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {t.net_pnl == null ? '—' : `$${t.net_pnl.toFixed(2)}`}
                            </td>
                            <td className="p-2">
                              <StatusPill status={t.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.trades.length > 50 && (
                      <p className="p-2 text-center text-xs text-muted-foreground bg-muted/30 border-t border-border/50">
                        מציג 50 מתוך {result.trades.length} עסקאות
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse">
          <Button
            onClick={() => result && importMutation.mutate(result.trades)}
            disabled={!result || result.trades.length === 0 || importMutation.isPending}
            className="gap-2"
          >
            {importMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> מייבא…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> ייבא {result?.trades.length ?? 0} עסקאות</>
            )}
          </Button>
          <Button variant="outline" onClick={close} disabled={importMutation.isPending}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: 'up' }) {
  return (
    <div className="p-3 rounded-lg bg-muted/40 border border-border">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent === 'up' ? 'text-emerald-500' : ''}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: 'פתוח', cls: 'bg-blue-500/15 text-blue-400' },
    closed: { label: 'סגור', cls: 'bg-emerald-500/15 text-emerald-400' },
    expired: { label: 'פג', cls: 'bg-amber-500/15 text-amber-400' },
    cancelled: { label: 'בוטל', cls: 'bg-muted text-muted-foreground' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
