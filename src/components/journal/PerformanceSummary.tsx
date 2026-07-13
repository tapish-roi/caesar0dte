import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { TradeRow } from '@/contexts/TradesContext';
import { TrendingUp, TrendingDown, Trophy, Activity, Target, Hash, Clock, Award } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

interface Props {
  trades: TradeRow[];
  showDemo: boolean;
}

export default function PerformanceSummary({ trades, showDemo }: Props) {
  const stats = useMemo(() => {
    const t = trades.filter((x) => (showDemo ? true : !x.is_demo));
    if (!t.length) return null;
    const closed = t.filter((x) => x.status === 'closed' && x.net_pnl != null);
    const wins = closed.filter((x) => Number(x.net_pnl) > 0);
    const losses = closed.filter((x) => Number(x.net_pnl) < 0);
    const totalPnl = closed.reduce((s, x) => s + Number(x.net_pnl ?? 0), 0);
    const winSum = wins.reduce((s, x) => s + Number(x.net_pnl ?? 0), 0);
    const lossSum = losses.reduce((s, x) => s + Number(x.net_pnl ?? 0), 0);
    const avgWin = wins.length ? winSum / wins.length : 0;
    const avgLoss = losses.length ? lossSum / losses.length : 0;
    const profitFactor = lossSum < 0 ? winSum / Math.abs(lossSum) : winSum > 0 ? Infinity : 0;
    // Win rate over decisive trades only — breakeven (net_pnl === 0) trades don't
    // belong in the denominator, or a strategy that never lost can still show <100%.
    const decisive = wins.length + losses.length;
    const winRate = decisive ? wins.length / decisive : 0;
    const best = closed.reduce((b, x) => (Number(x.net_pnl) > Number(b?.net_pnl ?? -Infinity) ? x : b), closed[0]);
    const worst = closed.reduce((b, x) => (Number(x.net_pnl) < Number(b?.net_pnl ?? Infinity) ? x : b), closed[0]);

    // Avg time in trade — only trades with both timestamps
    const timed = closed.filter((x) => x.entry_date && x.exit_date);
    const avgMs = timed.length
      ? timed.reduce((s, x) => s + (new Date(x.exit_date!).getTime() - new Date(x.entry_date!).getTime()), 0) / timed.length
      : 0;

    // Best strategy
    const byStrat = new Map<string, number>();
    for (const x of closed) {
      const k = x.strategy_id ?? '__none';
      byStrat.set(k, (byStrat.get(k) ?? 0) + Number(x.net_pnl ?? 0));
    }
    const bestStratEntry = [...byStrat.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      total: t.length, closed: closed.length, wins: wins.length, losses: losses.length,
      winRate, totalPnl, avgWin, avgLoss, profitFactor,
      best: best?.net_pnl ?? 0, worst: worst?.net_pnl ?? 0,
      avgMs, bestStratPnl: bestStratEntry?.[1] ?? 0, bestStratId: bestStratEntry?.[0] ?? null,
    };
  }, [trades, showDemo]);

  if (!stats) {
    return (
      <Card className="p-8 text-center text-muted-foreground" dir="rtl">
        ייבא עסקאות כדי לראות סטטיסטיקה
      </Card>
    );
  }

  const fmtDuration = (ms: number) => {
    if (!ms) return '—';
    const h = Math.floor(ms / 3_600_000);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  };

  const items = [
    { label: 'סה״כ עסקאות', value: String(stats.total), icon: Hash, tone: 'text-foreground' },
    { label: 'אחוז הצלחה', value: pct(stats.winRate), icon: Target, tone: stats.winRate >= 0.5 ? 'text-emerald-500' : 'text-destructive' },
    { label: 'P&L נטו', value: fmt(stats.totalPnl), icon: TrendingUp, tone: stats.totalPnl >= 0 ? 'text-emerald-500' : 'text-destructive' },
    { label: 'רווח ממוצע', value: fmt(stats.avgWin), icon: TrendingUp, tone: 'text-emerald-500' },
    { label: 'הפסד ממוצע', value: fmt(stats.avgLoss), icon: TrendingDown, tone: 'text-destructive' },
    { label: 'Profit Factor', value: stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2), icon: Activity, tone: 'text-foreground' },
    { label: 'עסקה הטובה ביותר', value: fmt(Number(stats.best)), icon: Trophy, tone: 'text-emerald-500' },
    { label: 'עסקה הגרועה ביותר', value: fmt(Number(stats.worst)), icon: TrendingDown, tone: 'text-destructive' },
    { label: 'אסטרטגיה מובילה', value: fmt(stats.bestStratPnl), icon: Award, tone: stats.bestStratPnl >= 0 ? 'text-emerald-500' : 'text-destructive' },
    { label: 'זמן ממוצע בעסקה', value: fmtDuration(stats.avgMs), icon: Clock, tone: 'text-foreground' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" dir="rtl">
      {items.map((it) => (
        <Card key={it.label} className="p-4 bg-card/60 backdrop-blur border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{it.label}</span>
            <it.icon className={`h-4 w-4 ${it.tone}`} />
          </div>
          <div className={`text-lg font-semibold ${it.tone}`}>{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
