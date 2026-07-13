import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Check, ChevronDown, X, CalendarDays } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import type { TradeRow } from '@/contexts/TradesContext';
import type { Strategy } from '@/contexts/StrategiesContext';

export interface JournalFilterState {
  dateRange: DateRange | undefined;
  symbols: string[];
  strategies: string[];
  tags: string[];
  side: 'all' | 'long' | 'short';
  showDemo: boolean;
}

export const emptyFilters: JournalFilterState = {
  dateRange: undefined, symbols: [], strategies: [], tags: [], side: 'all', showDemo: false,
};

interface Props {
  trades: TradeRow[];
  strategies: Strategy[];
  allTags: string[];
  filters: JournalFilterState;
  onChange: (f: JournalFilterState) => void;
}

function MultiPicker({ label, options, selected, onChange }: {
  label: string; options: { value: string; label: string }[]; selected: string[]; onChange: (s: string[]) => void;
}) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between min-w-[140px]">
          <span className="truncate">{label}{selected.length ? ` (${selected.length})` : ''}</span>
          <ChevronDown className="h-3 w-3 ms-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1 max-h-72 overflow-auto" align="start">
        {options.length === 0 && <div className="text-xs text-muted-foreground p-2">אין אפשרויות</div>}
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-accent text-start"
          >
            <span className="truncate">{o.label}</span>
            {selected.includes(o.value) && <Check className="h-3 w-3 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function JournalFilters({ trades, strategies, allTags, filters, onChange }: Props) {
  const symbolOptions = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => set.add(t.symbol));
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [trades]);

  const stratOptions = useMemo(
    () => strategies.map((s) => ({ value: s.id, label: s.name })),
    [strategies],
  );
  const tagOptions = useMemo(() => allTags.map((t) => ({ value: t, label: t })), [allTags]);

  const set = (patch: Partial<JournalFilterState>) => onChange({ ...filters, ...patch });
  const hasAny =
    filters.dateRange?.from || filters.symbols.length || filters.strategies.length ||
    filters.tags.length || filters.side !== 'all' || filters.showDemo;

  return (
    <Card className="p-3 bg-card/60 backdrop-blur" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {filters.dateRange?.from
                ? `${format(filters.dateRange.from, 'dd/MM/yy')}${filters.dateRange.to ? ` – ${format(filters.dateRange.to, 'dd/MM/yy')}` : ''}`
                : 'טווח תאריכים'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={filters.dateRange} onSelect={(r) => set({ dateRange: r })} numberOfMonths={2} />
          </PopoverContent>
        </Popover>

        <MultiPicker label="סימולים" options={symbolOptions} selected={filters.symbols} onChange={(s) => set({ symbols: s })} />
        <MultiPicker label="אסטרטגיות" options={stratOptions} selected={filters.strategies} onChange={(s) => set({ strategies: s })} />
        <MultiPicker label="תגיות" options={tagOptions} selected={filters.tags} onChange={(s) => set({ tags: s })} />

        <div className="flex items-center gap-1">
          {(['all', 'long', 'short'] as const).map((s) => (
            <Button key={s} size="sm" variant={filters.side === s ? 'default' : 'outline'} onClick={() => set({ side: s })}>
              {s === 'all' ? 'הכל' : s === 'long' ? 'לונג' : 'שורט'}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="demo-toggle" className="text-xs cursor-pointer">דמו</Label>
          <Switch id="demo-toggle" checked={filters.showDemo} onCheckedChange={(v) => set({ showDemo: v })} />
        </div>

        {hasAny && (
          <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)} className="gap-1 ms-auto">
            <X className="h-3 w-3" /> נקה הכל
          </Button>
        )}
      </div>

      {(filters.symbols.length || filters.strategies.length || filters.tags.length) ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {filters.symbols.map((s) => (
            <Badge key={`s-${s}`} variant="secondary" className="gap-1">
              {s}<X className="h-3 w-3 cursor-pointer" onClick={() => set({ symbols: filters.symbols.filter((x) => x !== s) })} />
            </Badge>
          ))}
          {filters.strategies.map((id) => (
            <Badge key={`st-${id}`} variant="secondary" className="gap-1">
              {strategies.find((x) => x.id === id)?.name ?? id}
              <X className="h-3 w-3 cursor-pointer" onClick={() => set({ strategies: filters.strategies.filter((x) => x !== id) })} />
            </Badge>
          ))}
          {filters.tags.map((t) => (
            <Badge key={`t-${t}`} variant="secondary" className="gap-1">
              #{t}<X className="h-3 w-3 cursor-pointer" onClick={() => set({ tags: filters.tags.filter((x) => x !== t) })} />
            </Badge>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function applyFilters(trades: TradeRow[], f: JournalFilterState): TradeRow[] {
  return trades.filter((t) => {
    if (!f.showDemo && t.is_demo) return false;
    if (f.side !== 'all' && t.side !== f.side) return false;
    if (f.symbols.length && !f.symbols.includes(t.symbol)) return false;
    if (f.strategies.length && (!t.strategy_id || !f.strategies.includes(t.strategy_id))) return false;
    if (f.tags.length && !(t.tags ?? []).some((x) => f.tags.includes(x))) return false;
    if (f.dateRange?.from) {
      const d = t.entry_date ? new Date(t.entry_date) : null;
      if (!d) return false;
      // Compare against day boundaries so a trade any time on the end day is included
      // and one at the start of the from-day isn't excluded.
      if (d < startOfDay(f.dateRange.from)) return false;
      if (f.dateRange.to && d > endOfDay(f.dateRange.to)) return false;
    }
    return true;
  });
}
