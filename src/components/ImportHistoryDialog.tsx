import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Upload, Trash2, History, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface BatchRow {
  import_batch_id: string;
  import_source: string;
  count: number;
  first_at: string;
  total_pnl: number;
  active_count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
}

export default function ImportHistoryDialog({ open, onClose, studentId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmRollback, setConfirmRollback] = useState<BatchRow | null>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['import_batches', studentId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('import_batch_id, import_source, created_at, net_pnl, deleted_at')
        .eq('user_id', studentId)
        .not('import_batch_id', 'is', null);
      if (error) throw error;

      const groups = new Map<string, BatchRow>();
      for (const r of data ?? []) {
        const id = r.import_batch_id as string;
        if (!groups.has(id)) {
          groups.set(id, {
            import_batch_id: id,
            import_source: (r.import_source as string) ?? 'unknown',
            count: 0,
            first_at: r.created_at as string,
            total_pnl: 0,
            active_count: 0,
          });
        }
        const g = groups.get(id)!;
        g.count++;
        if (r.deleted_at == null) g.active_count++;
        if (r.net_pnl != null) g.total_pnl += Number(r.net_pnl);
        if ((r.created_at as string) < g.first_at) g.first_at = r.created_at as string;
      }
      return Array.from(groups.values()).sort((a, b) => b.first_at.localeCompare(a.first_at));
    },
  });

  const rollback = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase
        .from('trades')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', studentId)
        .eq('import_batch_id', batchId)
        .is('deleted_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', studentId] });
      qc.invalidateQueries({ queryKey: ['import_batches', studentId] });
      toast({
        title: 'האצווה הוחזרה',
        description: 'כל העסקאות באצווה הועברו לפח (ניתן לשחזר תוך 30 יום).',
      });
      setConfirmRollback(null);
    },
    onError: (e: Error) =>
      toast({ title: 'שגיאה', description: e.message, variant: 'destructive' }),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              היסטוריית ייבוא
            </DialogTitle>
            <DialogDescription>
              כל אצווה שיובאה דרך IBKR או מקור חיצוני. ניתן לבטל אצווה שלמה — העסקאות יעברו לפח ויהיו ניתנות לשחזור תוך 30 יום.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : batches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">אין אצוות ייבוא עדיין</p>
                <p className="text-xs mt-1">לחץ "ייבוא IBKR" כדי לייבא קובץ Flex Query</p>
              </div>
            ) : (
              <div className="space-y-2">
                {batches.map(b => (
                  <BatchCard key={b.import_batch_id} batch={b} onRollback={() => setConfirmRollback(b)} />
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm rollback */}
      <AlertDialog open={confirmRollback != null} onOpenChange={(v) => !v && setConfirmRollback(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              לבטל את אצוות הייבוא?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRollback && (
                <>
                  פעולה זו תעביר {confirmRollback.active_count} עסקאות מהאצווה הזו לפח.
                  ניתן לשחזר את העסקאות תוך 30 יום מתוך הפח.
                  <br />
                  <span className="text-xs text-muted-foreground mt-2 block">
                    מקור: {confirmRollback.import_source} · {format(new Date(confirmRollback.first_at), 'd MMM yyyy, HH:mm', { locale: he })}
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRollback && rollback.mutate(confirmRollback.import_batch_id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rollback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'בטל אצווה'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BatchCard({ batch, onRollback }: { batch: BatchRow; onRollback: () => void }) {
  const allRolledBack = batch.active_count === 0;
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium">
            {batch.import_source === 'ibkr_flex' ? 'IBKR Flex' : batch.import_source}
          </span>
          {allRolledBack && (
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[11px] font-medium">
              בוטל
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-foreground">
          {batch.active_count} פעילות
          {batch.count !== batch.active_count && (
            <span className="text-muted-foreground"> · {batch.count - batch.active_count} בפח</span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(batch.first_at), 'd MMM yyyy, HH:mm', { locale: he })}
          {batch.total_pnl !== 0 && (
            <span className={`ms-2 font-medium ${batch.total_pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {batch.total_pnl >= 0 ? '+' : ''}${batch.total_pnl.toFixed(2)}
            </span>
          )}
        </p>
      </div>
      {!allRolledBack && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRollback}
          className="gap-1.5 text-destructive hover:text-destructive shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          בטל
        </Button>
      )}
    </div>
  );
}
