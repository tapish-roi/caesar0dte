import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { parseAny } from '@/lib/parsers/detect';
import { dedupAgainstExisting } from '@/lib/dedup';
import { reconcileExpirations } from '@/lib/expiration-matcher';
import { useTrades } from '@/contexts/TradesContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { ParseResult } from '@/lib/parsers/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TradeImportModal({ open, onClose }: Props) {
  const { trades, addTrades, refetch, ownerId } = useTrades();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [fresh, setFresh] = useState<number>(0);
  const [duplicates, setDuplicates] = useState<number>(0);
  const [matchedExp, setMatchedExp] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const reset = () => {
    setParsed(null); setFresh(0); setDuplicates(0); setMatchedExp(0); setFileName('');
  };

  const onFile = async (file: File) => {
    setBusy(true); setFileName(file.name);
    try {
      const text = await file.text();
      const r = parseAny(text);
      setParsed(r);
      const existingIds = new Set(trades.map((t) => t.external_id).filter(Boolean) as string[]);
      const existingFps = new Set<string>(); // simple: rely on external_id
      const { fresh: f, duplicates: d } = dedupAgainstExisting(
        r.trades.map((p) => ({
          external_id: p.external_id, symbol: p.symbol, entry_date: p.entry_date,
          quantity: p.quantity, entry_price: p.entry_price, side: p.side,
        })),
        existingIds, existingFps,
      );
      const rec = reconcileExpirations(r.trades, trades.filter((t) => t.status === 'open'));
      setFresh(f.length);
      setDuplicates(d.length);
      setMatchedExp(rec.matchedExpirations);
    } catch (e) {
      toast({ title: 'שגיאה בקריאת קובץ', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!parsed || !ownerId) return;
    setBusy(true);
    try {
      const rec = reconcileExpirations(parsed.trades, trades.filter((t) => t.status === 'open'));
      // Apply expiration updates first
      for (const u of rec.toUpdate) {
        await supabase.from('trades').update(u.patch).eq('id', u.id);
      }
      // Insert new trades (dedupe handled by upsert on external_id)
      const result = await addTrades(rec.toInsert);
      await refetch();
      toast({
        title: 'ייבוא הצליח',
        description: `${result.inserted} עסקאות חדשות, ${rec.matchedExpirations} פגיות שודרגו לסגירה`,
      });
      reset(); onClose();
    } catch (e) {
      toast({ title: 'שגיאה בייבוא', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>ייבוא עסקאות מברוקר</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-accent/30">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-sm font-medium">גרור קובץ או לחץ לבחירה</div>
            <div className="text-xs text-muted-foreground mt-1">תומך: IBKR Flex Query, TD Ameritrade, NinjaTrader (CSV)</div>
            <input
              type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <Card className="p-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm flex-1 truncate">{fileName}</span>
              <Badge variant="outline">{parsed.broker.toUpperCase()}</Badge>
            </Card>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Card className="p-3"><div className="text-xs text-muted-foreground">חדש</div><div className="text-lg font-semibold text-emerald-500">{fresh}</div></Card>
              <Card className="p-3"><div className="text-xs text-muted-foreground">כפולים</div><div className="text-lg font-semibold text-muted-foreground">{duplicates}</div></Card>
              <Card className="p-3"><div className="text-xs text-muted-foreground">פגיות תואמו</div><div className="text-lg font-semibold text-primary">{matchedExp}</div></Card>
            </div>

            {parsed.errors.length > 0 && (
              <Card className="p-3 max-h-40 overflow-auto">
                <div className="flex items-center gap-1 text-xs font-medium mb-1 text-yellow-500">
                  <AlertCircle className="h-3 w-3" /> {parsed.errors.length} אזהרות
                </div>
                {parsed.errors.slice(0, 10).map((e, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground">שורה {e.row}: {e.message}</div>
                ))}
              </Card>
            )}

            <div className="flex items-center gap-1 text-xs text-emerald-500">
              <CheckCircle2 className="h-3 w-3" /> מוכן לאישור — לא תיווצרנה עסקאות מרשומות פגיות
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={busy}>ביטול</Button>
          {parsed && <Button onClick={onConfirm} disabled={busy || fresh + matchedExp === 0}>אשר ייבוא</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
