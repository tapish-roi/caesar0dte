import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, AlertCircle, Check, ChevronDown, Globe2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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

type ImportanceLevel = 1 | 2 | 3;

function flagEmoji(code: string): string {
  if (code === 'EU') return '🇪🇺';
  if (code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function EconomicCalendar() {
  // Multi-select importance — default: all three levels checked
  const [importanceLevels, setImportanceLevels] = useState<Set<ImportanceLevel>>(
    () => new Set<ImportanceLevel>([1, 2, 3]),
  );
  // Multi-select countries — empty = all
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set());
  const [countrySearch, setCountrySearch] = useState('');

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

  // Build country list from current dataset, sorted by event-count desc.
  // Key by countryCode + currency to disambiguate (e.g. EU=EUR, US=USD).
  const countryOptions = useMemo(() => {
    if (!data?.events) return [] as { key: string; code: string; name: string; currency: string; count: number }[];
    const map = new Map<string, { key: string; code: string; name: string; currency: string; count: number }>();
    for (const ev of data.events) {
      const key = `${ev.countryCode}|${ev.currency}`;
      if (!key || key === '|') continue;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, code: ev.countryCode, name: ev.country, currency: ev.currency, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data]);

  const filteredCountryOptions = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countryOptions;
    return countryOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [countryOptions, countrySearch]);

  const filtered = useMemo(() => {
    if (!data?.events) return [];
    return data.events.filter((e) => {
      if (!importanceLevels.has(e.importance)) return false;
      if (selectedCountries.size > 0) {
        const evKey = `${e.countryCode}|${e.currency}`;
        if (!selectedCountries.has(evKey)) return false;
      }
      return true;
    });
  }, [data, importanceLevels, selectedCountries]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const ev of filtered) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleImportance = (lvl: ImportanceLevel) => {
    setImportanceLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) {
        if (next.size > 1) next.delete(lvl); // keep at least one
      } else next.add(lvl);
      return next;
    });
  };

  const toggleCountry = (key: string) => {
    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const importanceOptions: { v: ImportanceLevel; label: string; color: string }[] = [
    { v: 1, label: '★', color: 'text-muted-foreground' },
    { v: 2, label: '★★', color: 'text-amber-400' },
    { v: 3, label: '★★★', color: 'text-red-400' },
  ];

  const countryButtonLabel =
    selectedCountries.size === 0
      ? 'כל המדינות'
      : selectedCountries.size === 1
        ? (() => {
            const k = Array.from(selectedCountries)[0];
            const opt = countryOptions.find((c) => c.key === k);
            return opt ? `${flagEmoji(opt.code)} ${opt.currency}` : k;
          })()
        : `${selectedCountries.size} מדינות`;

  return (
    <div className="bg-card rounded-2xl card-shadow border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          {/* Importance multi-select chips */}
          <div className="flex items-center gap-1.5 ps-1">
            <span className="text-xs text-muted-foreground">חשיבות:</span>
            {importanceOptions.map((opt) => {
              const active = importanceLevels.has(opt.v);
              return (
                <button
                  key={opt.v}
                  onClick={() => toggleImportance(opt.v)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all border',
                    active
                      ? 'bg-primary/15 border-primary/40 text-foreground shadow-sm'
                      : 'bg-secondary/30 border-transparent text-muted-foreground/60 hover:bg-secondary/60',
                  )}
                  title={`חשיבות ${opt.v}/3`}
                >
                  <span className={cn(active ? opt.color : 'opacity-60')}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Country multi-select popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                disabled={countryOptions.length === 0}
              >
                <Globe2 className="w-3.5 h-3.5" />
                <span>{countryButtonLabel}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" dir="rtl">
              <div className="p-2 border-b border-border flex items-center gap-2">
                <Input
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="חפש מדינה..."
                  className="h-8 text-xs"
                />
                {selectedCountries.size > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => setSelectedCountries(new Set())}
                    title="נקה בחירה"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filteredCountryOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">לא נמצאו תוצאות</p>
                ) : (
                  filteredCountryOptions.map((c) => {
                    const checked = selectedCountries.has(c.key);
                    return (
                      <button
                        key={c.key}
                        onClick={() => toggleCountry(c.key)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors',
                          checked && 'bg-primary/10',
                        )}
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span className="text-base leading-none">{flagEmoji(c.code)}</span>
                        <span className="flex-1 text-start truncate text-foreground">{c.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{c.currency}</span>
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">{c.count}</span>
                        {checked && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Active filters summary / clear-all */}
          {(selectedCountries.size > 0 || importanceLevels.size < 3) && (
            <button
              onClick={() => {
                setSelectedCountries(new Set());
                setImportanceLevels(new Set([1, 2, 3]));
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              נקה הכל
            </button>
          )}
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
