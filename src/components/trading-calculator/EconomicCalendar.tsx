import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertIcon, CheckIcon, ChevronDownIcon, CloseIcon, GlobeIcon, LoaderIcon, RefreshIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Edge function requests the calendar in UTC (timeZone=55), so we treat the
// raw timestamps as UTC and convert to the user's resolved IANA timezone.
const SOURCE_TZ = 'UTC';
const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Compute the offset (in minutes) of a given UTC instant in a target IANA tz.
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second),
  );
  return (asUtc - utcMs) / 60000;
}

// Treat "YYYY-MM-DD HH:MM" as wall-clock time in `tz` and return UTC ms.
function zonedWallClockToUtc(date: string, time: string, tz: string): number {
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const guess = Date.UTC(Y, (M ?? 1) - 1, D ?? 1, h ?? 0, m ?? 0, 0);
  // Iterate twice to converge across DST boundaries.
  let offset = tzOffsetMinutes(guess, tz);
  let ts = guess - offset * 60000;
  offset = tzOffsetMinutes(ts, tz);
  ts = guess - offset * 60000;
  return ts;
}

function eventTimestamp(ev: { date: string; time: string }): number {
  // Edge fn requests timeZone=15 (Tel Aviv) — convert from Israel wall time.
  const t = ev.time && /^\d{2}:\d{2}$/.test(ev.time) ? ev.time : '23:59';
  return zonedWallClockToUtc(ev.date, t, SOURCE_TZ);
}

// Format a UTC timestamp as HH:MM in the user's local timezone.
function formatLocalTime(utcMs: number): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: USER_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(utcMs));
}

// Local YYYY-MM-DD for an event (may shift to neighbouring day across TZs).
function eventLocalDate(ev: { date: string; time: string }): string {
  const ts = eventTimestamp(ev);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ts));
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'עכשיו';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}ד ${hours}ש`;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ImportanceBulls({ level }: { level: 1 | 2 | 3 }) {
  const color =
    level === 3 ? 'text-[#fda4af]' : level === 2 ? 'text-[#e2b54e]' : 'text-muted-foreground/60';
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

function CountryFlag({ code, name }: { code: string; name?: string }) {
  // Emoji flag from ISO-2; EU has a special block
  const flag =
    code === 'EU'
      ? '🇪🇺'
      : code.length === 2
        ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
        : '🌐';
  return (
    <div className="flex items-center gap-1.5 min-w-[3rem]" title={name}>
      <span className="text-base leading-none">{flag}</span>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase">{code}</span>
    </div>
  );
}

function valueClass(actual: string | null, forecast: string | null) {
  if (!actual || !forecast) return 'text-foreground';
  const a = parseFloat(actual.replace(/[^\d.\-]/g, ''));
  const f = parseFloat(forecast.replace(/[^\d.\-]/g, ''));
  if (isNaN(a) || isNaN(f)) return 'text-foreground';
  if (a > f) return 'text-[#6ee7b7]';
  if (a < f) return 'text-[#fda4af]';
  return 'text-foreground';
}

type ImportanceLevel = 1 | 2 | 3;

function flagEmoji(code: string): string {
  if (code === 'EU') return '🇪🇺';
  if (code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function eventRowKey(event: EconomicEvent): string {
  return [
    event.id,
    event.date,
    event.time,
    event.countryCode,
    event.currency,
    event.event,
  ].join('|');
}

// Identity alone isn't unique — the feed can hand back two rows that agree on
// every identity field but carry different values. Position within the day
// group disambiguates them, so this is what both the React key and the
// "next event" highlight are keyed on.
function eventRenderKey(event: EconomicEvent, indexInDay: number): string {
  return `${eventRowKey(event)}#${indexInDay}`;
}

// The feed sometimes repeats a row verbatim. Identity for de-duplication covers
// every field, so only truly identical rows collapse — two rows that share an
// identity but differ in their values are both kept.
function eventContentKey(event: EconomicEvent): string {
  return [
    eventRowKey(event),
    event.importance,
    event.actual,
    event.forecast,
    event.previous,
  ].join('|');
}

const FILTER_STORAGE_KEY = 'economic-calendar-filters-v1';

interface PersistedFilters {
  importance: ImportanceLevel[];
  countries: string[];
}

function loadPersistedFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { importance: [1, 2, 3], countries: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    const importanceRaw = Array.isArray(parsed.importance) ? parsed.importance : [1, 2, 3];
    const importance = importanceRaw.filter(
      (v): v is ImportanceLevel => v === 1 || v === 2 || v === 3,
    );
    const countries = Array.isArray(parsed.countries)
      ? parsed.countries.filter((c): c is string => typeof c === 'string')
      : [];
    return {
      importance: importance.length > 0 ? importance : [1, 2, 3],
      countries,
    };
  } catch {
    return { importance: [1, 2, 3], countries: [] };
  }
}

export default function EconomicCalendar() {
  const initialFilters = useMemo(loadPersistedFilters, []);

  // Multi-select importance — restored from last session (default: all three)
  const [importanceLevels, setImportanceLevels] = useState<Set<ImportanceLevel>>(
    () => new Set<ImportanceLevel>(initialFilters.importance),
  );
  // Multi-select countries — restored from last session (empty = all)
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(
    () => new Set<string>(initialFilters.countries),
  );
  const [countrySearch, setCountrySearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = useMemo(() => todayStr(), [now]);

  // Persist filter state across reloads / tab switches.
  useEffect(() => {
    try {
      const payload: PersistedFilters = {
        importance: Array.from(importanceLevels),
        countries: Array.from(selectedCountries),
      };
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [importanceLevels, selectedCountries]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ApiResponse>({
    queryKey: ['economic-calendar', 'utc-v2'],
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
  // Key purely by countryCode so the filter is country-based, not currency-based.
  const countryOptions = useMemo(() => {
    if (!data?.events) return [] as { code: string; name: string; count: number }[];
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const ev of data.events) {
      const code = ev.countryCode;
      if (!code) continue;
      const existing = map.get(code);
      if (existing) existing.count += 1;
      else map.set(code, { code, name: ev.country, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data]);

  const filteredCountryOptions = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countryOptions;
    return countryOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [countryOptions, countrySearch]);

  const filtered = useMemo(() => {
    if (!data?.events) return [];

    const normalizedSelectedCountries = new Set(
      Array.from(selectedCountries).map((code) => code.trim().toUpperCase()),
    );

    return data.events.filter((e) => {
      const eventCountryCode = e.countryCode?.trim().toUpperCase() ?? '';
      if (!importanceLevels.has(e.importance)) return false;
      if (normalizedSelectedCountries.size > 0 && !normalizedSelectedCountries.has(eventCountryCode)) {
        return false;
      }
      return true;
    });
  }, [data, importanceLevels, selectedCountries]);

  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    const seen = new Set<string>();

    for (const ev of filtered) {
      // Drop rows the feed repeated verbatim — they'd render as identical
      // duplicate lines.
      const contentKey = eventContentKey(ev);
      if (seen.has(contentKey)) continue;
      seen.add(contentKey);

      // Group by the event's date in the USER's timezone, not the source date.
      // This ensures events that cross midnight (e.g. NY events shown to a TLV
      // user, or TLV events viewed from the US) appear under the correct day.
      const localDate = eventLocalDate(ev);
      if (!map.has(localDate)) map.set(localDate, []);
      map.get(localDate)!.push(ev);
    }

    // Sort each day's events by their actual UTC timestamp so order is correct
    // regardless of the user's timezone.
    for (const list of map.values()) {
      list.sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Find the closest upcoming event (in the future) among the rows actually
  // rendered. Walking the grouped rows rather than `filtered` gives the winner a
  // position, so a single row lights up even when two share an identity — and it
  // can't land on a row that de-duplication dropped.
  const nextEvent = useMemo(() => {
    let best: { key: string; ts: number } | null = null;
    for (const [, events] of grouped) {
      for (let i = 0; i < events.length; i++) {
        const ts = eventTimestamp(events[i]);
        if (!Number.isFinite(ts) || ts <= now) continue;
        if (!best || ts < best.ts) best = { key: eventRenderKey(events[i], i), ts };
      }
    }
    return best;
  }, [grouped, now]);
  const nextEventKey = nextEvent ? nextEvent.key : null;
  const countdownMs = nextEvent ? nextEvent.ts - now : 0;

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
    { v: 2, label: '★★', color: 'text-[#e2b54e]' },
    { v: 3, label: '★★★', color: 'text-[#fda4af]' },
  ];

  const countryButtonLabel =
    selectedCountries.size === 0
      ? 'כל המדינות'
      : selectedCountries.size === 1
        ? (() => {
            const code = Array.from(selectedCountries)[0];
            const opt = countryOptions.find((c) => c.code === code);
            return opt ? `${flagEmoji(opt.code)} ${opt.name}` : code;
          })()
        : `${selectedCountries.size} מדינות`;

  return (
    <Card className="glass-flat rounded-2xl overflow-hidden p-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--lg-border)]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Importance multi-select chips, on the shared tab-rail trough */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground pe-1">חשיבות:</span>
            <div className="aurora-tabs inline-flex items-center gap-1 rounded-xl p-1">
              {importanceOptions.map((opt) => {
                const active = importanceLevels.has(opt.v);
                return (
                  <button
                    key={opt.v}
                    onClick={() => toggleImportance(opt.v)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                      active
                        ? 'aurora-chip aurora-chip-cyan text-foreground'
                        : 'text-muted-foreground/60 hover:text-foreground',
                    )}
                    title={`חשיבות ${opt.v}/3`}
                  >
                    <span className={cn(active ? opt.color : 'opacity-60')}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
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
                <GlobeIcon className="w-3.5 h-3.5" />
                <span>{countryButtonLabel}</span>
                <ChevronDownIcon className="w-3 h-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" dir="rtl">
              <div className="p-2 border-b border-[var(--lg-border)] flex items-center gap-2">
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
                    <CloseIcon className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {filteredCountryOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">לא נמצאו תוצאות</p>
                ) : (
                  filteredCountryOptions.map((c) => {
                    const checked = selectedCountries.has(c.code);
                    return (
                      <button
                        key={c.code}
                        onClick={() => toggleCountry(c.code)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-[rgba(90,200,230,0.08)]',
                          checked && 'bg-[rgba(226,181,78,0.10)]',
                        )}
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span className="text-base leading-none">{flagEmoji(c.code)}</span>
                        <span className="flex-1 text-start truncate text-foreground">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground/70 aurora-mono">{c.count}</span>
                        {checked && <CheckIcon className="w-3 h-3 text-[#e2b54e]" />}
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
          <span className="text-[11px] text-muted-foreground hidden md:inline" title={`שעות מוצגות באזור הזמן שלך: ${USER_TZ}`}>
            🕒 {USER_TZ}
          </span>
          {data?.fetchedAt && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              עודכן {new Date(data.fetchedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={() => refetch()} size="sm" variant="outline" disabled={isFetching}>
            {isFetching ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <RefreshIcon className="w-4 h-4" />}
            רענון
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-[var(--lg-border)]">
        {isLoading && (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        )}

        {isError && (
          <div className="p-8 text-center">
            <AlertIcon className="w-8 h-8 mx-auto text-[#fda4af] mb-2" />
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

        {grouped.map(([date, events]) => {
          const isToday = date === today;
          const currentTimeStr = new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return (
          <section key={date}>
            <header
              className={cn(
                'px-4 py-2 border-b sticky top-0 backdrop-blur-md z-[1] flex items-center justify-between gap-2',
                isToday
                  ? 'bg-[rgba(13,26,26,0.9)] border-[rgba(52,211,153,0.45)]'
                  : 'bg-[rgba(13,23,33,0.85)] border-[var(--lg-border)]',
              )}
            >
              <h3 className={cn('text-sm font-semibold flex items-center gap-2', isToday ? 'text-[#6ee7b7]' : 'text-foreground')}>
                {formatDateHeader(date)}
                {isToday && <Badge variant="success" className="text-[10px] uppercase tracking-wider">היום</Badge>}
              </h3>
              {isToday && (
                <span className="text-[11px] aurora-mono text-[#a7f3d0]/90">
                  עכשיו · {currentTimeStr}
                </span>
              )}
            </header>

            {/* Column headers (desktop only) */}
            <div className="hidden lg:grid grid-cols-[56px_72px_minmax(0,1fr)_70px_70px_70px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-[var(--lg-border)] bg-[rgba(7,13,22,0.4)]">
              <span>שעה</span>
              <span>מדינה</span>
              <span>אירוע</span>
              <span className="text-end">בפועל</span>
              <span className="text-end">תחזית</span>
              <span className="text-end">קודם</span>
            </div>

            <ul className="divide-y divide-[var(--lg-border)]">
              {events.map((ev, i) => {
                const rowKey = eventRenderKey(ev, i);
                const isNext = rowKey === nextEventKey;
                return (
                <li
                  key={rowKey}
                  className={cn(
                    'px-4 py-2.5 transition-colors',
                    isNext
                      ? 'bg-[rgba(52,211,153,0.12)] border-r-2 border-[#34d399] hover:bg-[rgba(52,211,153,0.18)]'
                      : 'hover:bg-[rgba(90,200,230,0.06)]',
                  )}
                >
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[56px_72px_minmax(0,1fr)_70px_70px_70px] gap-3 items-center text-sm">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={cn('text-xs aurora-mono', isNext ? 'text-[#6ee7b7] font-semibold' : 'text-muted-foreground')}>{ev.time ? formatLocalTime(eventTimestamp(ev)) : '—'}</span>
                      {isNext && (
                        <span className="aurora-chip aurora-chip-emerald text-[10px] aurora-mono text-[#6ee7b7] rounded px-1 animate-pulse">
                          {formatCountdown(countdownMs)}
                        </span>
                      )}
                    </div>
                    <CountryFlag code={ev.countryCode} name={ev.country} />
                    <div className="flex items-center gap-2 min-w-0">
                      <ImportanceBulls level={ev.importance} />
                      <span className={cn('truncate', isNext ? 'text-[#a7f3d0] font-semibold' : 'text-foreground')} title={ev.event}>{ev.event}</span>
                      {isNext && (
                        <span className="aurora-chip aurora-chip-emerald text-[9px] uppercase tracking-wider text-[#6ee7b7] rounded px-1.5 py-0.5 shrink-0">הבא</span>
                      )}
                    </div>
                    <span className={cn('text-end aurora-mono text-sm truncate', valueClass(ev.actual, ev.forecast))} title={ev.actual ?? undefined}>
                      {ev.actual ?? '—'}
                    </span>
                    <span className="text-end aurora-mono text-sm text-muted-foreground truncate" title={ev.forecast ?? undefined}>{ev.forecast ?? '—'}</span>
                    <span className="text-end aurora-mono text-sm text-muted-foreground truncate" title={ev.previous ?? undefined}>{ev.previous ?? '—'}</span>
                  </div>

                  {/* Mobile row */}
                  <div className="lg:hidden flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className={cn('text-xs aurora-mono', isNext ? 'text-[#6ee7b7] font-semibold' : 'text-muted-foreground')}>{ev.time ? formatLocalTime(eventTimestamp(ev)) : '—'}</span>
                        {isNext && (
                          <span className="aurora-chip aurora-chip-emerald text-[10px] aurora-mono text-[#6ee7b7] rounded px-1 animate-pulse">
                            {formatCountdown(countdownMs)}
                          </span>
                        )}
                        <CountryFlag code={ev.countryCode} name={ev.country} />
                        <ImportanceBulls level={ev.importance} />
                        {isNext && (
                          <span className="aurora-chip aurora-chip-emerald text-[9px] uppercase tracking-wider text-[#6ee7b7] rounded px-1.5 py-0.5">הבא</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground leading-snug break-words">{ev.event}</p>
                    <div className="flex items-center justify-between text-[11px] aurora-mono pt-1 border-t border-[var(--lg-border)]">
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
                );
              })}
            </ul>
          </section>
          );
        })}
      </div>

      <div className="px-4 py-2 text-[10px] text-muted-foreground text-center border-t border-[var(--lg-border)]">
        נתונים מ-Investing.com
      </div>
    </Card>
  );
}
