import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, Upload, X, Plus } from 'lucide-react';
import { useTrades, type TradeRow } from '@/contexts/TradesContext';
import { useStrategies } from '@/contexts/StrategiesContext';
import { useTags } from '@/contexts/TagsContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatBytes, uploadErrorText } from '@/lib/upload';
import { withTimeout, uploadTimeoutMs } from '@/lib/withTimeout';

interface Props {
  trade: TradeRow | null;
  onClose: () => void;
}

// The trade-images bucket carries no file_size_limit of its own, so uploads are
// bounded by Supabase's project-wide global limit (50 MB by default). This guard
// mirrors that so an oversize screenshot fails instantly with a readable message
// rather than as an opaque network error after the bytes are already on the wire.
const MAX_IMAGE_BYTES = 50 * 1024 ** 2; // 50 MB

const fmt = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function TradeDetailPanel({ trade, onClose }: Props) {
  const { user } = useAuth();
  const {
    isReadOnly, updateTradeNotes, updateTradeStrategy, updateTradeImages,
    updateTradeTags, updateTradeDemo, updateMentorFeedback,
  } = useTrades();
  const { strategies } = useStrategies();
  const { tagNames, createTag } = useTags();

  const [notes, setNotes] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [mentorRating, setMentorRating] = useState<number>(0);
  const [mentorNotes, setMentorNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  const isMentorView = isReadOnly;

  useEffect(() => {
    setNotes(trade?.notes ?? '');
    setMentorRating(trade?.mentor_rating ?? 0);
    setMentorNotes(trade?.mentor_notes ?? '');
  }, [trade?.id]);

  // Autosave notes (debounced)
  useEffect(() => {
    if (!trade || isReadOnly) return;
    if ((trade.notes ?? '') === notes) return;
    const t = setTimeout(() => updateTradeNotes(trade.id, notes), 600);
    return () => clearTimeout(t);
  }, [notes, trade, isReadOnly, updateTradeNotes]);

  if (!trade) return null;

  const legs = (trade.option_legs as Array<{ right: string; strike: number; side: string; quantity: number; open_price: number | null; close_price: number | null; pnl: number | null }> | null) ?? null;

  const addTag = async (raw: string) => {
    const v = raw.trim().replace(/^#/, '');
    if (!v) return;
    if (!tagNames.includes(v)) await createTag(v);
    const next = Array.from(new Set([...(trade.tags ?? []), v]));
    await updateTradeTags(trade.id, next);
    setTagInput('');
  };
  const removeTag = (t: string) => updateTradeTags(trade.id, (trade.tags ?? []).filter((x) => x !== t));

  // Every await below can reject — a dropped connection, a CORS failure, or the
  // proxy's 413 when the file is oversize (that one reaches the browser as an
  // opaque network failure). Clearing the busy flag in a `finally` is what keeps
  // a rejection from leaving the spinner turning forever with no way out.
  const onUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    const urls: string[] = [];
    try {
      for (const f of Array.from(files)) {
        try {
          if (f.size > MAX_IMAGE_BYTES) {
            throw new Error(
              `הקובץ גדול מדי (${formatBytes(f.size)}). הגודל המרבי הוא ${formatBytes(MAX_IMAGE_BYTES)}.`,
            );
          }
          const path = `${user.id}/${trade.id}/${crypto.randomUUID()}-${f.name}`;
          // `finally` cannot rescue a promise that never settles; the watchdog is
          // what forces a stalled connection to eventually reject.
          const { error } = await withTimeout(
            supabase.storage.from('trade-images').upload(path, f),
            uploadTimeoutMs(f.size),
            'ההעלאה',
          );
          if (error) throw error;
          urls.push(path);
        } catch (err) {
          // One bad file shouldn't abandon the rest of the selection.
          toast({ title: 'שגיאה בהעלאה', description: uploadErrorText(err), variant: 'destructive' });
        }
      }
      if (urls.length) await updateTradeImages(trade.id, [...(trade.images ?? []), ...urls]);
    } catch (err) {
      toast({ title: 'שגיאה בשמירת התמונות', description: uploadErrorText(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (path: string) => {
    await supabase.storage.from('trade-images').remove([path]);
    await updateTradeImages(trade.id, (trade.images ?? []).filter((x) => x !== path));
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {trade.symbol}
            <Badge variant={trade.side === 'long' ? 'default' : 'secondary'} className="text-xs">
              {trade.side === 'long' ? 'לונג' : 'שורט'}
            </Badge>
            {trade.is_demo && <Badge variant="outline">דמו</Badge>}
            {trade.option_strategy && <Badge variant="outline">{trade.option_strategy}</Badge>}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <Card className="p-3 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">כמות:</span> {fmt(Number(trade.quantity))}</div>
            <div><span className="text-muted-foreground">P&L:</span>
              <span className={Number(trade.net_pnl) > 0 ? 'text-emerald-500' : Number(trade.net_pnl) < 0 ? 'text-destructive' : ''}>
                {' '}${fmt(trade.net_pnl as unknown as number)}
              </span>
            </div>
            <div><span className="text-muted-foreground">כניסה:</span> ${fmt(trade.entry_price as unknown as number)}</div>
            <div><span className="text-muted-foreground">יציאה:</span> ${fmt(trade.exit_price as unknown as number)}</div>
            <div><span className="text-muted-foreground">תאריך כניסה:</span> {trade.entry_date ? new Date(trade.entry_date).toLocaleString('he-IL') : '—'}</div>
            <div><span className="text-muted-foreground">תאריך יציאה:</span> {trade.exit_date ? new Date(trade.exit_date).toLocaleString('he-IL') : '—'}</div>
            <div><span className="text-muted-foreground">עמלה:</span> ${fmt(trade.commission as unknown as number)}</div>
            <div><span className="text-muted-foreground">סטטוס:</span> {trade.status}</div>
          </Card>

          {legs && legs.length > 0 && (
            <Card className="p-3">
              <h4 className="text-sm font-medium mb-2">פירוט רגליים (Legs)</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>זכות</TableHead><TableHead>מימוש</TableHead><TableHead>צד</TableHead>
                    <TableHead>כמות</TableHead><TableHead>פתיחה</TableHead><TableHead>סגירה</TableHead><TableHead>P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {legs.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.right === 'C' ? 'Call' : 'Put'}</TableCell>
                      <TableCell>{fmt(l.strike)}</TableCell>
                      <TableCell>{l.side === 'long' ? 'לונג' : 'שורט'}</TableCell>
                      <TableCell>{fmt(l.quantity)}</TableCell>
                      <TableCell>${fmt(l.open_price)}</TableCell>
                      <TableCell>${fmt(l.close_price)}</TableCell>
                      <TableCell className={Number(l.pnl) > 0 ? 'text-emerald-500' : Number(l.pnl) < 0 ? 'text-destructive' : ''}>
                        ${fmt(l.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {!isMentorView && (
            <>
              <div className="space-y-1">
                <Label>אסטרטגיה</Label>
                <Select
                  value={trade.strategy_id ?? '__none'}
                  onValueChange={(v) => updateTradeStrategy(trade.id, v === '__none' ? null : v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— ללא —</SelectItem>
                    {strategies.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>תגיות</Label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {(trade.tags ?? []).map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      #{t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(t)} />
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    placeholder="הוסף תגית"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                    list="all-tags" dir="auto"
                  />
                  <datalist id="all-tags">
                    {tagNames.map((t) => <option key={t} value={t} />)}
                  </datalist>
                  <Button size="sm" variant="outline" onClick={() => addTag(tagInput)}><Plus className="h-3 w-3" /></Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={trade.is_demo} onCheckedChange={(v) => updateTradeDemo(trade.id, v)} />
                <Label>סמן כעסקת דמו</Label>
              </div>

              <div className="space-y-1">
                <Label>הערות</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} dir="auto" placeholder="הערות העסקה..." />
              </div>

              <div className="space-y-1">
                <Label>צילומי מסך</Label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {(trade.images ?? []).map((p) => {
                    const { data } = supabase.storage.from('trade-images').getPublicUrl(p);
                    return (
                      <div key={p} className="relative group">
                        <img src={data.publicUrl} alt="" className="w-full h-20 object-cover rounded border border-border" />
                        <button
                          onClick={() => removeImage(p)}
                          className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded p-0.5 opacity-0 group-hover:opacity-100"
                        ><X className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                </div>
                <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded p-3 cursor-pointer hover:bg-accent text-sm">
                  <Upload className="h-4 w-4" />
                  {uploading ? 'מעלה...' : 'העלה תמונות'}
                  <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files)} />
                </label>
              </div>
            </>
          )}

          {/* Mentor feedback section */}
          <Card className="p-3 space-y-2 bg-accent/20">
            <h4 className="text-sm font-medium">משוב מנטור</h4>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} disabled={!isMentorView}
                  onClick={() => isMentorView && updateMentorFeedback(trade.id, n, mentorNotes)}
                >
                  <Star className={`h-5 w-5 ${n <= (mentorRating ?? 0) ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
                </button>
              ))}
            </div>
            {isMentorView ? (
              <Textarea
                value={mentorNotes} onChange={(e) => setMentorNotes(e.target.value)}
                onBlur={() => updateMentorFeedback(trade.id, mentorRating || null, mentorNotes || null)}
                rows={3} dir="auto" placeholder="הערות מנטור..."
              />
            ) : (
              <div className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[3rem]">
                {trade.mentor_notes || 'אין הערות מהמנטור'}
              </div>
            )}
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
