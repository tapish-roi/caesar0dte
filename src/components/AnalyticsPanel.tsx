import { useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Zap, BarChart3, CalendarDays } from 'lucide-react';

interface AnalyticsTrade {
  net_pnl: number | null;
  exit_date: string | null;
  entry_date: string | null;
  exit_price: number | null;
  status: string;
  is_demo: boolean;
  strategy_id: string | null;
}

interface Strategy { id: string; r_amount: number | null; }

interface Props {
  trades: AnalyticsTrade[];
  strategies: Strategy[];
}

const fmtMoney = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function AnalyticsPanel({ trades, strategies }: Props) {
  const closed = useMemo(
    () => trades
      .filter(t => !t.is_demo && t.exit_price != null && t.exit_date && t.net_pnl != null)
      .sort((a, b) => (a.exit_date ?? '').localeCompare(b.exit_date ?? '')),
    [trades],
  );

  // ── Equity curve ───────────────────────────────────────────────────────────
  const equityCurve = useMemo(() => {
    let cum = 0;
    return closed.map(t => {
      cum += Number(t.net_pnl);
      return {
        date: t.exit_date!.slice(0, 10),
        equity: Number(cum.toFixed(2)),
        pnl: Number(t.net_pnl),
      };
    });
  }, [closed]);

  // ── Headline stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const wins = closed.filter(t => Number(t.net_pnl) > 0);
    const losses = closed.filter(t => Number(t.net_pnl) < 0);
    const grossWin = wins.reduce((s, t) => s + Number(t.net_pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.net_pnl), 0));
    const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;
    const totalPnl = closed.reduce((s, t) => s + Number(t.net_pnl), 0);
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const expectancy = closed.length ? totalPnl / closed.length : 0;

    // Average R: only for trades with a strategy that defines r_amount
    const rValues: number[] = [];
    for (const t of closed) {
      const strat = strategies.find(s => s.id === t.strategy_id);
      if (strat?.r_amount && strat.r_amount > 0) {
        rValues.push(Number(t.net_pnl) / strat.r_amount);
      }
    }
    const avgR = rValues.length ? rValues.reduce((s, v) => s + v, 0) / rValues.length : null;

    // Streak
    let bestWin = 0, worstLoss = 0, currentWin = 0, currentLoss = 0;
    for (const t of closed) {
      const v = Number(t.net_pnl);
      if (v > 0) { currentWin++; currentLoss = 0; bestWin = Math.max(bestWin, currentWin); }
      else if (v < 0) { currentLoss++; currentWin = 0; worstLoss = Math.max(worstLoss, currentLoss); }
    }

    return {
      total: closed.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      profitFactor,
      totalPnl,
      avgWin,
      avgLoss,
      expectancy,
      avgR,
      bestWin,
      worstLoss,
      grossWin,
      grossLoss,
    };
  }, [closed, strategies]);

  // ── P&L histogram ──────────────────────────────────────────────────────────
  const histogram = useMemo(() => {
    if (closed.length === 0) return [];
    const values = closed.map(t => Number(t.net_pnl));
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [{ label: fmtMoney(min), count: values.length, mid: min }];
    const buckets = 10;
    const step = (max - min) / buckets;
    const bins = Array.from({ length: buckets }, (_, i) => {
      const lo = min + step * i;
      const hi = i === buckets - 1 ? max + 1e-9 : lo + step;
      const mid = (lo + hi) / 2;
      return { lo, hi, mid, count: 0, label: fmtMoney(Math.round(mid)) };
    });
    for (const v of values) {
      const idx = Math.min(buckets - 1, Math.floor((v - min) / step));
      bins[idx].count++;
    }
    return bins;
  }, [closed]);

  // ── Monthly P&L heatmap (current month + previous 5 months) ────────────────
  const heatmaps = useMemo(() => {
    if (closed.length === 0) return [];
    // Group P&L by date (YYYY-MM-DD)
    const byDay = new Map<string, number>();
    for (const t of closed) {
      const k = t.exit_date!.slice(0, 10);
      byDay.set(k, (byDay.get(k) ?? 0) + Number(t.net_pnl));
    }

    // Determine months to display: last 6 months containing data
    const monthSet = new Set<string>();
    for (const k of byDay.keys()) monthSet.add(k.slice(0, 7));
    const months = Array.from(monthSet).sort().slice(-6).reverse();

    return months.map(mk => {
      const start = parseISO(`${mk}-01`);
      const end = endOfMonth(start);
      const days = eachDayOfInterval({ start, end });
      // Build a 6×7 grid (Sun-first to match Hebrew calendar layout)
      const padStart = getDay(start); // 0=Sun
      const cells: { date: Date | null; pnl: number | null }[] = [];
      for (let i = 0; i < padStart; i++) cells.push({ date: null, pnl: null });
      for (const d of days) {
        const k = format(d, 'yyyy-MM-dd');
        const pnl = byDay.has(k) ? byDay.get(k)! : null;
        cells.push({ date: d, pnl });
      }
      while (cells.length % 7 !== 0) cells.push({ date: null, pnl: null });

      const monthPnl = days.reduce((s, d) => {
        const k = format(d, 'yyyy-MM-dd');
        return s + (byDay.get(k) ?? 0);
      }, 0);

      return {
        key: mk,
        label: format(start, 'MMMM yyyy', { locale: he }),
        cells,
        monthPnl,
      };
    });
  }, [closed]);

  // Color scaling for heatmap
  const heatmapAbsMax = useMemo(() => {
    let max = 0;
    for (const m of heatmaps) for (const c of m.cells) if (c.pnl != null) max = Math.max(max, Math.abs(c.pnl));
    return max || 1;
  }, [heatmaps]);

  if (closed.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">אין מספיק נתונים לאנליטיקה</p>
        <p className="text-xs mt-1">סגור עסקאות כדי לראות גרפים וסטטיסטיקות</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={<Zap />}
          label="P&L נטו כולל"
          value={fmtMoney(stats.totalPnl)}
          accent={stats.totalPnl >= 0 ? 'up' : 'down'}
        />
        <Kpi
          icon={<Target />}
          label="אחוז הצלחה"
          value={`${stats.winRate.toFixed(1)}%`}
          sub={`${closed.filter(t => Number(t.net_pnl) > 0).length}W / ${closed.filter(t => Number(t.net_pnl) < 0).length}L`}
        />
        <Kpi
          icon={<TrendingUp />}
          label="Profit Factor"
          value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
          sub={`Win $${stats.grossWin.toFixed(0)} / Loss $${stats.grossLoss.toFixed(0)}`}
          accent={stats.profitFactor >= 1 ? 'up' : 'down'}
        />
        <Kpi
          icon={<TrendingDown />}
          label="Avg R"
          value={stats.avgR == null ? '—' : `${stats.avgR.toFixed(2)}R`}
          sub={stats.avgR == null ? 'הגדר R לאסטרטגיות' : 'ממוצע על כל הסגורות'}
          accent={stats.avgR == null ? undefined : stats.avgR >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Mini label="ממוצע רווח" value={fmtMoney(stats.avgWin)} accent="up" />
        <Mini label="ממוצע הפסד" value={fmtMoney(-stats.avgLoss)} accent="down" />
        <Mini label="Expectancy / עסקה" value={fmtMoney(stats.expectancy)} accent={stats.expectancy >= 0 ? 'up' : 'down'} />
        <Mini label="רצף רווח / הפסד" value={`${stats.bestWin}W / ${stats.worstLoss}L`} />
      </div>

      {/* Equity curve */}
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">עקומת הון</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => fmtMoney(v)} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtMoney(v)}
              />
              <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#eqGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Histogram */}
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">התפלגות P&L</h3>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histogram.map((b, i) => (
                  <Cell key={i} fill={b.mid >= 0 ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly heatmaps */}
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">לוח P&L חודשי</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {heatmaps.map(m => (
            <MonthHeatmap key={m.key} {...m} absMax={heatmapAbsMax} />
          ))}
        </div>
        <Legend />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: 'up' | 'down';
}) {
  const accentCls = accent === 'up' ? 'text-emerald-500' : accent === 'down' ? 'text-red-500' : 'text-foreground';
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <span className="text-muted-foreground [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>
      </div>
      <p className={`text-xl font-bold ${accentCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: 'up' | 'down' }) {
  const accentCls = accent === 'up' ? 'text-emerald-500' : accent === 'down' ? 'text-red-500' : 'text-foreground';
  return (
    <div className="rounded-lg bg-muted/40 border border-border p-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${accentCls}`}>{value}</p>
    </div>
  );
}

function MonthHeatmap({
  label, cells, monthPnl, absMax,
}: {
  label: string; cells: { date: Date | null; pnl: number | null }[]; monthPnl: number; absMax: number;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className={`text-xs font-bold ${monthPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {fmtMoney(monthPnl)}
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(d => (
          <div key={d} className="text-[10px] text-center text-muted-foreground">{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} className="aspect-square" />;
          const intensity = c.pnl == null ? 0 : Math.min(1, Math.abs(c.pnl) / absMax);
          const bg = c.pnl == null
            ? 'hsl(var(--muted) / 0.3)'
            : c.pnl >= 0
              ? `hsl(142 71% 45% / ${0.15 + intensity * 0.7})`
              : `hsl(0 72% 51% / ${0.15 + intensity * 0.7})`;
          const textCls = c.pnl == null
            ? 'text-muted-foreground/40'
            : intensity > 0.5 ? 'text-white' : 'text-foreground';
          return (
            <div
              key={i}
              className={`aspect-square rounded text-[9px] flex items-center justify-center font-medium ${textCls}`}
              style={{ background: bg }}
              title={c.pnl == null ? format(c.date, 'd MMM') : `${format(c.date, 'd MMM')} · ${fmtMoney(c.pnl)}`}
            >
              {c.date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-muted-foreground">
      <span>הפסד</span>
      <div className="flex gap-0.5">
        {[0.85, 0.6, 0.35, 0.15].map(o => (
          <div key={o} className="w-3 h-3 rounded" style={{ background: `hsl(0 72% 51% / ${o})` }} />
        ))}
        <div className="w-3 h-3 rounded bg-muted/30" />
        {[0.15, 0.35, 0.6, 0.85].map(o => (
          <div key={o} className="w-3 h-3 rounded" style={{ background: `hsl(142 71% 45% / ${o})` }} />
        ))}
      </div>
      <span>רווח</span>
    </div>
  );
}
