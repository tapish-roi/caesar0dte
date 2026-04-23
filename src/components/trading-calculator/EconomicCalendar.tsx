import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Native Economic Calendar — replaces the Investing.com iframe with a styled
// list of events fetched server-side via the fetch-economic-calendar edge fn.
// ─────────────────────────────────────────────────────────────────────────────

interface EconomicEvent {
  id: string;
  date: string;
  time: string;
  country: string;
  countryCode: string;
  currency: string;
  importance: 1 | 2 | 3;
  event: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

interface ApiResponse {
  success: boolean;
  events: EconomicEvent[];
  count: number;
  fetchedAt: string;
  error?: string;
}

const DAY_LABELS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_LABELS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_LABELS_HE[d.getDay()]}, ${d.getDate()} ${MONTH_LABELS_HE[d.getMonth()]}`;
}

function ImportanceBulls({ level }: { level: 1 | 2 | 3 }) {
  const color =
    level === 3 ? 'text-red-400' : level === 2 ? 'text-amber-400' : 'text-muted-foreground/60';
  return (
    <div className="flex items-center gap-0.5" title={`חשיבות ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'text-[11px] leading-none',
            i <= level ? color : 'text-muted-foreground/25',
          )}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function CountryFlag({ code, currency }: { code: string; currency: string }) {
  // Emoji flag from ISO-2; EU has a special block
  const flag =
    code === 'EU'
      ? '🇪🇺'
      : code.length === 2
        ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
        : '🌐';
  return (
    <div className="flex items-center gap-1.5 min-w-[3.5rem]">
      <span className="text-base leading-none">{flag}</span>
      <span className="text-[11px] font-semibold text-muted-foreground">{currency}</span>
    </div>
  );
}

function valueClass(actual: string | null, forecast: string | null) {
  if (!actual || !forecast) return 'text-foreground';
  const a = parseFloat(actual.replace(/[^\d.\-]/g, ''));
  const f = parseFloat(forecast.replace(/[^\d.\-]/g, ''));
  if (isNaN(a) || isNaN(f)) return 'text-foreground';
  if (a > f) return 'text-emerald-400';
  if (a < f) return 'text-red-400';
  return 'text-foreground';
}

type ImportanceFilter = 0 | 1 | 2 | 3; // 0 = all

export default function EconomicCalendar() {
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>(0);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ApiResponse>({
    queryKey: ['economic-calendar'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-economic-calendar');
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Failed to load calendar');
      return data as ApiResponse;
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    if (!data?.events) return [];
    if (importanceFilter === 0) return data.events;
    return data.events.filter((e) => e.importance >= importanceFilter);
  }, [data, importanceFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const ev of filtered) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    // sort by date
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">חשיבות:</span>
          {([
            { v: 0 as const, label: 'הכל' },
            { v: 1 as const, label: '★' },
            { v: 2 as const, label: '★★' },
            { v: 3 as const, label: '★★★' },
          ]).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setImportanceFilter(opt.v)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                importanceFilter === opt.v
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {data?.fetchedAt && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              עודכן {new Date(data.fetchedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={() => refetch()} size="sm" variant="outline" disabled={isFetching}>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            רענון
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-border">
        {isLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <div className="p-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
            <p className="text-sm text-foreground mb-1">שגיאה בטעינת הנתונים</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'נסה שוב'}
            </p>
          </div>
        )}

        {!isLoading && !isError && grouped.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            אין אירועים להצגה
          </div>
        )}

        {grouped.map(([date, events]) => (
          <section key={date}>
            <header className="px-4 py-2 bg-muted/30 border-b border-border sticky top-0 backdrop-blur-sm z-[1]">
              <h3 className="text-sm font-semibold text-foreground">{formatDateHeader(date)}</h3>
            </header>

            {/* Column headers (desktop only) */}
            <div className="hidden md:grid grid-cols-[60px_80px_1fr_80px_80px_80px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-background/40">
              <span>שעה</span>
              <span>מדינה</span>
              <span>אירוע</span>
              <span className="text-end">בפועל</span>
              <span className="text-end">תחזית</span>
              <span className="text-end">קודם</span>
            </div>

            <ul className="divide-y divide-border/50">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="px-4 py-2.5 hover:bg-muted/20 transition-colors"
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[60px_80px_1fr_80px_80px_80px] gap-3 items-center text-sm">
                    <span className="text-xs font-mono text-muted-foreground">{ev.time || '—'}</span>
                    <CountryFlag code={ev.countryCode} currency={ev.currency} />
                    <div className="flex items-center gap-2 min-w-0">
                      <ImportanceBulls level={ev.importance} />
                      <span className="text-foreground truncate" title={ev.event}>{ev.event}</span>
                    </div>
                    <span className={cn('text-end font-mono text-sm', valueClass(ev.actual, ev.forecast))}>
                      {ev.actual ?? '—'}
                    </span>
                    <span className="text-end font-mono text-sm text-muted-foreground">{ev.forecast ?? '—'}</span>
                    <span className="text-end font-mono text-sm text-muted-foreground">{ev.previous ?? '—'}</span>
                  </div>

                  {/* Mobile row */}
                  <div className="md:hidden flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">{ev.time || '—'}</span>
                        <CountryFlag code={ev.countryCode} currency={ev.currency} />
                        <ImportanceBulls level={ev.importance} />
                      </div>
                    </div>
                    <p className="text-sm text-foreground leading-snug">{ev.event}</p>
                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-border/30">
                      <div className="flex flex-col items-start">
                        <span className="text-[9px] uppercase text-muted-foreground">בפועל</span>
                        <span className={valueClass(ev.actual, ev.forecast)}>{ev.actual ?? '—'}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] uppercase text-muted-foreground">תחזית</span>
                        <span className="text-foreground">{ev.forecast ?? '—'}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase text-muted-foreground">קודם</span>
                        <span className="text-muted-foreground">{ev.previous ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="px-4 py-2 text-[10px] text-muted-foreground text-center border-t border-border">
        נתונים מ-Investing.com
      </div>
    </div>
  );
}
