import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useTrades } from '@/contexts/TradesContext';

interface Props { open: boolean; onClose: () => void }

export default function TrashBinModal({ open, onClose }: Props) {
  const {
    deletedTrades, loadDeletedTrades, restoreTrade, restoreAllTrades,
    permanentlyDeleteTrade, emptyTrash,
  } = useTrades();

  useEffect(() => { if (open) loadDeletedTrades(); }, [open, loadDeletedTrades]);

  const daysLeft = (deletedAt: string | null) => {
    if (!deletedAt) return 30;
    const ms = new Date(deletedAt).getTime() + 30 * 86400_000 - Date.now();
    return Math.max(0, Math.ceil(ms / 86400_000));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>פח אשפה ({deletedTrades.length})</DialogTitle></DialogHeader>

        <div className="text-xs text-muted-foreground">עסקאות נמחקות לצמיתות לאחר 30 ימים</div>

        <div className="space-y-2 max-h-96 overflow-auto">
          {deletedTrades.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">הפח ריק</div>}
          {deletedTrades.map((t) => {
            const days = daysLeft(t.deleted_at);
            return (
              <Card key={t.id} className="p-3 flex items-center gap-2">
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.side} · {t.quantity} · ${Number(t.net_pnl ?? 0).toFixed(2)}
                  </div>
                </div>
                <Badge variant={days <= 7 ? 'destructive' : 'outline'} className="text-[10px]">
                  נותרו {days} ימים
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => restoreTrade(t.id)} title="שחזר">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => { if (confirm('למחוק לצמיתות?')) permanentlyDeleteTrade(t.id); }}
                  className="text-destructive" title="מחק לצמיתות"
                ><Trash2 className="h-4 w-4" /></Button>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="gap-1">
          {deletedTrades.length > 0 && (
            <>
              <Button variant="outline" onClick={restoreAllTrades}>שחזר הכל</Button>
              <Button
                variant="destructive"
                onClick={() => { if (confirm('לרוקן את הפח? פעולה בלתי הפיכה')) emptyTrash(); }}
              >רוקן פח</Button>
            </>
          )}
          <Button onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
