import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { useStrategies } from '@/contexts/StrategiesContext';
import { useTrades } from '@/contexts/TradesContext';

interface Props { open: boolean; onClose: () => void }

export default function StrategyManager({ open, onClose }: Props) {
  const { strategies, createStrategy, updateStrategy, deleteStrategy } = useStrategies();
  const { trades } = useTrades();
  const [name, setName] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editR, setEditR] = useState('');

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    trades.forEach((t) => {
      if (!t.strategy_id) return;
      const cur = map.get(t.strategy_id) ?? { count: 0, pnl: 0 };
      cur.count++; cur.pnl += Number(t.net_pnl ?? 0);
      map.set(t.strategy_id, cur);
    });
    return map;
  }, [trades]);

  const onCreate = async () => {
    if (!name.trim()) return;
    await createStrategy(name.trim(), rAmount ? Number(rAmount) : null);
    setName(''); setRAmount('');
  };

  const startEdit = (id: string, n: string, r: number | null) => {
    setEditingId(id); setEditName(n); setEditR(r != null ? String(r) : '');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>ניהול אסטרטגיות</DialogTitle></DialogHeader>

        <Card className="p-3 space-y-2">
          <div className="grid grid-cols-[1fr_120px_auto] gap-2">
            <Input placeholder="שם אסטרטגיה" value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
            <Input placeholder="R Amount ($)" type="number" value={rAmount} onChange={(e) => setRAmount(e.target.value)} />
            <Button onClick={onCreate} className="gap-1"><Plus className="h-4 w-4" /> הוסף</Button>
          </div>
        </Card>

        <div className="space-y-2 max-h-80 overflow-auto">
          {strategies.length === 0 && <div className="text-sm text-center text-muted-foreground py-4">אין אסטרטגיות עדיין</div>}
          {strategies.map((s) => {
            const st = stats.get(s.id) ?? { count: 0, pnl: 0 };
            const isEditing = editingId === s.id;
            return (
              <Card key={s.id} className="p-3 flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" dir="auto" />
                    <Input value={editR} onChange={(e) => setEditR(e.target.value)} type="number" className="w-24" placeholder="R" />
                    <Button size="icon" variant="ghost" onClick={async () => {
                      await updateStrategy(s.id, { name: editName, r_amount: editR ? Number(editR) : null });
                      setEditingId(null);
                    }}><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {st.count} עסקאות · ${st.pnl.toFixed(2)} P&L
                        {s.r_amount != null && ` · R=$${s.r_amount}`}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(s.id, s.name, s.r_amount as unknown as number | null)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteStrategy(s.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
