import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { TradeRow } from '@/contexts/TradesContext';
import type { Strategy } from '@/contexts/StrategiesContext';

interface Props {
  trades: TradeRow[];
  strategies: Strategy[];
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(var(--accent))', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];

export default function JournalCharts({ trades, strategies }: Props) {
  const closed = useMemo(() => trades.filter((t) => t.status === 'closed' && t.net_pnl != null && t.entry_date)
    .sort((a, b) => (a.entry_date ?? '').localeCompare(b.entry_date ?? '')), [trades]);

  const equityCurve = useMemo(() => {
    let cum = 0;
    return closed.map((t, i) => {
      cum += Number(t.net_pnl ?? 0);
      return { i, date: t.entry_date?.slice(0, 10) ?? `#${i}`, equity: Number(cum.toFixed(2)) };
    });
  }, [closed]);

  const histogram = useMemo(() => {
    if (!closed.length) return [];
    const pnls = closed.map((t) => Number(t.net_pnl ?? 0));
    const min = Math.min(...pnls), max = Math.max(...pnls);
    const buckets = 12;
    const step = (max - min) / buckets || 1;
    const bins = Array.from({ length: buckets }, (_, i) => ({
      range: `${(min + i * step).toFixed(0)}`,
      count: 0,
      lo: min + i * step,
      hi: min + (i + 1) * step,
    }));
    pnls.forEach((p) => {
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((p - min) / step)));
      bins[idx].count++;
    });
    return bins;
  }, [closed]);

  const winLoss = useMemo(() => {
    const wins = closed.filter((t) => Number(t.net_pnl) > 0).length;
    const losses = closed.filter((t) => Number(t.net_pnl) < 0).length;
    const flat = closed.length - wins - losses;
    return [
      { name: 'רווח', value: wins }, { name: 'הפסד', value: losses }, { name: 'נייטרלי', value: flat },
    ].filter((x) => x.value > 0);
  }, [closed]);

  const byStrategy = useMemo(() => {
    const map = new Map<string, number>();
    closed.forEach((t) => {
      const k = t.strategy_id ?? '—';
      map.set(k, (map.get(k) ?? 0) + Number(t.net_pnl ?? 0));
    });
    return [...map.entries()].map(([id, pnl]) => ({
      name: id === '—' ? 'ללא' : (strategies.find((s) => s.id === id)?.name ?? id.slice(0, 6)),
      pnl: Number(pnl.toFixed(2)),
    }));
  }, [closed, strategies]);

  const bySymbol = useMemo(() => {
    const map = new Map<string, number>();
    closed.forEach((t) => map.set(t.symbol, (map.get(t.symbol) ?? 0) + Number(t.net_pnl ?? 0)));
    return [...map.entries()]
      .map(([name, pnl]) => ({ name, pnl: Number(pnl.toFixed(2)) }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 10);
  }, [closed]);

  if (!closed.length) {
    return <Card className="p-8 text-center text-muted-foreground" dir="rtl">אין מספיק נתונים סגורים להצגת גרפים</Card>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" dir="rtl">
      <Card className="p-4 bg-card/60 backdrop-blur">
        <h3 className="text-sm font-medium mb-2">עקומת הון מצטברת</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={equityCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 bg-card/60 backdrop-blur">
        <h3 className="text-sm font-medium mb-2">היסטוגרמת P&L</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={histogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="range" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="count">
              {histogram.map((b) => (
                <Cell key={b.range} fill={b.lo >= 0 ? 'hsl(142 76% 45%)' : 'hsl(var(--destructive))'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 bg-card/60 backdrop-blur">
        <h3 className="text-sm font-medium mb-2">פילוח רווח/הפסד</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={winLoss} dataKey="value" nameKey="name" outerRadius={80} label>
              {winLoss.map((w, i) => <Cell key={w.name} fill={COLORS[i]} />)}
            </Pie>
            <Legend />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 bg-card/60 backdrop-blur">
        <h3 className="text-sm font-medium mb-2">P&L לפי אסטרטגיה</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={byStrategy}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="pnl">
              {byStrategy.map((d) => <Cell key={d.name} fill={d.pnl >= 0 ? 'hsl(142 76% 45%)' : 'hsl(var(--destructive))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 bg-card/60 backdrop-blur lg:col-span-2">
        <h3 className="text-sm font-medium mb-2">P&L לפי סימול (Top 10)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bySymbol}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="pnl">
              {bySymbol.map((d) => <Cell key={d.name} fill={d.pnl >= 0 ? 'hsl(142 76% 45%)' : 'hsl(var(--destructive))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
