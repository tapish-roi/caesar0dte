import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Trash2, Tag, Upload,
} from 'lucide-react';
import type { TradeRow } from '@/contexts/TradesContext';
import type { Strategy } from '@/contexts/StrategiesContext';

interface Props {
  trades: TradeRow[];
  strategies: Strategy[];
  isReadOnly: boolean;
  onRowClick: (t: TradeRow) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkAddTags: (ids: string[], tags: string[]) => void;
  onOpenImport: () => void;
}

type SortKey = 'symbol' | 'side' | 'quantity' | 'entry_price' | 'exit_price' | 'entry_date' | 'exit_date' | 'net_pnl' | 'status';

const PAGE_SIZE = 25;
const fmtNum = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('he-IL') : '—';

export default function AdvancedTradesTable({ trades, strategies, isReadOnly, onRowClick, onBulkDelete, onBulkAddTags, onOpenImport }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');

  const sorted = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [trades, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const view = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(view.map((t) => t.id)) : new Set());
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  if (!trades.length) {
    return (
      <Card className="p-12 text-center" dir="rtl">
        <div className="text-muted-foreground mb-4">אין עסקאות עדיין</div>
        {!isReadOnly && (
          <Button onClick={onOpenImport} className="gap-2">
            <Upload className="h-4 w-4" /> ייבא קובץ ברוקר
          </Button>
        )}
      </Card>
    );
  }

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:text-foreground">
      {label}<ArrowUpDown className="h-3 w-3 opacity-60" />
    </button>
  );

  return (
    <Card className="bg-card/60 backdrop-blur" dir="rtl">
      {selected.size > 0 && !isReadOnly && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-xs">{selected.size} נבחרו</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1"><Tag className="h-3 w-3" /> הוסף תגיות</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="tag1, tag2" dir="auto" />
              <Button
                size="sm" className="w-full mt-2"
                onClick={() => {
                  const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
                  if (tags.length) {
                    onBulkAddTags([...selected], tags);
                    setTagInput(''); setSelected(new Set());
                  }
                }}
              >החל</Button>
            </PopoverContent>
          </Popover>
          <Button
            size="sm" variant="destructive" className="gap-1 ms-auto"
            onClick={() => { onBulkDelete([...selected]); setSelected(new Set()); }}
          ><Trash2 className="h-3 w-3" /> מחק נבחרים</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {!isReadOnly && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={view.length > 0 && view.every((t) => selected.has(t.id))}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
              )}
              <TableHead><SortHeader label="סימול" k="symbol" /></TableHead>
              <TableHead><SortHeader label="כיוון" k="side" /></TableHead>
              <TableHead><SortHeader label="כמות" k="quantity" /></TableHead>
              <TableHead><SortHeader label="כניסה" k="entry_price" /></TableHead>
              <TableHead><SortHeader label="יציאה" k="exit_price" /></TableHead>
              <TableHead><SortHeader label="תאריך כניסה" k="entry_date" /></TableHead>
              <TableHead><SortHeader label="תאריך יציאה" k="exit_date" /></TableHead>
              <TableHead><SortHeader label="P&L נטו" k="net_pnl" /></TableHead>
              <TableHead>אסטרטגיה</TableHead>
              <TableHead>תגיות</TableHead>
              <TableHead><SortHeader label="סטטוס" k="status" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((t) => {
              const pnl = Number(t.net_pnl ?? 0);
              const stratName = t.strategy_id ? strategies.find((s) => s.id === t.strategy_id)?.name : null;
              const isExpired = t.status === 'closed' && t.exit_price === 0;
              return (
                <TableRow
                  key={t.id} onClick={() => onRowClick(t)}
                  className="cursor-pointer hover:bg-accent/40"
                >
                  {!isReadOnly && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1">
                      {t.symbol}
                      {t.is_demo && <Badge variant="outline" className="text-[10px] py-0">דמו</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.side === 'long' ? 'default' : 'secondary'} className="text-[10px]">
                      {t.side === 'long' ? 'לונג' : 'שורט'}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtNum(Number(t.quantity))}</TableCell>
                  <TableCell>{fmtNum(t.entry_price as unknown as number)}</TableCell>
                  <TableCell>{fmtNum(t.exit_price as unknown as number)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(t.entry_date)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(t.exit_date)}</TableCell>
                  <TableCell className={pnl > 0 ? 'text-emerald-500' : pnl < 0 ? 'text-destructive' : ''}>
                    {t.net_pnl != null ? `$${fmtNum(pnl)}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{stratName ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {(t.tags ?? []).slice(0, 3).map((tg) => (
                        <Badge key={tg} variant="outline" className="text-[10px] py-0">#{tg}</Badge>
                      ))}
                      {(t.tags ?? []).length > 3 && <span className="text-[10px] text-muted-foreground">+{t.tags.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant={t.status === 'open' ? 'default' : 'outline'} className="text-[10px]">
                        {t.status === 'open' ? 'פתוח' : 'סגור'}
                      </Badge>
                      {isExpired && <Badge variant="secondary" className="text-[10px]">פגה</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs">
        <span className="text-muted-foreground">{sorted.length} עסקאות · עמוד {currentPage + 1}/{totalPages}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
