import { useState, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import PerformanceSummary from '@/components/journal/PerformanceSummary';
import JournalFilters, { applyFilters, emptyFilters, type JournalFilterState } from '@/components/journal/JournalFilters';
import JournalCharts from '@/components/journal/JournalCharts';
import AdvancedTradesTable from '@/components/journal/AdvancedTradesTable';
import TradeDetailPanel from '@/components/journal/TradeDetailPanel';
import TradeImportModal from '@/components/journal/TradeImportModal';
import StrategyManager from '@/components/journal/StrategyManager';
import TrashBinModal from '@/components/journal/TrashBinModal';
import ClearAllConfirmModal from '@/components/journal/ClearAllConfirmModal';
import { TradesProvider, useTrades, type TradeRow } from '@/contexts/TradesContext';
import { StrategiesProvider, useStrategies } from '@/contexts/StrategiesContext';
import { TagsProvider, useTags } from '@/contexts/TagsContext';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Settings, BarChart3, EyeOff, Eye } from 'lucide-react';

function JournalContent() {
  const { trades, isReadOnly } = useTrades();
  const { strategies } = useStrategies();
  const { tagNames } = useTags();

  const [filters, setFilters] = useState<JournalFilterState>(emptyFilters);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [activeTrade, setActiveTrade] = useState<TradeRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [stratOpen, setStratOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const filtered = useMemo(() => applyFilters(trades, filters), [trades, filters]);
  const { deleteTrades, bulkUpdateTradeTags } = useTrades();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">יומן מסחר</h1>
          <p className="text-sm text-muted-foreground">ניהול, ניתוח ותיעוד עסקאות</p>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-1">
            <Button onClick={() => setImportOpen(true)} className="gap-1"><Upload className="h-4 w-4" /> ייבא</Button>
            <Button variant="outline" onClick={() => setStratOpen(true)} className="gap-1"><Settings className="h-4 w-4" /> אסטרטגיות</Button>
            <Button variant="outline" onClick={() => setTrashOpen(true)} className="gap-1"><Trash2 className="h-4 w-4" /> פח</Button>
            <Button variant="outline" onClick={() => setClearOpen(true)} className="gap-1 text-destructive"><Trash2 className="h-4 w-4" /> מחק הכל</Button>
          </div>
        )}
      </div>

      <PerformanceSummary trades={filtered} showDemo={filters.showDemo} />

      <JournalFilters trades={trades} strategies={strategies} allTags={tagNames} filters={filters} onChange={setFilters} />

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setShowAnalytics((v) => !v)} className="gap-1">
          {showAnalytics ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <BarChart3 className="h-4 w-4" />
          {showAnalytics ? 'הסתר ניתוחים' : 'הצג ניתוחים'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {filtered.length} עסקאות (סוננו מתוך {trades.length})
        </span>
      </div>

      {showAnalytics && <JournalCharts trades={filtered} strategies={strategies} />}

      <AdvancedTradesTable
        trades={filtered}
        strategies={strategies}
        isReadOnly={isReadOnly}
        onRowClick={setActiveTrade}
        onBulkDelete={deleteTrades}
        onBulkAddTags={(ids, tags) => bulkUpdateTradeTags(ids, tags, 'add')}
        onOpenImport={() => setImportOpen(true)}
      />

      <TradeDetailPanel trade={activeTrade} onClose={() => setActiveTrade(null)} />
      <TradeImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <StrategyManager open={stratOpen} onClose={() => setStratOpen(false)} />
      <TrashBinModal open={trashOpen} onClose={() => setTrashOpen(false)} />
      <ClearAllConfirmModal open={clearOpen} onClose={() => setClearOpen(false)} />
    </div>
  );
}

export default function JournalPage() {
  return (
    <DashboardLayout>
      <TradesProvider>
        <StrategiesProvider>
          <TagsProvider>
            <JournalContent />
          </TagsProvider>
        </StrategiesProvider>
      </TradesProvider>
    </DashboardLayout>
  );
}
